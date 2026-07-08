/* ============================================================
   Export engine — GIS-ready outputs for the GIS specialist
   Formats: GeoJSON, KML, CSV, Shapefile (zip), full ZIP package
   Geometry: Point / LineString / Polygon
   ============================================================ */
const Exporter = (() => {

  function geometryOf(rec) {
    if (!rec.geometry) {
      if (rec.location) {
        const c = [rec.location.lng, rec.location.lat];
        if (rec.location.z != null) c.push(rec.location.z);
        return { type: 'Point', coordinates: c };
      }
      return null;
    }
    return rec.geometry;
  }

  function propsOf(rec) {
    return {
      record_id: rec.id,
      layer: rec.layerName || '',
      status: rec.status || '',
      surveyor: rec.surveyor || '',
      role: rec.role || '',
      Z_Elevation: (rec.location && rec.location.z != null) ? rec.location.z : '',
      created_at: rec.createdAt || '',
      updated_at: rec.updatedAt || '',
      gps_accuracy_m: rec.location && rec.location.accuracy != null ? Math.round(rec.location.accuracy) : '',
      photo_count: (rec.media || []).filter((m) => m.type === 'photo').length,
      video_count: (rec.media || []).filter((m) => m.type === 'video').length,
      ...(rec.data || {}),
    };
  }

  /* ---------- GeoJSON ---------- */
  function toGeoJSON(records) {
    return {
      type: 'FeatureCollection',
      features: records
        .map((r) => {
          const g = geometryOf(r);
          if (!g) return null;
          return { type: 'Feature', geometry: g, properties: propsOf(r) };
        })
        .filter(Boolean),
    };
  }

  /* ---------- CSV (attribute table) ---------- */
  function toCSV(records) {
    const cols = new Set(['record_id', 'form', 'status', 'surveyor', 'created_at', 'updated_at', 'geometry_type', 'longitude', 'latitude', 'gps_accuracy_m']);
    records.forEach((r) => Object.keys(r.data || {}).forEach((k) => cols.add(k)));
    const arr = [...cols];
    const q = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
    const lines = [arr.join(',')];
    records.forEach((r) => {
      const g = geometryOf(r);
      let lng = '', lat = '', gtype = '';
      if (g) {
        gtype = g.type;
        if (g.type === 'Point') { [lng, lat] = g.coordinates; }
        else if (g.type === 'LineString' && g.coordinates[0]) { [lng, lat] = g.coordinates[0]; }
        else if (g.type === 'Polygon' && g.coordinates[0] && g.coordinates[0][0]) { [lng, lat] = g.coordinates[0][0]; }
      }
      const base = {
        record_id: r.id, form: r.formName, status: r.status, surveyor: r.surveyor,
        created_at: r.createdAt, updated_at: r.updatedAt,
        geometry_type: gtype, longitude: lng, latitude: lat,
        gps_accuracy_m: r.location ? Math.round(r.location.accuracy) : '',
      };
      lines.push(arr.map((c) => q(base[c] !== undefined ? base[c] : (r.data || {})[c])).join(','));
    });
    return lines.join('\n');
  }

  /* ---------- KML ---------- */
  function toKML(records, projectName) {
    const placemarks = records.map((r) => {
      const g = geometryOf(r);
      if (!g) return '';
      const p = propsOf(r);
      const desc = Object.entries(p).map(([k, v]) => `${esc(k)}: ${esc(v)}`).join('<br/>');
      let geomKml = '';
      if (g.type === 'Point') {
        geomKml = `<Point><coordinates>${g.coordinates[0]},${g.coordinates[1]},0</coordinates></Point>`;
      } else if (g.type === 'LineString') {
        geomKml = `<LineString><coordinates>${g.coordinates.map((c) => `${c[0]},${c[1]},0`).join(' ')}</coordinates></LineString>`;
      } else if (g.type === 'Polygon') {
        geomKml = `<Polygon><outerBoundaryIs><LinearRing><coordinates>${g.coordinates[0].map((c) => `${c[0]},${c[1]},0`).join(' ')}</coordinates></LinearRing></outerBoundaryIs></Polygon>`;
      }
      const name = (r.data && (r.data.asset_id || r.data.line_id || r.data.name || r.data.work_order)) || r.formName || 'Feature';
      return `<Placemark><name>${esc(name)}</name><description><![CDATA[${desc}]]></description>${geomKml}</Placemark>`;
    }).join('\n');
    return `<?xml version="1.0" encoding="UTF-8"?>
<kml xmlns="http://www.opengis.net/kml/2.2"><Document><name>${esc(projectName)}</name>
${placemarks}
</Document></kml>`;
  }

  /* ---------- Shapefile (zip) via shpwrite ---------- */
  function toShapefileZip(records, projectName) {
    // shpwrite groups by geometry type automatically; returns base64 or downloads.
    // We use its zip() which returns a base64 string (v0.3.x) — normalize to Blob.
    const gj = toGeoJSON(records);
    if (!window.shpwrite || gj.features.length === 0) return null;
    try {
      const content = shpwrite.zip(gj, {
        folder: projectName.replace(/\s+/g, '_'),
        types: { point: 'points', polygon: 'polygons', line: 'lines' },
      });
      // shpwrite.zip returns base64 string
      if (typeof content === 'string') {
        const bytes = Uint8Array.from(atob(content), (c) => c.charCodeAt(0));
        return new Blob([bytes], { type: 'application/zip' });
      }
      return content; // already a blob in some builds
    } catch (e) {
      console.warn('Shapefile export failed', e);
      return null;
    }
  }

  /* ---------- PDF report (print window) ---------- */
  function openPDFReport(records, project) {
    const win = window.open('', '_blank');
    if (!win) return false;
    const rows = records.map((r) => {
      const g = geometryOf(r);
      let loc = '';
      if (g && g.type === 'Point') loc = `${g.coordinates[1].toFixed(6)}, ${g.coordinates[0].toFixed(6)}`;
      else if (g) loc = `${g.type} (${g.coordinates.flat(2).length / 2} vertices)`;
      const photos = (r.media || []).filter((m) => m.type === 'photo').slice(0, 4);
      return `
      <div class="rec">
        <div class="rh">${esc(r.formName || 'Record')} — ${esc((r.data && (r.data.asset_id || r.data.line_id || r.data.name)) || r.id)}</div>
        <div class="rm">Status: ${esc(r.status)} · Surveyor: ${esc(r.surveyor || '—')} · ${esc(fmtDate(r.updatedAt))}</div>
        <table>${Object.entries(r.data || {}).map(([k, v]) => `<tr><td class="k">${esc(k.replace(/_/g, ' '))}</td><td>${esc(v)}</td></tr>`).join('')}
          ${loc ? `<tr><td class="k">location</td><td>${esc(loc)}${r.location ? ` (±${Math.round(r.location.accuracy)}m)` : ''}</td></tr>` : ''}</table>
        ${photos.length ? `<div class="ph">${photos.map((p) => `<img src="${p.dataUrl}" />`).join('')}</div>` : ''}
      </div>`;
    }).join('');
    win.document.write(`<!DOCTYPE html><html><head><meta charset="utf-8"><title>${esc(project.name)} — Field Report</title>
      <style>
        body{font-family:-apple-system,Segoe UI,Roboto,sans-serif;padding:28px;color:#141A1F;}
        h1{font-size:22px;margin:0 0 4px;} .sub{color:#55636D;font-size:12px;margin-bottom:22px;}
        .rec{border:1px solid #D5DBD9;border-radius:8px;padding:14px;margin-bottom:16px;page-break-inside:avoid;}
        .rh{font-weight:700;font-size:14px;} .rm{font-size:11px;color:#666;margin:3px 0 8px;}
        table{width:100%;border-collapse:collapse;font-size:12px;} td{padding:4px 3px;border-bottom:1px solid #eee;} td.k{color:#888;width:40%;text-transform:capitalize;}
        .ph{display:flex;gap:6px;margin-top:8px;} .ph img{width:90px;height:90px;object-fit:cover;border-radius:5px;}
      </style></head><body>
      <h1>${esc(project.name)}</h1>
      <div class="sub">Field data report · ${records.length} records · Generated ${esc(fmtDate(nowISO()))}</div>
      ${rows}
      <script>window.onload=function(){setTimeout(function(){window.print();},400);};<\/script>
      </body></html>`);
    win.document.close();
    return true;
  }

  /* ---------- Excel via SheetJS ---------- */
  function downloadExcel(records, projectName) {
    const cols = new Set(['record_id', 'form', 'status', 'surveyor', 'created_at', 'updated_at', 'geometry_type', 'longitude', 'latitude', 'gps_accuracy_m']);
    records.forEach((r) => Object.keys(r.data || {}).forEach((k) => cols.add(k)));
    const arr = [...cols];
    const aoa = [arr];
    records.forEach((r) => {
      const g = geometryOf(r);
      let lng = '', lat = '', gtype = '';
      if (g) { gtype = g.type; const c = g.type === 'Point' ? g.coordinates : (g.type === 'LineString' ? g.coordinates[0] : g.coordinates[0][0]); if (c) { lng = c[0]; lat = c[1]; } }
      const base = { record_id: r.id, form: r.formName, status: r.status, surveyor: r.surveyor, created_at: r.createdAt, updated_at: r.updatedAt, geometry_type: gtype, longitude: lng, latitude: lat, gps_accuracy_m: r.location ? Math.round(r.location.accuracy) : '' };
      aoa.push(arr.map((c) => base[c] !== undefined ? base[c] : (r.data || {})[c] ?? ''));
    });
    const ws = XLSX.utils.aoa_to_sheet(aoa);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Attributes');
    XLSX.writeFile(wb, `${projectName.replace(/\s+/g, '_')}_attributes.xlsx`);
  }

  /* ---------- Full ZIP package ---------- */
  async function buildZipPackage(records, project) {
    const zip = new JSZip();
    const safe = project.name.replace(/\s+/g, '_');

    zip.file('data/attributes.csv', toCSV(records));
    zip.file('data/features.geojson', JSON.stringify(toGeoJSON(records), null, 2));
    zip.file('data/features.kml', toKML(records, project.name));
    zip.file('data/project.json', JSON.stringify({ project, records, exportedAt: nowISO() }, null, 2));

    // Shapefile
    const shp = toShapefileZip(records, project.name);
    if (shp) zip.file('data/shapefile.zip', shp);

    // Media
    const mediaFolder = zip.folder('media');
    let mediaManifest = [];
    records.forEach((r) => {
      (r.media || []).forEach((m, i) => {
        if (!m.dataUrl) return;
        const ext = m.type === 'video' ? 'webm' : 'jpg';
        const fname = `${r.id}_${m.kind || m.type}_${i}.${ext}`;
        const base64 = m.dataUrl.split(',')[1];
        mediaFolder.file(fname, base64, { base64: true });
        mediaManifest.push({ record_id: r.id, file: `media/${fname}`, type: m.type, kind: m.kind, lat: m.lat, lng: m.lng, captured_at: m.capturedAt });
      });
    });
    zip.file('media/manifest.json', JSON.stringify(mediaManifest, null, 2));

    zip.file('README.txt',
`${project.name} — TerraField export
Generated: ${nowISO()}
Records: ${records.length}

CONTENTS
  data/features.geojson  GeoJSON (points, lines, polygons) — primary GIS format
  data/features.kml      KML for Google Earth / viewers
  data/attributes.csv    Attribute table (flat, one row per record)
  data/shapefile.zip     ESRI Shapefile set (grouped by geometry type)
  data/project.json      Complete structured backup (re-importable)
  media/                 Geotagged photos and video, named by record ID
  media/manifest.json    Media index with per-file lat/lng and capture time

COORDINATE SYSTEM
  WGS84 (EPSG:4326). Longitude, latitude in decimal degrees.

NOTES FOR GIS
  - Join media to features on 'record_id'.
  - CSV includes longitude/latitude for point features; use GeoJSON/Shapefile for lines and polygons.
`);

    return await zip.generateAsync({ type: 'blob' });
  }

  return { toGeoJSON, toCSV, toKML, toShapefileZip, openPDFReport, downloadExcel, buildZipPackage, geometryOf };
})();

/* ---------- shared download helper ---------- */
function downloadBlob(filename, content, mime) {
  const blob = content instanceof Blob ? content : new Blob([content], { type: mime || 'text/plain' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename;
  document.body.appendChild(a); a.click(); document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 3000);
}
