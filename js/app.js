/* ============================================================
   Smart Maidani — field GIS data collection
   Feature-class model · user-defined layers & attributes
   Symbology · coordinate systems (proj4) · auto Z-elevation
   ============================================================ */
const App = {
  state: {
    user: null,                 // { name, role }
    projects: [], layers: [], records: [],
    project: null, activeLayer: null,
    map: null, basemaps: null, activeBasemap: 'satellite',
    layerGroups: {},            // layerId -> L.layerGroup
    gpsLayer: null, lastFix: null, watchId: null,
    draft: null, placing: null, draw: null,
    editGeom: null,             // { record, layer } when editing geometry on map
  },

  async init() {
    this.state.user = await DB.get('user', 'profile');
    this.state.projects = await DB.all('projects');
    this.state.layers = await DB.all('layers');
    this.state.records = await DB.all('records');
    this.buildMap();
    this.wireChrome();
    this.wireNet();
    if (!this.state.user) { this.showWelcome(); return; }
    const lastId = localStorage.getItem('sm_project');
    const last = this.state.projects.find((p) => p.id === lastId);
    if (last) this.setProject(last); else this.rootNav(this.openProjectPicker);
  },

  /* ============================================================
     First-run welcome + registration
     ============================================================ */
  showWelcome() {
    const body = `
      <div style="text-align:center;padding:8px 4px 4px">
        <div class="brand-logo-lg">${LOGO(64)}</div>
        <h1 class="welcome-title">Smart Maidani</h1>
        <p class="welcome-sub">Field GIS data collection — build your own layers, capture anywhere, export for GIS.</p>
      </div>
      <div class="field"><label class="lbl">Your name <span class="req">*</span></label><input class="inp" id="regName" placeholder="e.g. Ahmed Khan" /></div>
      <div class="field"><label class="lbl">Your role <span class="req">*</span></label>
        <select class="sel" id="regRole">
          <option value="">Select role…</option>
          <option>Surveyor</option><option>Field Technician</option><option>GIS Specialist</option>
          <option>Engineer</option><option>Inspector</option><option>Team Lead</option><option>Other</option>
        </select></div>
      <div class="field" id="regOtherWrap" style="display:none"><label class="lbl">Specify role</label><input class="inp" id="regOther" placeholder="Your role" /></div>`;
    this.openSheet('Welcome', body, `<button class="btn btn-primary btn-block btn-lg" id="regSave">${icon('check', 17)} Get started</button>`, true);
    document.getElementById('regRole').onchange = (e) => { document.getElementById('regOtherWrap').style.display = e.target.value === 'Other' ? 'block' : 'none'; };
    document.getElementById('regSave').onclick = async () => {
      const name = document.getElementById('regName').value.trim();
      let role = document.getElementById('regRole').value;
      if (role === 'Other') role = document.getElementById('regOther').value.trim() || 'Other';
      if (!name) { this.toast('Enter your name', 'err'); return; }
      if (!role) { this.toast('Select your role', 'err'); return; }
      this.state.user = { key: 'profile', name, role, registeredAt: nowISO() };
      await DB.put('user', this.state.user);
      this.toast(`Welcome, ${name}`, 'ok');
      this.rootNav(this.openProjectPicker);
    };
    setTimeout(() => document.getElementById('regName').focus(), 300);
  },

  /* ============================================================
     Map
     ============================================================ */
  buildMap() {
    if (typeof L === 'undefined') {
      document.getElementById('map').innerHTML = `<div class="map-msg"><div><div class="t">Map needs one online load</div><div class="d">Connect to the internet once and reopen — the map then works offline afterward.</div></div></div>`;
      return;
    }
    const map = L.map('map', { zoomControl: false, attributionControl: true }).setView([24.4539, 54.3773], 12);
    map.attributionControl.setPrefix(false);
    const esriSat = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', { maxZoom: 19, attribution: 'Esri' });
    const esriLabels = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}', { maxZoom: 19 });
    const streets = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, attribution: '© OpenStreetMap' });
    const topo = L.tileLayer('https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png', { maxZoom: 17, attribution: '© OpenTopoMap' });
    this.state.basemaps = { satellite: L.layerGroup([esriSat, esriLabels]), streets: L.layerGroup([streets]), topographic: L.layerGroup([topo]) };
    this.state.activeBasemap = localStorage.getItem('sm_basemap') || 'satellite';
    if (!this.state.basemaps[this.state.activeBasemap]) this.state.activeBasemap = 'satellite';
    this.state.basemaps[this.state.activeBasemap].addTo(map);
    this.state.map = map;
    this.state.gpsLayer = L.layerGroup().addTo(map);
    map.on('click', (e) => this.onMapClick(e));
    map.on('dragstart', () => { if (this.state.follow) { this.state.follow = false; this.updateLocateBtn(); } });
    map.on('dblclick', (e) => { if (this.state.draw || (this.state.editGeom && this.state.editGeom.mode !== 'point')) { this.onMapClick(e); if (this.state.editGeom) this.confirmEditGeom(); else this.confirmDraw(); } });
    this.locate(true);
  },

  wireChrome() {
    const $ = (id) => document.getElementById(id);
    $('zoomIn').onclick = () => this.state.map && this.state.map.zoomIn();
    $('zoomOut').onclick = () => this.state.map && this.state.map.zoomOut();
    $('menuBtn').onclick = () => this.rootNav(this.openMenu);
    $('layersBtn').onclick = () => this.rootNav(this.openLayers);
    $('locateBtn').onclick = () => this.locate(false);
    $('collectBtn').onclick = () => this.rootNav(this.startCollect);
    $('navList').onclick = () => this.rootNav(this.openRecords);
    $('navExport').onclick = () => this.rootNav(this.openExport);
    $('basemapBtn').onclick = (e) => { e.stopPropagation(); this.toggleBasemapPanel(); };
    document.querySelectorAll('.bm-opt').forEach((b) => b.onclick = () => this.setBasemap(b.dataset.bm));
    document.addEventListener('click', (e) => { const p = $('basemapPanel'), btn = $('basemapBtn'); if (p.classList.contains('show') && !p.contains(e.target) && !btn.contains(e.target)) p.classList.remove('show'); });
    $('tapHintCancel').onclick = () => { if (this.state.editGeom) this.cancelEditGeom(); else this.cancelPlacing(); };
    $('skCancel').onclick = () => { if (this.state.editGeom) this.cancelEditGeom(); else { this.endDraw(); this.backToForm(); } };
    $('skUndo').onclick = () => this.undoSketchPoint();
    $('skFinish').onclick = () => { if (this.state.editGeom) this.confirmEditGeom(); else this.confirmDraw(); };
    $('sheetClose').onclick = () => this.closeSheet();
    $('sheetBack').onclick = () => this.goBack();
    $('scrim').onclick = () => this.closeSheet();
    this.wireCameraControls();
  },

  wireNet() {
    const upd = () => { const on = navigator.onLine; const el = document.getElementById('net'); el.className = 'net ' + (on ? 'online' : 'offline'); document.getElementById('netTxt').textContent = on ? 'Online' : 'Offline'; };
    window.addEventListener('online', upd); window.addEventListener('offline', upd); upd();
  },

  toggleBasemapPanel() { const p = document.getElementById('basemapPanel'); p.classList.toggle('show'); document.querySelectorAll('.bm-opt').forEach((b) => b.classList.toggle('on', b.dataset.bm === this.state.activeBasemap)); },
  setBasemap(key) {
    localStorage.setItem('sm_basemap', key);
    document.querySelectorAll('.bm-opt').forEach((b) => b.classList.toggle('on', b.dataset.bm === key));
    if (this.state.map && this.state.basemaps) { this.state.map.removeLayer(this.state.basemaps[this.state.activeBasemap]); this.state.basemaps[key].addTo(this.state.map); this.bringLayersFront(); }
    this.state.activeBasemap = key;
    document.getElementById('basemapPanel').classList.remove('show');
  },
  bringLayersFront() { Object.values(this.state.layerGroups).forEach((g) => g.bringToFront && g.bringToFront()); if (this.state.gpsLayer) this.state.gpsLayer.bringToFront(); },

  /* ---------- Live location tracking: heading puck, follow mode, breadcrumb trail ---------- */
  locate(silent) {
    if (!navigator.geolocation) { if (!silent) this.toast('GPS not available', 'err'); return; }
    if (!this._watchStarted) this.startWatch();
    if (!silent) {
      // Explicit tap: toggle follow mode. First tap (or after manual pan) re-centers + follows; tapping again while following just stays put.
      this.state.follow = true;
      this.updateLocateBtn();
      if (this.state.lastFix) this.centerOnFix(true);
      else this.toast('Locating…');
    }
  },
  startWatch() {
    this._watchStarted = true;
    this.state.watchId = navigator.geolocation.watchPosition(
      (pos) => this.onFix(pos),
      () => { /* transient errors ignored — keep last known fix on screen */ },
      { enableHighAccuracy: true, maximumAge: 1000, timeout: 15000 }
    );
  },
  onFix(pos) {
    const { latitude, longitude, accuracy, heading, speed } = pos.coords;
    const fix = { lat: latitude, lng: longitude, accuracy, heading: (heading != null && !isNaN(heading)) ? heading : null, speed: (speed != null && !isNaN(speed)) ? speed : null };
    this.state.lastFix = fix;
    this.showGPS(fix);
    this.pushTrail(fix);
    if (!this._hadFirstFix) { this._hadFirstFix = true; this.centerOnFix(true); } // one-time convenience center on first-ever fix
    else if (this.state.follow && this.state.map) this.centerOnFix(false);
    document.getElementById('locateBtn').classList.remove('active');
  },
  centerOnFix(zoomIn) {
    const f = this.state.lastFix; if (!f || !this.state.map) return;
    this.state.map.setView([f.lat, f.lng], zoomIn ? Math.max(this.state.map.getZoom(), 17) : this.state.map.getZoom(), { animate: true });
  },
  updateLocateBtn() {
    const btn = document.getElementById('locateBtn');
    btn.classList.toggle('following', !!this.state.follow);
    btn.classList.toggle('located-only', !this.state.follow && !!this.state.lastFix);
  },

  // Persistent heading-aware marker + accuracy ring, smoothly animated between fixes.
  showGPS(fix) {
    if (!this.state.map) return;
    const { lat, lng, accuracy, heading, speed } = fix;
    if (!this._gpsAccCircle) {
      this._gpsAccCircle = L.circle([lat, lng], { radius: accuracy, color: '#0079C1', weight: 1, fillColor: '#0079C1', fillOpacity: 0.08 }).addTo(this.state.gpsLayer);
      this._gpsMarker = L.marker([lat, lng], {
        icon: L.divIcon({ className: 'gps-live-marker', html: this.gpsPuckHTML(), iconSize: [46, 46], iconAnchor: [23, 23] }),
        zIndexOffset: 1000,
      }).addTo(this.state.gpsLayer);
    } else {
      this._gpsAccCircle.setLatLng([lat, lng]).setRadius(accuracy);
      this._gpsMarker.setLatLng([lat, lng]);
    }
    const hasHeading = heading != null && (speed == null || speed > 0.4);
    const el = this._gpsMarker.getElement();
    if (el) {
      const cone = el.querySelector('.cone');
      const wrap = el.querySelector('.gps-puck-icon');
      if (wrap) wrap.classList.toggle('has-heading', hasHeading);
      if (cone && hasHeading) cone.style.transform = `rotate(${heading}deg)`;
    }
    // UI pill
    const pill = document.getElementById('gpsPill'); pill.classList.add('show');
    document.getElementById('gpsAccTxt').textContent = `±${Math.round(accuracy)} m`;
    document.getElementById('gpsDot').className = 'd' + (accuracy > 20 ? ' poor' : '');
    const hdgWrap = document.getElementById('gpsHdgWrap');
    if (speed != null && speed > 0.4) {
      hdgWrap.style.display = 'flex';
      document.getElementById('gpsSpeedTxt').textContent = `${(speed * 3.6).toFixed(1)} km/h`;
      if (heading != null) document.getElementById('gpsHdgArrow').style.transform = `rotate(${heading}deg)`;
    } else {
      hdgWrap.style.display = 'none';
    }
    this.updateLocateBtn();
  },
  gpsPuckHTML() { return `<div class="gps-puck-icon"><svg class="cone" viewBox="0 0 46 46"><path d="M23 2 L33 23 L23 18 L13 23 Z" fill="#0079C1" opacity="0.85"/></svg><div class="dot"></div></div>`; },

  // Breadcrumb trail — shows the path walked during this session (visual aid, not a saved feature)
  pushTrail(fix) {
    if (!this.state.map) return;
    this.state.trail = this.state.trail || [];
    const last = this.state.trail[this.state.trail.length - 1];
    if (last && last[0] === fix.lat && last[1] === fix.lng) return;
    this.state.trail.push([fix.lat, fix.lng]);
    if (this.state.trail.length > 600) this.state.trail.shift();
    if (!this._trailLine) this._trailLine = L.polyline(this.state.trail.map((c) => [c[0], c[1]]), { color: '#0079C1', weight: 3, opacity: 0.45, dashArray: '1,8', lineCap: 'round' }).addTo(this.state.gpsLayer);
    else this._trailLine.setLatLngs(this.state.trail.map((c) => [c[0], c[1]]));
  },
  clearTrail() {
    this.state.trail = [];
    if (this._trailLine) { this.state.map.removeLayer(this._trailLine); this._trailLine = null; }
    this.toast('Trail cleared');
  },
};

