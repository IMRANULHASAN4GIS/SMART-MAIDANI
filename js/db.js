/* ============================================================
   Smart Maidani — IndexedDB persistence
   Stores: user, projects, layers (feature classes), records, media, settings
   Offline-first. All geometry stored WGS84; reprojected on display/export.
   ============================================================ */
const DB = (() => {
  const NAME = 'smartmaidani';
  const VERSION = 1;
  let db = null;

  function open() {
    return new Promise((resolve, reject) => {
      if (db) return resolve(db);
      const req = indexedDB.open(NAME, VERSION);
      req.onupgradeneeded = (e) => {
        const d = e.target.result;
        if (!d.objectStoreNames.contains('user')) d.createObjectStore('user', { keyPath: 'key' });
        if (!d.objectStoreNames.contains('projects')) d.createObjectStore('projects', { keyPath: 'id' });
        if (!d.objectStoreNames.contains('layers')) {
          const ls = d.createObjectStore('layers', { keyPath: 'id' });
          ls.createIndex('projectId', 'projectId', { unique: false });
        }
        if (!d.objectStoreNames.contains('records')) {
          const rs = d.createObjectStore('records', { keyPath: 'id' });
          rs.createIndex('projectId', 'projectId', { unique: false });
          rs.createIndex('layerId', 'layerId', { unique: false });
        }
        if (!d.objectStoreNames.contains('media')) d.createObjectStore('media', { keyPath: 'id' });
        if (!d.objectStoreNames.contains('settings')) d.createObjectStore('settings', { keyPath: 'key' });
      };
      req.onsuccess = (e) => { db = e.target.result; resolve(db); };
      req.onerror = (e) => reject(e.target.error);
    });
  }
  const tx = (store, mode) => open().then((d) => d.transaction(store, mode).objectStore(store));

  return {
    async put(store, obj) { const s = await tx(store, 'readwrite'); return new Promise((res, rej) => { const r = s.put(obj); r.onsuccess = () => res(obj); r.onerror = () => rej(r.error); }); },
    async get(store, key) { const s = await tx(store, 'readonly'); return new Promise((res, rej) => { const r = s.get(key); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); }); },
    async all(store) { const s = await tx(store, 'readonly'); return new Promise((res, rej) => { const r = s.getAll(); r.onsuccess = () => res(r.result || []); r.onerror = () => rej(r.error); }); },
    async byIndex(store, index, value) { const s = await tx(store, 'readonly'); return new Promise((res, rej) => { const r = s.index(index).getAll(value); r.onsuccess = () => res(r.result || []); r.onerror = () => rej(r.error); }); },
    async del(store, key) { const s = await tx(store, 'readwrite'); return new Promise((res, rej) => { const r = s.delete(key); r.onsuccess = () => res(); r.onerror = () => rej(r.error); }); },
    async clear(store) { const s = await tx(store, 'readwrite'); return new Promise((res, rej) => { const r = s.clear(); r.onsuccess = () => res(); r.onerror = () => rej(r.error); }); },
  };
})();

const uid = (p = 'id') => `${p}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
const nowISO = () => new Date().toISOString();
const fmtDate = (iso) => { if (!iso) return '—'; const d = new Date(iso); return d.toLocaleDateString(undefined, { month: 'short', day: '2-digit', year: 'numeric' }) + ' ' + d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' }); };
const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/* ============================================================
   Media blob storage — photos/videos stored as binary Blobs in
   the dedicated 'media' store; records hold metadata references.
   ============================================================ */
const Media = {
  async save(id, blob) { await DB.put('media', { id, blob, savedAt: nowISO() }); return id; },
  async blob(id) { const row = await DB.get('media', id); return row ? row.blob : null; },
  async remove(id) { try { await DB.del('media', id); } catch {} },
  _urls: {},
  // Object URL for display; cached per id, revoke via releaseAll when a view closes.
  async url(m) {
    if (m.dataUrl) return m.dataUrl;               // legacy records (pre-blob) keep working
    if (this._urls[m.id]) return this._urls[m.id];
    const b = await this.blob(m.id);
    if (!b) return null;
    const u = URL.createObjectURL(b);
    this._urls[m.id] = u;
    return u;
  },
  releaseAll() { Object.values(this._urls).forEach((u) => URL.revokeObjectURL(u)); this._urls = {}; },
  async dataUrlOf(m) {                              // for PDF export embedding
    if (m.dataUrl) return m.dataUrl;
    const b = await this.blob(m.id);
    if (!b) return null;
    return new Promise((res) => { const r = new FileReader(); r.onload = () => res(r.result); r.onerror = () => res(null); r.readAsDataURL(b); });
  },
};
