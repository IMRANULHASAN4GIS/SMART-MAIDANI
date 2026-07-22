/* ============================================================
   EasyCapture — Geodesy: coordinate systems + elevation
   - Internal storage is always WGS84 lng/lat (EPSG:4326)
   - proj4 reprojects for display and export
   - Z auto-filled from Open-Meteo elevation API (free, no key)
   ============================================================ */
const Geo = (() => {

  // Common coordinate systems offered up front. proj4 knows EPSG:4326 natively.
  // UTM/others are registered on demand from an EPSG code.
  const COMMON = [
    { code: 'EPSG:4326', name: 'WGS 84 (GCS, lat/long)', kind: 'gcs' },
    { code: 'EPSG:3857', name: 'Web Mercator', kind: 'projected' },
    { code: 'EPSG:4269', name: 'NAD83 (GCS)', kind: 'gcs' },
  ];

  // Compute UTM EPSG code from lng/lat
  function utmZoneFromLngLat(lng, lat) {
    const zone = Math.floor((lng + 180) / 6) + 1;
    const north = lat >= 0;
    const epsg = (north ? 32600 : 32700) + zone;
    return { zone, hemisphere: north ? 'N' : 'S', code: `EPSG:${epsg}`, name: `UTM Zone ${zone}${north ? 'N' : 'S'} (WGS 84)` };
  }

  // proj4 defs for UTM built dynamically
  function ensureDef(code) {
    if (typeof proj4 === 'undefined') return false;
    if (proj4.defs(code)) return true;
    const m = /^EPSG:(\d+)$/.exec(code);
    if (!m) return false;
    const n = parseInt(m[1]);
    // UTM north 326xx, south 327xx
    if (n >= 32601 && n <= 32660) { const z = n - 32600; proj4.defs(code, `+proj=utm +zone=${z} +datum=WGS84 +units=m +no_defs`); return true; }
    if (n >= 32701 && n <= 32760) { const z = n - 32700; proj4.defs(code, `+proj=utm +zone=${z} +south +datum=WGS84 +units=m +no_defs`); return true; }
    if (code === 'EPSG:3857') return true; // built-in
    if (code === 'EPSG:4269') { proj4.defs(code, '+proj=longlat +datum=NAD83 +no_defs'); return true; }
    return !!proj4.defs(code);
  }

  // Project a single [lng,lat] (WGS84) into target EPSG. Returns [x,y] or original if unavailable.
  function project(lngLat, targetCode) {
    if (!targetCode || targetCode === 'EPSG:4326' || typeof proj4 === 'undefined') return lngLat.slice();
    if (!ensureDef(targetCode)) return lngLat.slice();
    try { return proj4('EPSG:4326', targetCode, lngLat); } catch { return lngLat.slice(); }
  }

  // Format a projected coordinate for display
  function format(lngLat, targetCode) {
    if (!targetCode || targetCode === 'EPSG:4326') return `${lngLat[1].toFixed(6)}, ${lngLat[0].toFixed(6)}`;
    const p = project(lngLat, targetCode);
    // projected are meters — show with 2 decimals, E/N
    if (targetCode.startsWith('EPSG:326') || targetCode.startsWith('EPSG:327') || targetCode === 'EPSG:3857') {
      return `E ${p[0].toFixed(2)}  N ${p[1].toFixed(2)}`;
    }
    return `${p[0].toFixed(4)}, ${p[1].toFixed(4)}`;
  }

  // Elevation lookup — Open-Meteo (primary) then Open-Elevation (fallback).
  async function elevation(lat, lng) {
    // Open-Meteo
    try {
      const r = await fetch(`https://api.open-meteo.com/v1/elevation?latitude=${lat}&longitude=${lng}`, { cache: 'no-store' });
      if (r.ok) { const j = await r.json(); if (j && Array.isArray(j.elevation) && j.elevation.length) return { z: j.elevation[0], source: 'Open-Meteo' }; }
    } catch {}
    // Open-Elevation fallback
    try {
      const r = await fetch(`https://api.open-elevation.com/api/v1/lookup?locations=${lat},${lng}`, { cache: 'no-store' });
      if (r.ok) { const j = await r.json(); if (j && j.results && j.results.length) return { z: j.results[0].elevation, source: 'Open-Elevation' }; }
    } catch {}
    return { z: null, source: null };
  }

  return { COMMON, utmZoneFromLngLat, project, format, elevation, ensureDef };
})();