/* ============================================================
   Part 2 — Sheets, projects (+ coordinate system), layers/feature classes
   ============================================================ */
Object.assign(App, {
  openSheet(title, bodyHTML, footHTML, noClose) {
    document.getElementById('sheetTitle').textContent = title;
    document.getElementById('sheetBody').innerHTML = bodyHTML;
    const foot = document.getElementById('sheetFoot');
    if (footHTML) { foot.innerHTML = footHTML; foot.style.display = 'flex'; } else { foot.style.display = 'none'; foot.innerHTML = ''; }
    document.getElementById('sheetClose').style.display = noClose ? 'none' : 'grid';
    document.getElementById('sheetBack').style.display = (this._navStack && this._navStack.length) ? 'grid' : 'none';
    document.getElementById('scrim').classList.add('show');
    document.getElementById('sheet').classList.add('show');
    document.getElementById('sheetBody').scrollTop = 0;
    this._noClose = !!noClose;
  },
  closeSheet() { if (this._noClose) return; document.getElementById('sheet').classList.remove('show'); document.getElementById('scrim').classList.remove('show'); this._navStack = []; this._current = null; },

  // Lightweight navigation stack: navTo pushes the current screen so goBack can return to it.
  // rootNav resets the stack — use for screens reached directly from persistent map chrome.
  navTo(fn, args) { args = args || []; if (this._current) { this._navStack = this._navStack || []; this._navStack.push(this._current); } this._current = { fn, args }; fn.apply(this, args); },
  rootNav(fn, args) { args = args || []; this._navStack = []; this._current = { fn, args }; fn.apply(this, args); },
  goBack() { const prev = (this._navStack || []).pop(); if (!prev) { this.closeSheet(); return; } this._current = prev; prev.fn.apply(this, prev.args); },
  toast(msg, kind) { const w = document.getElementById('toastWrap'); w.innerHTML = `<div class="toast ${kind || ''}">${esc(msg)}</div>`; clearTimeout(this._tt); this._tt = setTimeout(() => { w.innerHTML = ''; }, 3000); },

  /* ---------- Projects ---------- */
  openProjectPicker() {
    const body = this.state.projects.length === 0
      ? `<div class="empty">${icon('folder', 44)}<h3>No projects yet</h3><p>Create a project, choose its coordinate system, then build your own layers.</p></div>`
      : this.state.projects.map((p) => {
          const lc = this.state.layers.filter((l) => l.projectId === p.id).length;
          const rc = this.state.records.filter((r) => r.projectId === p.id).length;
          return `<div class="tpl" data-pid="${p.id}"><div class="ic">${icon('folder', 21)}</div><div class="tx"><div class="t">${esc(p.name)}</div><div class="d">${lc} layer${lc !== 1 ? 's' : ''} · ${rc} record${rc !== 1 ? 's' : ''} · ${esc(p.crsName || 'WGS 84')}</div></div><div class="chev">${icon('chevron', 18)}</div></div>`;
        }).join('');
    this.openSheet('Projects', body, `<button class="btn btn-primary btn-block btn-lg" id="newProjBtn">${icon('plus', 17)} New project</button>`);
    document.getElementById('newProjBtn').onclick = () => this.navTo(this.newProjectForm);
    document.querySelectorAll('[data-pid]').forEach((el) => el.onclick = () => this.setProject(this.state.projects.find((p) => p.id === el.dataset.pid)));
  },

  newProjectForm() {
    const fix = this.state.lastFix;
    const utm = fix ? Geo.utmZoneFromLngLat(fix.lng, fix.lat) : null;
    const body = `
      <div class="field"><label class="lbl">Project name <span class="req">*</span></label><input class="inp" id="pName" placeholder="e.g. City Drainage Survey" /></div>
      <div class="field"><label class="lbl">Description</label><input class="inp" id="pDesc" placeholder="Optional" /></div>
      <div class="card" style="margin-top:4px"><div class="card-lbl">${icon('globe', 13, 'display:inline;vertical-align:-2px')} Coordinate system <span class="req">*</span></div>
        <div class="seg" id="crsKind" style="margin-bottom:11px"><button type="button" class="on" data-k="gcs">Geographic (GCS)</button><button type="button" data-k="utm">Projected (UTM)</button><button type="button" data-k="other">Other EPSG</button></div>
        <div id="crsGcs"><select class="sel" id="crsGcsSel"><option value="EPSG:4326|WGS 84 (GCS, lat/long)">WGS 84 (EPSG:4326) — most common</option><option value="EPSG:4269|NAD83 (GCS)">NAD83 (EPSG:4269)</option></select></div>
        <div id="crsUtm" style="display:none">
          <div class="note" style="margin-bottom:9px">${utm ? `Auto-detected from your location: <b>${utm.name}</b>` : 'Turn on GPS to auto-detect your UTM zone, or pick below.'}</div>
          <select class="sel" id="crsUtmSel">${this.utmOptions(utm ? utm.code : null)}</select>
        </div>
        <div id="crsOther" style="display:none"><input class="inp" id="crsOtherIn" placeholder="EPSG code e.g. 32643" inputmode="numeric" /><div class="muted" style="margin-top:5px">Enter any EPSG numeric code. WGS 84 UTM & common systems supported.</div></div>
      </div>
      <div class="note">Coordinates are captured in WGS 84 and re-projected to your chosen system for display and export — so your data stays correct.</div>`;
    this.openSheet('New project', body, `<button class="btn btn-ghost flex" id="pBack">Back</button><button class="btn btn-primary flex" id="pSave">${icon('check', 17)} Create</button>`);
    let kind = 'gcs';
    document.querySelectorAll('#crsKind button').forEach((b) => b.onclick = () => { kind = b.dataset.k; document.querySelectorAll('#crsKind button').forEach((x) => x.classList.toggle('on', x === b)); document.getElementById('crsGcs').style.display = kind === 'gcs' ? 'block' : 'none'; document.getElementById('crsUtm').style.display = kind === 'utm' ? 'block' : 'none'; document.getElementById('crsOther').style.display = kind === 'other' ? 'block' : 'none'; });
    document.getElementById('pBack').onclick = () => this.goBack();
    document.getElementById('pSave').onclick = async () => {
      const name = document.getElementById('pName').value.trim();
      if (!name) { this.toast('Enter a project name', 'err'); return; }
      let crsCode = 'EPSG:4326', crsName = 'WGS 84 (GCS, lat/long)';
      if (kind === 'gcs') { const [c, n] = document.getElementById('crsGcsSel').value.split('|'); crsCode = c; crsName = n; }
      else if (kind === 'utm') { const v = document.getElementById('crsUtmSel').value; const [c, n] = v.split('|'); crsCode = c; crsName = n; }
      else { const code = document.getElementById('crsOtherIn').value.trim(); if (!/^\d+$/.test(code)) { this.toast('Enter a valid EPSG number', 'err'); return; } crsCode = `EPSG:${code}`; crsName = `EPSG:${code}`; if (typeof Geo !== 'undefined') Geo.ensureDef(crsCode); }
      const proj = { id: uid('proj'), name, description: document.getElementById('pDesc').value.trim(), crsCode, crsName, surveyor: this.state.user.name, role: this.state.user.role, createdAt: nowISO() };
      await DB.put('projects', proj);
      this.state.projects.unshift(proj);
      this.setProject(proj);
      this.toast('Project created', 'ok');
    };
  },

  utmOptions(selected) {
    let opts = '';
    for (let z = 1; z <= 60; z++) {
      const nCode = `EPSG:${32600 + z}`, sCode = `EPSG:${32700 + z}`;
      opts += `<option value="${nCode}|UTM Zone ${z}N (WGS 84)" ${selected === nCode ? 'selected' : ''}>UTM Zone ${z}N — ${nCode}</option>`;
      opts += `<option value="${sCode}|UTM Zone ${z}S (WGS 84)" ${selected === sCode ? 'selected' : ''}>UTM Zone ${z}S — ${sCode}</option>`;
    }
    return opts;
  },

  setProject(p) {
    this.state.project = p;
    this.state.activeLayer = null;
    localStorage.setItem('sm_project', p.id);
    document.getElementById('barProj').textContent = p.name;
    this.refreshBarSub();
    this.renderAllLayers();
    this.closeSheet();
    // if no layers yet, prompt to create one
    const layers = this.state.layers.filter((l) => l.projectId === p.id);
    if (layers.length === 0) setTimeout(() => this.rootNav(this.openLayers), 400);
  },
  refreshBarSub() {
    const p = this.state.project; if (!p) return;
    const lc = this.state.layers.filter((l) => l.projectId === p.id).length;
    const rc = this.state.records.filter((r) => r.projectId === p.id).length;
    document.getElementById('barSub').textContent = `${lc} layer${lc !== 1 ? 's' : ''} · ${rc} record${rc !== 1 ? 's' : ''} · ${p.crsName || 'WGS 84'}`;
  },

  /* ---------- Layers (feature classes) ---------- */
  openLayers() {
    if (!this.state.project) { this.toast('Select a project first', 'err'); this.rootNav(this.openProjectPicker); return; }
    const layers = this.state.layers.filter((l) => l.projectId === this.state.project.id);
    const body = layers.length === 0
      ? `<div class="empty">${icon('stack', 44)}<h3>No layers yet</h3><p>A layer is a feature class — like "INLET" or "PIPE". Create one, define its attributes, then all captures of that type collect into it.</p></div>`
      : layers.map((l) => {
          const n = this.state.records.filter((r) => r.layerId === l.id).length;
          const sw = this.symbSwatch(l);
          return `<div class="layer-row"><div class="layer-main" data-open="${l.id}"><div class="swatch">${sw}</div><div class="tx"><div class="t">${esc(l.name)}</div><div class="d">${l.geomType} · ${l.fields.length} field${l.fields.length !== 1 ? 's' : ''} · ${n} record${n !== 1 ? 's' : ''}</div></div></div><div class="layer-acts"><button class="mini" data-vis="${l.id}" title="Toggle visibility">${icon(l.hidden ? 'xCircle' : 'checkCircle', 17)}</button><button class="mini" data-symb="${l.id}" title="Symbology">${icon('palette', 17)}</button><button class="mini" data-editl="${l.id}" title="Edit layer">${icon('settings', 17)}</button></div></div>`;
        }).join('');
    this.openSheet(`Layers · ${this.state.project.name}`, body, `<button class="btn btn-primary btn-block btn-lg" id="newLayerBtn">${icon('plus', 17)} New layer / feature class</button>`);
    document.getElementById('newLayerBtn').onclick = () => this.navTo(this.layerEditor, [null]);
    document.querySelectorAll('[data-open]').forEach((el) => el.onclick = () => { this.state.activeLayer = this.state.layers.find((l) => l.id === el.dataset.open); this.navTo(this.openRecords); });
    document.querySelectorAll('[data-symb]').forEach((el) => el.onclick = () => this.navTo(this.symbologyEditor, [el.dataset.symb]));
    document.querySelectorAll('[data-editl]').forEach((el) => el.onclick = () => this.navTo(this.layerEditor, [this.state.layers.find((l) => l.id === el.dataset.editl)]));
    document.querySelectorAll('[data-vis]').forEach((el) => el.onclick = async () => { const l = this.state.layers.find((x) => x.id === el.dataset.vis); l.hidden = !l.hidden; await DB.put('layers', l); this.renderAllLayers(); this.openLayers(); });
  },

  symbSwatch(l) {
    const s = l.symbology || {};
    const c = s.color || '#0079C1';
    if (l.geomType === 'line') return `<span style="display:block;width:22px;height:0;border-top:${(s.weight || 4)}px solid ${c};border-radius:2px"></span>`;
    if (l.geomType === 'polygon') return `<span style="display:block;width:22px;height:16px;background:${c}33;border:2px solid ${c};border-radius:3px"></span>`;
    return `<span style="display:block;width:${Math.min(22, (s.size || 7) * 2)}px;height:${Math.min(22, (s.size || 7) * 2)}px;background:${c};border:2px solid #fff;border-radius:50%;box-shadow:0 0 0 1px ${c}"></span>`;
  },
});

/* ============================================================
   Part 3 — Layer editor (custom attributes) + symbology
   ============================================================ */
Object.assign(App, {
  layerEditor(existing) {
    const l = existing ? JSON.parse(JSON.stringify(existing)) : { id: uid('lyr'), projectId: this.state.project.id, name: '', geomType: 'point', fields: [], symbology: this.defaultSymb('point'), createdAt: nowISO() };
    this._layerDraft = l;
    const geomLocked = !!existing && this.state.records.some((r) => r.layerId === l.id);
    const body = `
      <div class="field"><label class="lbl">Layer / feature class name <span class="req">*</span></label><input class="inp" id="lName" value="${esc(l.name)}" placeholder="e.g. INLET, PIPE, MANHOLE" /></div>
      <div class="field"><label class="lbl">Geometry type <span class="req">*</span></label>
        <div class="geo-types" id="lGeom">${['point', 'line', 'polygon'].map((g) => `<div class="geo-type ${g} ${l.geomType === g ? 'on' : ''}" data-g="${g}" ${geomLocked ? 'style="opacity:.5;pointer-events:none"' : ''}>${icon(g, 26)}<div class="n">${g[0].toUpperCase() + g.slice(1)}</div></div>`).join('')}</div>
        ${geomLocked ? '<div class="muted" style="margin-top:6px">Geometry type is locked because this layer already has records.</div>' : ''}
      </div>
      <div class="card"><div class="card-lbl"><span>Attributes / fields</span><button class="btn-text" id="addField" style="padding:0">${icon('plus', 15, 'display:inline;vertical-align:-2px')} Add field</button></div>
        <div class="note" style="margin-bottom:10px">Every layer automatically includes <b>Z_Elevation</b> (auto-filled) plus record ID, surveyor, role and timestamps. Add your own fields below.</div>
        <div id="fieldList"></div>
      </div>`;
    this.openSheet(existing ? 'Edit layer' : 'New layer', body, `<button class="btn btn-ghost flex" id="lBack">Back</button>${existing ? `<button class="btn btn-danger" id="lDel">${icon('trash', 16)}</button>` : ''}<button class="btn btn-primary flex" id="lSave">${icon('check', 16)} Save layer</button>`);
    if (!geomLocked) document.querySelectorAll('#lGeom [data-g]').forEach((el) => el.onclick = () => { l.geomType = el.dataset.g; if (!existing) l.symbology = this.defaultSymb(l.geomType); document.querySelectorAll('#lGeom [data-g]').forEach((x) => x.classList.toggle('on', x === el)); });
    const renderFields = () => {
      const host = document.getElementById('fieldList');
      host.innerHTML = l.fields.length === 0 ? '<div class="muted" style="padding:4px 0">No custom fields yet.</div>' : l.fields.map((f, i) => `
        <div class="fld-item">
          <div class="fld-head"><input class="inp fld-name" data-i="${i}" value="${esc(f.label)}" placeholder="Field name" style="flex:1" />
            <select class="sel fld-type" data-i="${i}" style="width:120px">${['text', 'number', 'select', 'bool', 'date', 'time'].map((t) => `<option value="${t}" ${f.type === t ? 'selected' : ''}>${t}</option>`).join('')}</select>
            <button class="mini" data-rmf="${i}">${icon('trash', 16)}</button></div>
          ${f.type === 'select' ? `<input class="inp fld-opts" data-i="${i}" value="${esc((f.options || []).join(', '))}" placeholder="Options, comma-separated" style="margin-top:7px" />` : ''}
          <label class="fld-req"><input type="checkbox" class="fld-reqcb" data-i="${i}" ${f.required ? 'checked' : ''} /> required</label>
        </div>`).join('');
      host.querySelectorAll('.fld-name').forEach((el) => el.oninput = () => { l.fields[el.dataset.i].label = el.value; });
      host.querySelectorAll('.fld-type').forEach((el) => el.onchange = () => { l.fields[el.dataset.i].type = el.value; renderFields(); });
      host.querySelectorAll('.fld-opts').forEach((el) => el.oninput = () => { l.fields[el.dataset.i].options = el.value.split(',').map((s) => s.trim()).filter(Boolean); });
      host.querySelectorAll('.fld-reqcb').forEach((el) => el.onchange = () => { l.fields[el.dataset.i].required = el.checked; });
      host.querySelectorAll('[data-rmf]').forEach((el) => el.onclick = () => { l.fields.splice(parseInt(el.dataset.rmf), 1); renderFields(); });
    };
    renderFields();
    document.getElementById('addField').onclick = () => { l.fields.push({ id: uid('f'), label: '', type: 'text', required: false }); renderFields(); };
    document.getElementById('lBack').onclick = () => this.goBack();
    if (existing) document.getElementById('lDel').onclick = async () => {
      if (!confirm(`Delete layer "${l.name}" and ALL its records? This cannot be undone.`)) return;
      const recs = this.state.records.filter((r) => r.layerId === l.id);
      for (const r of recs) await DB.del('records', r.id);
      this.state.records = this.state.records.filter((r) => r.layerId !== l.id);
      await DB.del('layers', l.id);
      this.state.layers = this.state.layers.filter((x) => x.id !== l.id);
      this.renderAllLayers(); this.refreshBarSub(); this.toast('Layer deleted'); this.goBack();
    };
    document.getElementById('lSave').onclick = async () => {
      l.name = document.getElementById('lName').value.trim();
      if (!l.name) { this.toast('Enter a layer name', 'err'); return; }
      // assign ids/labels
      l.fields = l.fields.filter((f) => f.label.trim()).map((f) => ({ ...f, id: f.id || uid('f'), key: f.label.trim().toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '') }));
      await DB.put('layers', l);
      const i = this.state.layers.findIndex((x) => x.id === l.id);
      if (i >= 0) this.state.layers[i] = l; else this.state.layers.push(l);
      this.renderAllLayers(); this.refreshBarSub();
      this.toast('Layer saved', 'ok'); this.goBack();
    };
  },

  defaultSymb(geom) {
    if (geom === 'line') return { color: '#0079C1', weight: 4, opacity: 1 };
    if (geom === 'polygon') return { color: '#0079C1', weight: 2, opacity: 1, fillOpacity: 0.25 };
    return { color: '#E14B3B', size: 7, weight: 2, opacity: 1 };
  },

  symbologyEditor(layerId) {
    const l = this.state.layers.find((x) => x.id === layerId); if (!l) return;
    const s = Object.assign(this.defaultSymb(l.geomType), l.symbology || {});
    const palette = ['#E14B3B', '#F0A324', '#35AC46', '#0079C1', '#7A4FBF', '#111827', '#00A0B0', '#D6336C', '#8B5A2B', '#ffffff'];
    const body = `
      <div class="card"><div class="card-lbl">Preview</div><div style="display:grid;place-items:center;padding:18px;background:var(--grey-100);border-radius:9px"><div id="symbPreview">${this.symbSwatch({ geomType: l.geomType, symbology: s })}</div></div></div>
      <div class="field"><label class="lbl">Color</label><div class="palette" id="palette">${palette.map((c) => `<button class="sw ${c.toLowerCase() === (s.color || '').toLowerCase() ? 'on' : ''}" data-c="${c}" style="background:${c}"></button>`).join('')}<input type="color" id="customColor" value="${s.color || '#0079C1'}" class="sw-custom" /></div></div>
      ${l.geomType === 'point' ? `<div class="field"><label class="lbl">Size — <span id="sizeVal">${s.size}</span> px</label><input type="range" id="sizeR" min="3" max="16" value="${s.size}" class="range" /></div>` : ''}
      ${l.geomType !== 'point' ? `<div class="field"><label class="lbl">Line thickness — <span id="wVal">${s.weight}</span> px</label><input type="range" id="wR" min="1" max="10" value="${s.weight}" class="range" /></div>` : ''}
      ${l.geomType === 'polygon' ? `<div class="field"><label class="lbl">Fill opacity — <span id="foVal">${Math.round((s.fillOpacity ?? 0.25) * 100)}</span>%</label><input type="range" id="foR" min="0" max="100" value="${Math.round((s.fillOpacity ?? 0.25) * 100)}" class="range" /></div>` : ''}
      <div class="field"><label class="lbl">Opacity — <span id="oVal">${Math.round((s.opacity ?? 1) * 100)}</span>%</label><input type="range" id="oR" min="20" max="100" value="${Math.round((s.opacity ?? 1) * 100)}" class="range" /></div>`;
    this.openSheet(`Symbology · ${l.name}`, body, `<button class="btn btn-ghost flex" id="symBack">Back</button><button class="btn btn-primary flex" id="symSave">${icon('check', 16)} Apply</button>`);
    const upd = () => { document.getElementById('symbPreview').innerHTML = this.symbSwatch({ geomType: l.geomType, symbology: s }); };
    document.querySelectorAll('#palette .sw').forEach((b) => b.onclick = () => { s.color = b.dataset.c; document.querySelectorAll('#palette .sw').forEach((x) => x.classList.toggle('on', x === b)); upd(); });
    document.getElementById('customColor').oninput = (e) => { s.color = e.target.value; document.querySelectorAll('#palette .sw').forEach((x) => x.classList.remove('on')); upd(); };
    const sizeR = document.getElementById('sizeR'); if (sizeR) sizeR.oninput = (e) => { s.size = +e.target.value; document.getElementById('sizeVal').textContent = e.target.value; upd(); };
    const wR = document.getElementById('wR'); if (wR) wR.oninput = (e) => { s.weight = +e.target.value; document.getElementById('wVal').textContent = e.target.value; upd(); };
    const foR = document.getElementById('foR'); if (foR) foR.oninput = (e) => { s.fillOpacity = +e.target.value / 100; document.getElementById('foVal').textContent = e.target.value; upd(); };
    const oR = document.getElementById('oR'); if (oR) oR.oninput = (e) => { s.opacity = +e.target.value / 100; document.getElementById('oVal').textContent = e.target.value; upd(); };
    document.getElementById('symBack').onclick = () => this.goBack();
    document.getElementById('symSave').onclick = async () => { l.symbology = s; await DB.put('layers', l); const i = this.state.layers.findIndex((x) => x.id === l.id); this.state.layers[i] = l; this.renderAllLayers(); this.toast('Symbology applied', 'ok'); this.goBack(); };
  },
});

/* ============================================================
   Part 4 — Render layers on map, records list, detail, geometry edit
   ============================================================ */
Object.assign(App, {
  renderAllLayers() {
    if (!this.state.map) return;
    Object.values(this.state.layerGroups).forEach((g) => this.state.map.removeLayer(g));
    this.state.layerGroups = {};
    if (!this.state.project) return;
    const layers = this.state.layers.filter((l) => l.projectId === this.state.project.id);
    layers.forEach((l) => {
      const group = L.layerGroup();
      if (!l.hidden) group.addTo(this.state.map);
      this.state.layerGroups[l.id] = group;
      const recs = this.state.records.filter((r) => r.layerId === l.id);
      recs.forEach((r) => this.addFeatureToMap(r, l, group));
    });
    this.bringLayersFront();
  },

  addFeatureToMap(r, l, group) {
    const g = Exporter.geometryOf(r); if (!g) return;
    const s = Object.assign(this.defaultSymb(l.geomType), l.symbology || {});
    let layer;
    if (g.type === 'Point') layer = L.circleMarker([g.coordinates[1], g.coordinates[0]], { radius: s.size || 7, color: '#fff', weight: 2, opacity: s.opacity ?? 1, fillColor: s.color, fillOpacity: s.opacity ?? 1 });
    else if (g.type === 'LineString') layer = L.polyline(g.coordinates.map((c) => [c[1], c[0]]), { color: s.color, weight: s.weight || 4, opacity: s.opacity ?? 1 });
    else if (g.type === 'Polygon') layer = L.polygon(g.coordinates[0].map((c) => [c[1], c[0]]), { color: s.color, weight: s.weight || 2, opacity: s.opacity ?? 1, fillOpacity: s.fillOpacity ?? 0.25 });
    if (layer) { layer.on('click', (e) => { if (L.DomEvent) L.DomEvent.stopPropagation(e); this.rootNav(this.openDetail, [r.id]); }); group.addLayer(layer); }
  },

  /* ---------- Records ---------- */
  openRecords() {
    if (!this.state.project) { this.toast('Select a project first', 'err'); return; }
    this._filter = this._filter || 'all'; this._search = '';
    this.renderRecords();
  },
  renderRecords() {
    const pid = this.state.project.id;
    const layerFilter = this.state.activeLayer;
    let list = this.state.records.filter((r) => r.projectId === pid);
    if (layerFilter) list = list.filter((r) => r.layerId === layerFilter.id);
    if (this._search && this._search.trim()) { const q = this._search.toLowerCase(); list = list.filter((r) => JSON.stringify(r.data || {}).toLowerCase().includes(q) || (r.layerName || '').toLowerCase().includes(q)); }
    list.sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt));
    const layers = this.state.layers.filter((l) => l.projectId === pid);
    const title = layerFilter ? layerFilter.name : 'All records';
    const body = `
      <div class="tools-row"><div class="search">${icon('search', 16)}<input id="recSearch" placeholder="Search" value="${esc(this._search || '')}" /></div>${layerFilter ? `<button class="btn btn-ghost" id="allLayers">All layers</button>` : ''}</div>
      ${!layerFilter && layers.length ? `<div class="filters">${[{ id: null, name: 'All' }].concat(layers).map((l) => `<button class="filter ${(!this._layerChip && !l.id) || this._layerChip === l.id ? 'on' : ''}" data-lc="${l.id || ''}">${esc(l.name)}</button>`).join('')}</div>` : ''}
      ${list.length === 0 ? `<div class="empty">${icon('list', 44)}<p>${this._search ? 'No records match.' : 'No records yet. Tap Collect to add.'}</p></div>` : list.map((r) => this.recRow(r)).join('')}`;
    this.openSheet(`${title} · ${this.state.project.name}`, body);
    const srch = document.getElementById('recSearch');
    srch.oninput = (e) => { this._search = e.target.value; this.renderRecords(); setTimeout(() => { const n = document.getElementById('recSearch'); n.focus(); n.setSelectionRange(n.value.length, n.value.length); }, 0); };
    const al = document.getElementById('allLayers'); if (al) al.onclick = () => { this.state.activeLayer = null; this.renderRecords(); };
    document.querySelectorAll('[data-lc]').forEach((el) => el.onclick = () => { this._layerChip = el.dataset.lc || null; this.state.activeLayer = this._layerChip ? this.state.layers.find((l) => l.id === this._layerChip) : null; this.renderRecords(); });
    document.querySelectorAll('[data-rid]').forEach((el) => el.onclick = () => this.navTo(this.openDetail, [el.dataset.rid]));
  },
  recRow(r) {
    const l = this.state.layers.find((x) => x.id === r.layerId);
    const gi = r.geomType === 'point' ? 'point' : r.geomType === 'line' ? 'line' : 'polygon';
    const title = this.recTitle(r, l);
    const media = (r.media || []).length;
    const sw = l ? this.symbSwatch(l) : '';
    return `<div class="rec s-${r.status}" data-rid="${r.id}"><div class="g">${sw || icon(gi, 18)}</div><div class="b"><div class="t">${esc(title)}</div><div class="m"><span>${esc(l ? l.name : r.layerName)}</span><span>${esc(fmtDate(r.updatedAt))}</span>${r.location && r.location.z != null ? `<span>Z ${(+r.location.z).toFixed(1)}m</span>` : ''}${media ? `<span>${icon('camera', 10, 'display:inline;vertical-align:-1px')} ${media}</span>` : ''}</div></div>${icon('chevron', 16, 'color:var(--grey-400);flex-shrink:0')}</div>`;
  },
  recTitle(r, l) {
    if (l && l.fields.length) { const first = l.fields[0]; const v = r.data && r.data[first.key]; if (v) return `${v}`; }
    return (r.data && (r.data.name || r.data.id)) || `${l ? l.name : 'Record'} ${r.id.slice(-4)}`;
  },

  openDetail(rid) {
    const r = this.state.records.find((x) => x.id === rid); if (!r) return;
    const l = this.state.layers.find((x) => x.id === r.layerId);
    const g = Exporter.geometryOf(r);
    const crs = this.state.project.crsCode;
    let geo = '';
    if (g) { const c = g.type === 'Point' ? g.coordinates : (g.type === 'LineString' ? g.coordinates[0] : g.coordinates[0][0]); geo = (typeof Geo !== 'undefined') ? Geo.format([c[0], c[1]], crs) : `${c[1].toFixed(6)}, ${c[0].toFixed(6)}`; }
    const rows = (l ? l.fields : []).map((f) => `<tr><td class="k">${esc(f.label)}</td><td class="v">${esc((r.data && r.data[f.key]) || '—')}</td></tr>`).join('');
    const body = `
      <div style="display:flex;align-items:center;gap:10px;margin-bottom:12px"><span class="badge ${r.status}">${(r.status || '').replace('_', ' ')}</span><span class="muted">${esc(fmtDate(r.updatedAt))}</span></div>
      <table class="attr">
        ${rows}
        ${geo ? `<tr><td class="k">Coordinates <span class="muted">(${esc(this.state.project.crsName)})</span></td><td class="v" style="font-family:var(--mono);font-size:12px">${geo}</td></tr>` : ''}
        <tr><td class="k">Z_Elevation</td><td class="v" style="font-family:var(--mono)">${r.location && r.location.z != null ? (+r.location.z).toFixed(2) + ' m' : '—'}</td></tr>
        <tr><td class="k">Surveyor</td><td class="v">${esc(r.surveyor || '—')} ${r.role ? `<span class="muted">· ${esc(r.role)}</span>` : ''}</td></tr>
      </table>
      ${(r.media || []).length ? `<div class="card-lbl" style="margin-top:16px">Photos & video (${r.media.length})</div><div class="media-grid">${r.media.map((m, i) => this.mediaThumb(m, i)).join('')}</div>` : ''}`;
    const foot = `${g ? `<button class="btn btn-ghost" id="dZoom">${icon('mapPin', 16)}</button><button class="btn btn-ghost" id="dGeom">${icon('move', 16)}</button>` : ''}<button class="btn btn-ghost flex" id="dEdit">${icon('pencil', 16)} Edit</button><button class="btn btn-danger" id="dDel">${icon('trash', 16)}</button>`;
    this.openSheet(l ? l.name : 'Record', body, foot);
    if (g) {
      document.getElementById('dZoom').onclick = () => { this.closeSheet(); const c = g.type === 'Point' ? g.coordinates : (g.type === 'LineString' ? g.coordinates[0] : g.coordinates[0][0]); this.state.map.setView([c[1], c[0]], 18); };
      document.getElementById('dGeom').onclick = () => this.startEditGeom(r, l);
    }
    document.getElementById('dEdit').onclick = () => this.navTo(this.startCollect, [r]);
    let cd = false; const db = document.getElementById('dDel');
    db.onclick = async () => { if (!cd) { cd = true; db.innerHTML = `${icon('alert', 16)}`; this.toast('Tap again to delete'); return; } await DB.del('records', r.id); this.state.records = this.state.records.filter((x) => x.id !== r.id); this.renderAllLayers(); this.refreshBarSub(); this.toast('Record deleted'); this.goBack(); };
  },

  mediaThumb(m, i, removable) {
    const geo = (m.lat != null) ? `<div class="geo">${icon('mapPin', 8)} geo</div>` : '';
    const rm = removable ? `<div class="rm" data-rm="${i}">${icon('x', 13)}</div>` : '';
    if (m.type === 'video') return `<div class="mi"><video src="${m.dataUrl}" muted></video><div class="vic">${icon('play', 28)}</div><div class="tag">video</div>${geo}${rm}</div>`;
    if (m.type === 'file') return `<div class="mi" style="display:grid;place-items:center;color:var(--grey-400)">${icon('file', 26)}<div class="tag">${esc((m.name || 'file').split('.').pop())}</div>${rm}</div>`;
    return `<div class="mi"><img src="${m.dataUrl}" /><div class="tag">photo</div>${geo}${rm}</div>`;
  },

  /* ---------- Edit geometry on map ---------- */
  startEditGeom(r, l) {
    if (!this.state.map) { this.toast('Map not ready', 'err'); return; }
    const g = Exporter.geometryOf(r); if (!g) return;
    this.closeSheet();
    this.hideCollectBar();
    this.state.editGeom = { record: r, layer: l, mode: r.geomType, coords: [] };
    if (g.type === 'Point') {
      this.state.map.setView([g.coordinates[1], g.coordinates[0]], Math.max(this.state.map.getZoom(), 17));
      document.getElementById('tapHintText').textContent = 'Tap the new position for this point';
      document.getElementById('tapHint').classList.add('show');
      document.getElementById('map').classList.add('placing-cursor');
    } else {
      this.state.editGeom.coords = [];
      this.state.editGeom._reLayer = L.layerGroup().addTo(this.state.map);
      this.state.map.doubleClickZoom.disable();
      document.getElementById('sketchBar').classList.add('show');
      this.updateSketchCount();
    }
  },
  confirmEditGeom() {
    const eg = this.state.editGeom, r = eg.record;
    const min = eg.mode === 'line' ? 2 : 3;
    if (eg.coords.length < min) { this.toast(`Add at least ${min} points`, 'err'); return; }
    r.geometry = eg.mode === 'line' ? { type: 'LineString', coordinates: [...eg.coords] } : { type: 'Polygon', coordinates: [[...eg.coords, eg.coords[0]]] };
    this.finishEditGeom(r);
  },
  async finishEditGeom(r) {
    r.updatedAt = nowISO();
    await DB.put('records', r);
    const i = this.state.records.findIndex((x) => x.id === r.id); if (i >= 0) this.state.records[i] = r;
    this.cancelEditGeom(); this.renderAllLayers(); this.toast('Geometry updated', 'ok');
  },
  cancelEditGeom() {
    const eg = this.state.editGeom;
    if (eg && eg._reLayer) this.state.map.removeLayer(eg._reLayer);
    this.state.editGeom = null;
    if (this.state.map) this.state.map.doubleClickZoom.enable();
    document.getElementById('tapHint').classList.remove('show');
    document.getElementById('map').classList.remove('placing-cursor');
    document.getElementById('sketchBar').classList.remove('show');
    this.showCollectBar();
  },
});

/* ============================================================
   Part 5 — Collect: pick layer, fill attributes, geometry,
   auto Z-elevation, camera/media, save
   ============================================================ */
Object.assign(App, {
  startCollect(existing) {
    if (!this.state.project) { this.toast('Select a project first', 'err'); this.rootNav(this.openProjectPicker); return; }
    const layers = this.state.layers.filter((l) => l.projectId === this.state.project.id);
    if (layers.length === 0) { this.toast('Create a layer first', 'err'); this.rootNav(this.openLayers); return; }
    if (existing) { const l = this.state.layers.find((x) => x.id === existing.layerId); this.state.draft = JSON.parse(JSON.stringify(existing)); this.state.draft._layer = l; this.openForm(); return; }
    // if a layer is active (from list), collect straight into it; else pick
    if (this.state.activeLayer && layers.some((l) => l.id === this.state.activeLayer.id)) { this.beginNewDraft(this.state.activeLayer); return; }
    const body = `<div class="muted" style="margin-bottom:12px">Which layer are you collecting into?</div>${layers.map((l) => `<div class="tpl" data-lc="${l.id}"><div class="ic">${this.symbSwatch(l)}</div><div class="tx"><div class="t">${esc(l.name)}</div><div class="d">${l.geomType} · ${l.fields.length} fields</div></div><div class="chev">${icon('chevron', 18)}</div></div>`).join('')}<button class="btn btn-ghost btn-block" id="newLyr" style="margin-top:6px">${icon('plus', 16)} New layer</button>`;
    this.openSheet('Collect into…', body);
    document.querySelectorAll('[data-lc]').forEach((el) => el.onclick = () => this.beginNewDraft(this.state.layers.find((l) => l.id === el.dataset.lc)));
    document.getElementById('newLyr').onclick = () => this.layerEditor(null);
  },

  beginNewDraft(layer) {
    this.state.draft = { id: null, layerId: layer.id, layerName: layer.name, geomType: layer.geomType, data: {}, media: [], geometry: null, location: null, surveyor: this.state.user.name, role: this.state.user.role, _layer: layer };
    this.openForm();
  },

  openForm() {
    const d = this.state.draft, l = d._layer;
    const missing = l.fields.filter((f) => f.required && !d.data[f.key]);
    const geomBtns = l.geomType === 'point'
      ? `<button class="btn btn-primary flex" id="gpsPoint">${icon('navigation', 16)} Use GPS</button><button class="btn btn-ghost flex" id="tapMap">${icon('mapPin', 16)} Tap map</button>`
      : `<button class="btn btn-primary btn-block" id="drawMap">${icon('layers', 16)} Draw ${l.geomType} on map</button>`;
    const body = `
      <div class="card"><div class="card-lbl">Location · ${l.geomType}</div>
        <div style="display:flex;gap:8px;flex-wrap:wrap">${geomBtns}</div>
        ${this.geoReadout(d)}
      </div>
      <div class="card"><div class="card-lbl">${esc(l.name)} attributes</div>
        ${l.fields.length === 0 ? '<div class="muted">This layer has no custom fields. Add some via Layers → edit.</div>' : l.fields.map((f) => this.fieldHTML(f, d.data[f.key])).join('')}
      </div>
      <div class="card"><div class="card-lbl">Photos & video ${icon('camera', 12, 'display:inline;vertical-align:-2px')}</div>
        <div style="display:flex;gap:8px;margin-bottom:${(d.media || []).length ? 11 : 0}px">
          <button class="btn btn-ghost flex" id="bPhoto">${icon('camera', 16)} Camera</button>
          <button class="btn btn-ghost flex" id="bVideo">${icon('video', 16)} Video</button>
          <button class="btn btn-ghost flex" id="bFile">${icon('file', 16)} File</button>
        </div>
        <input type="file" id="iPhoto" accept="image/*" capture="environment" multiple hidden />
        <input type="file" id="iVideo" accept="video/*" capture="environment" hidden />
        <input type="file" id="iFile" hidden multiple />
        ${(d.media || []).length ? `<div class="media-grid">${d.media.map((m, i) => this.mediaThumb(m, i, true)).join('')}</div>` : ''}
        <div class="muted" style="margin-top:8px">Photos are geotagged to your current location and linked to this ${esc(l.name)} record.</div>
      </div>
      <div class="card"><div class="card-lbl">Record info</div>
        <div class="attr-mini"><span>Surveyor</span><b>${esc(d.surveyor)} · ${esc(d.role)}</b></div>
        <div class="attr-mini"><span>Z_Elevation</span><b id="zVal">${d.location && d.location.z != null ? (+d.location.z).toFixed(2) + ' m' : 'auto on capture'}</b></div>
      </div>`;
    const foot = `<button class="btn btn-ghost" id="fDraft">${icon('save', 16)} Draft</button><button class="btn btn-primary flex" id="fDone" ${missing.length ? 'disabled' : ''}>${icon('check', 16)} Complete</button>`;
    this.openSheet(d.id ? `Edit · ${l.name}` : `New ${l.name}`, body, foot);
    this.wireForm();
  },

  geoReadout(d) {
    if (d.geometry) {
      if (d.geometry.type === 'Point') { const acc = d.location && d.location.accuracy; const poor = acc > 20; const crs = this.state.project.crsCode; const disp = (typeof Geo !== 'undefined') ? Geo.format([d.geometry.coordinates[0], d.geometry.coordinates[1]], crs) : `${d.geometry.coordinates[1].toFixed(6)}, ${d.geometry.coordinates[0].toFixed(6)}`; return `<div class="geo-readout">${disp}<div class="${poor ? 'warn' : 'ok'}">${poor ? icon('alert', 13) : icon('check', 13)} ${acc != null ? '±' + Math.round(acc) + 'm' : 'placed'} ${poor ? '· move to open sky' : '· good'}</div></div>`; }
      const v = d.geometry.type === 'Polygon' ? d.geometry.coordinates[0].length : d.geometry.coordinates.length;
      return `<div class="geo-readout"><div class="ok">${icon('check', 13)} ${d.geometry.type} · ${v} vertices</div></div>`;
    }
    return `<div class="geo-readout" style="color:var(--grey-500)">No location yet — capture it above.</div>`;
  },

  fieldHTML(f, val) {
    const v = val ?? '', req = f.required ? '<span class="req">*</span>' : '';
    let ctl = '';
    if (f.type === 'select') ctl = `<select class="sel" data-f="${f.key}"><option value="">Select…</option>${(f.options || []).map((o) => `<option ${o === v ? 'selected' : ''}>${esc(o)}</option>`).join('')}</select>`;
    else if (f.type === 'bool') ctl = `<div class="seg" data-f="${f.key}"><button type="button" class="${v === 'Yes' ? 'on' : ''}" data-v="Yes">Yes</button><button type="button" class="${v === 'No' ? 'on' : ''}" data-v="No">No</button></div>`;
    else if (f.type === 'number') ctl = `<input class="inp" type="number" inputmode="decimal" data-f="${f.key}" value="${esc(v)}" />`;
    else if (f.type === 'date') ctl = `<input class="inp" type="date" data-f="${f.key}" value="${esc(v)}" />`;
    else if (f.type === 'time') ctl = `<input class="inp" type="time" data-f="${f.key}" value="${esc(v)}" />`;
    else ctl = `<input class="inp" type="text" data-f="${f.key}" value="${esc(v)}" />`;
    return `<div class="field"><label class="lbl">${esc(f.label)} ${req}</label>${ctl}</div>`;
  },

  wireForm() {
    const d = this.state.draft, l = d._layer;
    const reqKeys = new Set(l.fields.filter((f) => f.required).map((f) => f.key));
    const sync = () => { const m = l.fields.filter((f) => f.required && !d.data[f.key]); const b = document.getElementById('fDone'); if (b) b.disabled = m.length > 0; };
    document.querySelectorAll('[data-f]').forEach((el) => {
      if (el.classList.contains('seg')) el.querySelectorAll('button').forEach((b) => b.onclick = () => { d.data[el.dataset.f] = b.dataset.v; el.querySelectorAll('button').forEach((x) => x.classList.toggle('on', x === b)); if (reqKeys.has(el.dataset.f)) sync(); });
      else { el.oninput = () => { d.data[el.dataset.f] = el.value; if (reqKeys.has(el.dataset.f)) sync(); }; el.onchange = () => { d.data[el.dataset.f] = el.value; if (reqKeys.has(el.dataset.f)) sync(); }; }
    });
    const gp = document.getElementById('gpsPoint'); if (gp) gp.onclick = () => this.captureGPS();
    const tm = document.getElementById('tapMap'); if (tm) tm.onclick = () => this.beginPlacePoint();
    const dm = document.getElementById('drawMap'); if (dm) dm.onclick = () => this.beginDraw(l.geomType);
    this.wireMedia();
    document.getElementById('fDraft').onclick = () => this.saveRecord('draft');
    const fd = document.getElementById('fDone'); if (fd) fd.onclick = () => { const m = l.fields.filter((f) => f.required && !d.data[f.key]); if (m.length) { this.toast('Fill required: ' + m.map((f) => f.label).join(', '), 'err'); return; } this.saveRecord('completed'); };
  },

  /* ---------- Geometry capture ---------- */
  captureGPS() {
    if (!navigator.geolocation) { this.toast('GPS not available', 'err'); return; }
    this.toast('Getting GPS fix…');
    navigator.geolocation.getCurrentPosition(
      (pos) => { const d = this.state.draft; d.location = { lat: pos.coords.latitude, lng: pos.coords.longitude, accuracy: pos.coords.accuracy, capturedAt: nowISO() }; d.geometry = { type: 'Point', coordinates: [pos.coords.longitude, pos.coords.latitude] }; this.openForm(); this.autoZ(d); },
      () => this.toast('GPS unavailable — try Tap map', 'err'),
      { enableHighAccuracy: true, timeout: 12000, maximumAge: 0 }
    );
  },

  // Auto-fill Z from elevation service
  async autoZ(target) {
    const loc = target.location; if (!loc) return;
    if (!navigator.onLine) { this.toast('Offline — Z will fill when online', 'err'); return; }
    const zEl = document.getElementById('zVal'); if (zEl) zEl.textContent = 'fetching…';
    try {
      const { z, source } = await Geo.elevation(loc.lat, loc.lng);
      if (z != null) {
        loc.z = Math.round(z * 100) / 100;
        if (target.geometry && target.geometry.type === 'Point') target.geometry.coordinates[2] = loc.z;
        if (zEl) zEl.textContent = `${loc.z.toFixed(2)} m`;
        this.toast(`Z elevation: ${loc.z.toFixed(1)} m (${source})`, 'ok');
      } else if (zEl) zEl.textContent = 'unavailable';
    } catch { if (zEl) zEl.textContent = 'unavailable'; }
  },

  hideCollectBar() { document.getElementById('collectBar').style.display = 'none'; },
  showCollectBar() { document.getElementById('collectBar').style.display = 'flex'; },

  /* ---------- Point placement: tap the map, it's placed immediately ---------- */
  beginPlacePoint() {
    if (!this.state.map) { this.toast('Map not ready', 'err'); return; }
    this.closeSheet();
    this.hideCollectBar();
    this.state.placing = { mode: 'point' };
    document.getElementById('tapHintText').textContent = 'Tap the map to place the point';
    document.getElementById('tapHint').classList.add('show');
    document.getElementById('map').classList.add('placing-cursor');
  },
  cancelPlacing() { this.endPlacing(); this.backToForm(); },
  endPlacing() {
    this.state.placing = null;
    document.getElementById('tapHint').classList.remove('show');
    document.getElementById('map').classList.remove('placing-cursor');
    this.showCollectBar();
  },
  backToForm() { if (this.state.draft) this.openForm(); },

  // Drops an animated Esri-style pin at a lat/lng (in screen pixel space, tracks map)
  dropPin(latlng, color) {
    const layer = document.getElementById('dropPinLayer');
    layer.innerHTML = '';
    const pt = this.state.map.latLngToContainerPoint(latlng);
    const el = document.createElement('div');
    el.className = 'drop-pin';
    el.style.left = pt.x + 'px'; el.style.top = pt.y + 'px';
    el.innerHTML = pinSVG(color || '#0079C1', 34) + '<div class="shadow"></div>';
    layer.appendChild(el);
    // keep pin anchored to its geo position as the map moves/zooms, then clear after a moment
    const reposition = () => { const p = this.state.map.latLngToContainerPoint(latlng); el.style.left = p.x + 'px'; el.style.top = p.y + 'px'; };
    this.state.map.on('move zoom', reposition);
    setTimeout(() => { this.state.map.off('move zoom', reposition); if (layer.contains(el)) layer.removeChild(el); }, 4000);
  },

  /* ---------- Line / polygon sketching ---------- */
  beginDraw(mode) {
    if (!this.state.map) { this.toast('Map not ready', 'err'); return; }
    this.closeSheet();
    this.hideCollectBar();
    this.state.map.doubleClickZoom.disable();
    this.state.draw = { mode, coords: [], layer: L.layerGroup().addTo(this.state.map) };
    document.getElementById('sketchBar').classList.add('show');
    this.updateSketchCount();
  },
  updateSketchCount() {
    const dr = this.state.draw || this.state.editGeom;
    const n = dr ? dr.coords.length : 0;
    document.getElementById('sketchCount').textContent = `${n} point${n !== 1 ? 's' : ''}`;
    const min = (dr && dr.mode === 'line') ? 2 : 3;
    document.getElementById('skFinish').disabled = n < min;
  },
  undoSketchPoint() {
    const dr = this.state.draw || this.state.editGeom;
    if (!dr || !dr.coords.length) return;
    dr.coords.pop();
    this.redrawSketch(dr);
    this.updateSketchCount();
  },
  redrawSketch(dr) {
    const lyr = dr.layer || dr._reLayer; lyr.clearLayers();
    const ll = dr.coords.map((c) => [c[1], c[0]]);
    dr.coords.forEach((c) => L.circleMarker([c[1], c[0]], { radius: 5, color: '#005E95', weight: 2, fillColor: '#0079C1', fillOpacity: 1 }).addTo(lyr));
    if (dr.mode === 'line' && ll.length > 1) L.polyline(ll, { color: '#0079C1', weight: 4 }).addTo(lyr);
    if (dr.mode === 'polygon' && ll.length > 2) L.polygon(ll, { color: '#0079C1', weight: 2, fillOpacity: 0.2 }).addTo(lyr);
  },

  onMapClick(e) {
    // Point placement: tap = place immediately, no confirm step
    if (this.state.placing && this.state.placing.mode === 'point') {
      const { lat, lng } = e.latlng;
      const d = this.state.draft;
      d.location = { lat, lng, accuracy: null, capturedAt: nowISO() };
      d.geometry = { type: 'Point', coordinates: [lng, lat] };
      this.dropPin(e.latlng, '#0079C1');
      this.endPlacing();
      this.toast('Point placed', 'ok');
      this.autoZ(d);
      setTimeout(() => this.openForm(), 320);
      return;
    }
    // Geometry edit, point mode: tap = reposition immediately
    if (this.state.editGeom && this.state.editGeom.mode === 'point') {
      const { lat, lng } = e.latlng;
      const r = this.state.editGeom.record;
      r.geometry = { type: 'Point', coordinates: [lng, lat, (r.location && r.location.z != null) ? r.location.z : 0] };
      r.location = Object.assign(r.location || {}, { lat, lng });
      this.dropPin(e.latlng, '#0079C1');
      this.finishEditGeom(r);
      this.autoZ(r);
      return;
    }
    // Line/polygon sketching (new draw or geometry edit)
    const dr = this.state.draw || (this.state.editGeom && this.state.editGeom.mode !== 'point' ? this.state.editGeom : null);
    if (!dr) return;
    dr.coords.push([e.latlng.lng, e.latlng.lat]);
    this.redrawSketch(dr);
    this.updateSketchCount();
  },
  confirmDraw() {
    const dr = this.state.draw, d = this.state.draft;
    const min = dr.mode === 'line' ? 2 : 3;
    if (dr.coords.length < min) { this.toast(`Add at least ${min} points`, 'err'); return; }
    d.geometry = dr.mode === 'line' ? { type: 'LineString', coordinates: [...dr.coords] } : { type: 'Polygon', coordinates: [[...dr.coords, dr.coords[0]]] };
    d.location = { lat: dr.coords[0][1], lng: dr.coords[0][0], accuracy: null, capturedAt: nowISO() };
    this.endDraw(); this.toast('Shape captured', 'ok'); this.autoZ(d);
    setTimeout(() => this.openForm(), 200);
  },
  endDraw() {
    if (this.state.draw && this.state.draw.layer) this.state.map.removeLayer(this.state.draw.layer);
    this.state.draw = null;
    if (this.state.map) this.state.map.doubleClickZoom.enable();
    document.getElementById('sketchBar').classList.remove('show');
    this.showCollectBar();
  },

  /* ---------- Media / camera ---------- */
  wireMedia() {
    const d = this.state.draft;
    const iP = document.getElementById('iPhoto'), iV = document.getElementById('iVideo'), iF = document.getElementById('iFile');
    document.getElementById('bPhoto').onclick = () => this.openCamera('photo');
    document.getElementById('bVideo').onclick = () => this.openCamera('video');
    document.getElementById('bFile').onclick = () => iF.click();
    const add = (files, type) => {
      const doAdd = (lat, lng) => Array.from(files).forEach((file) => { const rd = new FileReader(); rd.onload = () => { d.media = d.media || []; d.media.push({ id: uid('m'), type, name: file.name, dataUrl: rd.result, lat, lng, capturedAt: nowISO() }); this.openForm(); }; rd.readAsDataURL(file); });
      // link to record location if we have it, else current GPS
      if (d.location && d.location.lat) doAdd(d.location.lat, d.location.lng);
      else if (navigator.geolocation && type !== 'file') navigator.geolocation.getCurrentPosition((pos) => doAdd(pos.coords.latitude, pos.coords.longitude), () => doAdd(null, null), { enableHighAccuracy: true, timeout: 6000 });
      else doAdd(null, null);
    };
    this._addMediaFiles = add; // reused by the camera's "upload instead" fallback
    iP.onchange = (e) => { if (e.target.files.length) add(e.target.files, 'photo'); e.target.value = ''; };
    iV.onchange = (e) => { if (e.target.files.length) add(e.target.files, 'video'); e.target.value = ''; };
    iF.onchange = (e) => { if (e.target.files.length) add(e.target.files, 'file'); e.target.value = ''; };
    document.querySelectorAll('[data-rm]').forEach((el) => el.onclick = (ev) => { ev.stopPropagation(); d.media.splice(parseInt(el.dataset.rm), 1); this.openForm(); });
  },

  /* ---------- In-app camera: live preview, tap-to-capture, auto-saved ---------- */
  async openCamera(mode) {
    if (!this.state.draft) return;
    this._camMode = mode;
    this._camFacing = this._camFacing || 'environment';
    this._camShots = 0;
    document.getElementById('camThumbs').innerHTML = '';
    document.getElementById('camError').classList.remove('show');
    document.getElementById('camTimer').style.display = 'none';
    document.getElementById('cameraView').classList.add('show');
    document.getElementById('camShutter').classList.remove('recording');
    await this.startCameraStream();
  },
  async startCameraStream(facing) {
    if (this._camStream) { this._camStream.getTracks().forEach((t) => t.stop()); this._camStream = null; }
    const video = document.getElementById('camVideo');
    try {
      const constraints = { video: { facingMode: facing || this._camFacing }, audio: this._camMode === 'video' };
      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      this._camStream = stream;
      video.srcObject = stream;
      document.getElementById('camError').classList.remove('show');
    } catch (err) {
      this.showCameraError(err);
    }
  },
  showCameraError(err) {
    const msg = document.getElementById('camErrorMsg');
    if (err && (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError')) msg.textContent = 'Camera access was blocked. Allow camera access for this site in your browser settings, then try again.';
    else if (err && err.name === 'NotFoundError') msg.textContent = 'No camera was found on this device.';
    else msg.textContent = 'Could not start the camera. You can upload a photo or video file instead.';
    document.getElementById('camError').classList.add('show');
  },
  wireCameraControls() {
    document.getElementById('camClose').onclick = () => this.closeCamera();
    document.getElementById('camDone').onclick = () => this.closeCamera();
    document.getElementById('camSwitch').onclick = () => { this._camFacing = this._camFacing === 'environment' ? 'user' : 'environment'; this.startCameraStream(); };
    document.getElementById('camRetry').onclick = () => this.startCameraStream();
    document.getElementById('camUseFile').onclick = () => { this.closeCamera(); const input = this._camMode === 'video' ? document.getElementById('iVideo') : document.getElementById('iPhoto'); input.click(); };
    document.getElementById('camShutter').onclick = () => { if (this._camMode === 'photo') this.capturePhoto(); else this.toggleVideoRecording(); };
  },
  capturePhoto() {
    const video = document.getElementById('camVideo');
    if (!video.videoWidth) return;
    const canvas = document.getElementById('camCanvas');
    canvas.width = video.videoWidth; canvas.height = video.videoHeight;
    canvas.getContext('2d').drawImage(video, 0, 0);
    const dataUrl = canvas.toDataURL('image/jpeg', 0.88);
    this.attachCapturedMedia('photo', dataUrl);
    this.flashShutter();
    this.addCamThumb(dataUrl, 'photo');
  },
  flashShutter() {
    const v = document.getElementById('camVideo');
    v.style.transition = 'none'; v.style.opacity = '0.4';
    requestAnimationFrame(() => { v.style.transition = 'opacity 0.25s'; v.style.opacity = '1'; });
  },
  toggleVideoRecording() {
    const btn = document.getElementById('camShutter');
    if (this._recorder && this._recorder.state === 'recording') {
      this._recorder.stop();
      return;
    }
    const chunks = [];
    let mr;
    try { mr = new MediaRecorder(this._camStream, { mimeType: MediaRecorder.isTypeSupported('video/webm') ? 'video/webm' : '' }); }
    catch { this.toast('Video recording not supported on this browser', 'err'); return; }
    this._recorder = mr;
    mr.ondataavailable = (e) => { if (e.data.size) chunks.push(e.data); };
    mr.onstop = () => {
      clearInterval(this._camTimerInt);
      document.getElementById('camTimer').style.display = 'none';
      btn.classList.remove('recording');
      const blob = new Blob(chunks, { type: mr.mimeType || 'video/webm' });
      const rd = new FileReader();
      rd.onload = () => { this.attachCapturedMedia('video', rd.result); this.addCamThumb(null, 'video'); };
      rd.readAsDataURL(blob);
    };
    mr.start();
    btn.classList.add('recording');
    let secs = 0;
    document.getElementById('camTimer').style.display = 'flex';
    document.getElementById('camTimerTxt').textContent = '0:00';
    this._camTimerInt = setInterval(() => { secs++; const m = Math.floor(secs / 60), s = secs % 60; document.getElementById('camTimerTxt').textContent = `${m}:${String(s).padStart(2, '0')}`; }, 1000);
  },
  attachCapturedMedia(type, dataUrl) {
    const d = this.state.draft; if (!d) return;
    d.media = d.media || [];
    const loc = d.location || this.state.lastFix;
    d.media.push({ id: uid('m'), type, kind: type, name: `${type}_${Date.now()}.${type === 'video' ? 'webm' : 'jpg'}`, dataUrl, lat: loc ? loc.lat : null, lng: loc ? loc.lng : null, capturedAt: nowISO() });
    this._camShots++;
    this.toast(type === 'photo' ? 'Photo saved to record' : 'Video saved to record', 'ok');
  },
  addCamThumb(dataUrl, type) {
    const strip = document.getElementById('camThumbs');
    const el = document.createElement(dataUrl ? 'img' : 'div');
    if (dataUrl) el.src = dataUrl; else { el.className = 'vt'; el.innerHTML = icon('video', 18); }
    if (!dataUrl) el.classList.add('vt');
    strip.appendChild(el);
    while (strip.children.length > 4) strip.removeChild(strip.firstChild);
  },
  closeCamera() {
    if (this._recorder && this._recorder.state === 'recording') this._recorder.stop();
    if (this._camStream) { this._camStream.getTracks().forEach((t) => t.stop()); this._camStream = null; }
    document.getElementById('cameraView').classList.remove('show');
    if (this.state.draft) this.openForm(); // refresh sheet to show newly captured media
  },

  async saveRecord(status) {
    const d = this.state.draft, l = d._layer;
    // carry Z into point geometry coordinates for true 3D output
    if (d.geometry && d.geometry.type === 'Point' && d.location && d.location.z != null) d.geometry.coordinates[2] = d.location.z;
    const rec = { id: d.id || uid('rec'), projectId: this.state.project.id, layerId: l.id, layerName: l.name, geomType: l.geomType, data: d.data, geometry: d.geometry, location: d.location, media: (d.media || []), surveyor: d.surveyor, role: d.role, status, createdAt: d.createdAt || nowISO(), updatedAt: nowISO() };
    await DB.put('records', rec);
    const i = this.state.records.findIndex((r) => r.id === rec.id);
    if (i >= 0) this.state.records[i] = rec; else this.state.records.unshift(rec);
    this.state.draft = null;
    this.renderAllLayers(); this.refreshBarSub();
    this.toast(status === 'draft' ? 'Saved as draft' : `${l.name} record saved`, 'ok');
    this.closeSheet();
    const g = rec.geometry;
    if (g && this.state.map) { const c = g.type === 'Point' ? g.coordinates : (g.type === 'LineString' ? g.coordinates[0] : g.coordinates[0][0]); this.state.map.setView([c[1], c[0]], Math.max(this.state.map.getZoom(), 16)); }
    // if Z still missing and online, backfill
    if (rec.location && rec.location.z == null && navigator.onLine) this.backfillZ(rec);
  },
  async backfillZ(rec) {
    try { const { z } = await Geo.elevation(rec.location.lat, rec.location.lng); if (z != null) { rec.location.z = Math.round(z * 100) / 100; if (rec.geometry && rec.geometry.type === 'Point') rec.geometry.coordinates[2] = rec.location.z; await DB.put('records', rec); } } catch {}
  },
});

/* ============================================================
   Part 6 — Menu, Export, Import (load existing), boot
   ============================================================ */
Object.assign(App, {
  openMenu() {
    const u = this.state.user || { name: '—', role: '' };
    const body = `
      <div class="userbox"><div class="ic">${icon('user', 22)}</div><div><div class="t">${esc(u.name)}</div><div class="d">${esc(u.role)}</div></div><button class="btn-text" id="editUser" style="margin-left:auto">Edit</button></div>
      <div class="tpl" id="mProjects"><div class="ic">${icon('folder', 21)}</div><div class="tx"><div class="t">Projects</div><div class="d">${esc(this.state.project ? this.state.project.name : 'None')}</div></div><div class="chev">${icon('chevron', 18)}</div></div>
      <div class="tpl" id="mLayers"><div class="ic">${icon('stack', 21)}</div><div class="tx"><div class="t">Layers / feature classes</div><div class="d">Create, symbolize, edit</div></div><div class="chev">${icon('chevron', 18)}</div></div>
      <div class="tpl" id="mImport"><div class="ic">${icon('upload', 21)}</div><div class="tx"><div class="t">Import existing data</div><div class="d">Load GeoJSON into a layer to edit</div></div><div class="chev">${icon('chevron', 18)}</div></div>
      <div class="tpl" id="mExport"><div class="ic">${icon('download', 21)}</div><div class="tx"><div class="t">Export & share</div><div class="d">GeoJSON, KML, Shapefile, CSV, ZIP</div></div><div class="chev">${icon('chevron', 18)}</div></div>
      <div class="tpl" id="mClearTrail"><div class="ic">${icon('navigation', 21)}</div><div class="tx"><div class="t">Clear location trail</div><div class="d">${(this.state.trail || []).length} tracked points this session</div></div></div>
      ${this.state.project ? `<div class="card" style="margin-top:6px"><div class="card-lbl">${icon('globe', 12, 'display:inline;vertical-align:-2px')} Project coordinate system</div><div style="font-family:var(--mono);font-size:12.5px">${esc(this.state.project.crsName)} · ${esc(this.state.project.crsCode)}</div></div>` : ''}
      <button class="btn btn-danger btn-block" id="mWipe">${icon('trash', 16)} Erase all local data</button>
      <div class="muted" style="text-align:center;margin-top:14px">Smart Maidani · offline-first field GIS</div>`;
    this.openSheet('Menu', body);
    document.getElementById('editUser').onclick = () => this.showWelcome();
    document.getElementById('mProjects').onclick = () => this.navTo(this.openProjectPicker);
    document.getElementById('mLayers').onclick = () => this.navTo(this.openLayers);
    document.getElementById('mImport').onclick = () => this.navTo(this.openImport);
    document.getElementById('mExport').onclick = () => this.navTo(this.openExport);
    document.getElementById('mClearTrail').onclick = () => { this.clearTrail(); this.goBack(); };
    document.getElementById('mWipe').onclick = async () => {
      if (!confirm('Erase ALL data on this device (projects, layers, records, media, profile)? This cannot be undone.')) return;
      await DB.clear('projects'); await DB.clear('layers'); await DB.clear('records'); await DB.clear('media'); await DB.clear('user');
      localStorage.clear(); location.reload();
    };
  },

  /* ---------- Import existing data ---------- */
  openImport() {
    if (!this.state.project) { this.toast('Select a project first', 'err'); return; }
    const layers = this.state.layers.filter((l) => l.projectId === this.state.project.id);
    const body = `
      <div class="note" style="margin-bottom:12px">Load a <b>GeoJSON</b> file. Each feature becomes an editable record. Choose which layer to import into (or create one first that matches the geometry).</div>
      <div class="field"><label class="lbl">Import into layer</label><select class="sel" id="impLayer">${layers.length ? layers.map((l) => `<option value="${l.id}">${esc(l.name)} (${l.geomType})</option>`).join('') : '<option value="">— no layers, create one first —</option>'}</select></div>
      <input type="file" id="impFile" accept=".geojson,.json,application/geo+json,application/json" hidden />
      <button class="btn btn-primary btn-block" id="impBtn" ${layers.length ? '' : 'disabled'}>${icon('upload', 16)} Choose GeoJSON file</button>`;
    this.openSheet('Import data', body);
    const file = document.getElementById('impFile');
    document.getElementById('impBtn').onclick = () => file.click();
    file.onchange = (e) => { const f = e.target.files[0]; if (!f) return; const rd = new FileReader(); rd.onload = () => this.doImport(rd.result, document.getElementById('impLayer').value); rd.readAsText(f); e.target.value = ''; };
  },
  async doImport(text, layerId) {
    const l = this.state.layers.find((x) => x.id === layerId); if (!l) { this.toast('Pick a layer', 'err'); return; }
    let gj; try { gj = JSON.parse(text); } catch { this.toast('Invalid JSON', 'err'); return; }
    const feats = gj.type === 'FeatureCollection' ? gj.features : (gj.type === 'Feature' ? [gj] : []);
    if (!feats.length) { this.toast('No features found', 'err'); return; }
    let n = 0;
    for (const f of feats) {
      if (!f.geometry) continue;
      const gt = f.geometry.type;
      const geomType = gt === 'Point' ? 'point' : gt === 'LineString' ? 'line' : gt === 'Polygon' ? 'polygon' : null;
      if (!geomType) continue;
      const props = f.properties || {};
      const data = {};
      l.fields.forEach((fl) => { const hit = Object.keys(props).find((k) => k.toLowerCase() === fl.key.toLowerCase() || k.toLowerCase() === fl.label.toLowerCase()); if (hit) data[fl.key] = props[hit]; });
      let loc = null;
      if (gt === 'Point') loc = { lat: f.geometry.coordinates[1], lng: f.geometry.coordinates[0], z: f.geometry.coordinates[2] ?? props.Z_Elevation ?? null, accuracy: null };
      else { const c0 = gt === 'Polygon' ? f.geometry.coordinates[0][0] : f.geometry.coordinates[0]; loc = { lat: c0[1], lng: c0[0], z: props.Z_Elevation ?? null, accuracy: null }; }
      const rec = { id: uid('rec'), projectId: this.state.project.id, layerId: l.id, layerName: l.name, geomType, data, geometry: f.geometry, location: loc, media: [], surveyor: props.surveyor || this.state.user.name, role: props.role || this.state.user.role, status: 'completed', createdAt: nowISO(), updatedAt: nowISO() };
      await DB.put('records', rec); this.state.records.unshift(rec); n++;
    }
    this.renderAllLayers(); this.refreshBarSub();
    this.toast(`Imported ${n} feature${n !== 1 ? 's' : ''} into ${l.name}`, 'ok');
    this.closeSheet();
    // zoom to imported
    const recs = this.state.records.filter((r) => r.layerId === l.id);
    if (recs.length && this.state.map) { const g = Exporter.geometryOf(recs[0]); const c = g.type === 'Point' ? g.coordinates : (g.type === 'LineString' ? g.coordinates[0] : g.coordinates[0][0]); this.state.map.setView([c[1], c[0]], 15); }
  },

  /* ---------- Export ---------- */
  openExport() {
    if (!this.state.project) { this.toast('Select a project first', 'err'); return; }
    const layers = this.state.layers.filter((l) => l.projectId === this.state.project.id);
    this._exLayer = this._exLayer || 'all';
    const recsFor = () => { let rs = this.state.records.filter((r) => r.projectId === this.state.project.id); if (this._exLayer !== 'all') rs = rs.filter((r) => r.layerId === this._exLayer); return rs; };
    const recs = recsFor();
    const body = `
      <div class="field"><label class="lbl">Layer</label><select class="sel" id="exLayerSel"><option value="all" ${this._exLayer === 'all' ? 'selected' : ''}>All layers (${this.state.records.filter((r) => r.projectId === this.state.project.id).length})</option>${layers.map((l) => `<option value="${l.id}" ${this._exLayer === l.id ? 'selected' : ''}>${esc(l.name)} (${this.state.records.filter((r) => r.layerId === l.id).length})</option>`).join('')}</select></div>
      <div class="card"><div class="card-lbl">GIS formats · ${recs.length} record${recs.length !== 1 ? 's' : ''} · ${esc(this.state.project.crsName)}</div>
        <div class="export-grid">
          <button class="ex-btn" data-ex="geojson">${icon('mapPin', 22)} GeoJSON<span class="f">.geojson</span></button>
          <button class="ex-btn" data-ex="kml">${icon('mapPin', 22)} KML<span class="f">.kml</span></button>
          <button class="ex-btn" data-ex="shp">${icon('layers', 22)} Shapefile<span class="f">.zip</span></button>
          <button class="ex-btn" data-ex="csv">${icon('grid', 22)} CSV<span class="f">.csv</span></button>
          <button class="ex-btn" data-ex="xlsx">${icon('grid', 22)} Excel<span class="f">.xlsx</span></button>
          <button class="ex-btn" data-ex="pdf">${icon('file', 22)} PDF<span class="f">.pdf</span></button>
        </div></div>
      <div class="card"><div class="card-lbl">Complete package</div><button class="btn btn-primary btn-block" id="exZip">${icon('package', 16)} Build ZIP (data + media + report)</button>
        <div class="muted" style="margin-top:8px">Includes GeoJSON, KML, CSV, Shapefile, geotagged media and a README. Geometry carries Z. Coordinates in ${esc(this.state.project.crsName)}.</div></div>
      <div class="card"><div class="card-lbl">Share</div><div style="display:flex;gap:8px"><button class="btn btn-ghost flex" id="exShare">${icon('share', 16)} Device share</button><button class="btn btn-ghost flex" id="exMail">${icon('mail', 16)} Email</button></div></div>`;
    this.openSheet(`Export · ${this.state.project.name}`, body);
    document.getElementById('exLayerSel').onchange = (e) => { this._exLayer = e.target.value; this.openExport(); };
    const proj = this.state.project, safe = proj.name.replace(/\s+/g, '_');
    const reproj = (gj) => this.reprojectGeoJSON(gj, proj.crsCode);
    document.querySelectorAll('[data-ex]').forEach((b) => b.onclick = async () => {
      const s = recsFor(); if (!s.length) { this.toast('No records to export', 'err'); return; }
      const ex = b.dataset.ex;
      try {
        if (ex === 'geojson') { const gj = reproj(Exporter.toGeoJSON(s)); downloadBlob(`${safe}.geojson`, JSON.stringify(gj, null, 2), 'application/geo+json'); this.toast('GeoJSON downloaded', 'ok'); }
        else if (ex === 'kml') { downloadBlob(`${safe}.kml`, Exporter.toKML(s, proj.name), 'application/vnd.google-earth.kml+xml'); this.toast('KML downloaded (WGS84)', 'ok'); }
        else if (ex === 'csv') { downloadBlob(`${safe}.csv`, Exporter.toCSV(s), 'text/csv'); this.toast('CSV downloaded', 'ok'); }
        else if (ex === 'xlsx') { Exporter.downloadExcel(s, proj.name); this.toast('Excel downloaded', 'ok'); }
        else if (ex === 'shp') { const bl = Exporter.toShapefileZip(s, proj.name); if (bl) { downloadBlob(`${safe}_shapefile.zip`, bl, 'application/zip'); this.toast('Shapefile downloaded', 'ok'); } else this.toast('No mappable geometry', 'err'); }
        else if (ex === 'pdf') { if (Exporter.openPDFReport(s, proj)) this.toast('Choose Save as PDF', 'ok'); else this.toast('Allow popups for PDF', 'err'); }
      } catch (e) { this.toast('Export failed: ' + e.message, 'err'); }
    });
    document.getElementById('exZip').onclick = async () => {
      const s = recsFor(); if (!s.length) { this.toast('No records', 'err'); return; }
      const btn = document.getElementById('exZip'); btn.innerHTML = `${icon('refresh', 16, 'display:inline-block')} Building…`;
      try { const blob = await Exporter.buildZipPackage(s, proj); downloadBlob(`${safe}_package.zip`, blob, 'application/zip'); this.toast('ZIP downloaded', 'ok'); } catch (e) { this.toast('ZIP failed: ' + e.message, 'err'); }
      btn.innerHTML = `${icon('package', 16)} Build ZIP (data + media + report)`;
    };
    document.getElementById('exShare').onclick = async () => { const s = recsFor(); if (!s.length) return; const gj = JSON.stringify(reproj(Exporter.toGeoJSON(s)), null, 2); const file = new File([gj], `${safe}.geojson`, { type: 'application/geo+json' }); if (navigator.canShare && navigator.canShare({ files: [file] })) { try { await navigator.share({ files: [file], title: proj.name }); } catch {} } else if (navigator.share) { try { await navigator.share({ title: proj.name, text: `${s.length} records` }); } catch {} } else this.toast('Sharing not supported — use download', 'err'); };
    document.getElementById('exMail').onclick = () => { const s = recsFor(); window.location.href = `mailto:?subject=${encodeURIComponent('Field data — ' + proj.name)}&body=${encodeURIComponent(`${s.length} record(s) from "${proj.name}". Attach the exported file.`)}`; };
  },

  // Reproject a WGS84 GeoJSON to the project CRS for export (coordinates become E/N)
  reprojectGeoJSON(gj, crsCode) {
    if (!crsCode || crsCode === 'EPSG:4326' || typeof Geo === 'undefined') return gj;
    const conv = (coords) => { if (typeof coords[0] === 'number') { const p = Geo.project([coords[0], coords[1]], crsCode); return coords.length > 2 ? [p[0], p[1], coords[2]] : [p[0], p[1]]; } return coords.map(conv); };
    const out = JSON.parse(JSON.stringify(gj));
    out.features.forEach((f) => { if (f.geometry && f.geometry.coordinates) f.geometry.coordinates = conv(f.geometry.coordinates); });
    out.crs = { type: 'name', properties: { name: crsCode } };
    return out;
  },
});

document.addEventListener('DOMContentLoaded', () => App.init());
