# Smart Maidani V6

## V6.1 — Field-robustness hardening (final test pass)

### GPS — instant offline capture, guaranteed
- The continuous GPS watch now auto-restarts after transient errors (cold start, tunnels, poor sky view) instead of dying silently, so a live fix is always warm when the surveyor taps **Use GPS**.
- When the app returns to the foreground the watch restarts immediately — mobile browsers suspend geolocation in the background, and this ensures a fresh fix is ready before capture, fully offline.
- A blocked location permission is now reported once with clear instructions instead of failing silently.
- `Use GPS` additionally (re)starts the watch itself, so even if the map failed to initialize the first capture primes instant captures for the rest of the shift.

### Z-Elevation
- **Offline records now genuinely backfill Z when connectivity returns** (previously only promised): an online-event listener scans stored records missing Z and fills them sequentially (rate-limited, resumable).
- Exported **GeoJSON, KML and the ZIP package now truly carry the Z coordinate** — the V6 geometry normalizer was stripping the third coordinate, leaving only the Z_ELEVATION attribute. Points export as real 3D coordinates again; KML altitude uses the stored Z instead of a hard-coded 0.

### Dead code / leftovers removed
- Removed the unused `selectFeature` method (superseded by the map feature click handler) and wired the previously-dead `clearSelection` to the Escape key (press Esc with a selection to deselect — ArcMap behavior).
- Removed a no-op `locateBtn` class toggle in the GPS fix handler.
- Purged leftover "TerraField" branding from the ZIP export README, LICENSE and CSS header.
- Guarded the delayed registration-field focus against a replaced sheet.
- Service worker cache bumped to v15 so all clients pick up the fixes.


## ArcMap-safe geometry export

- Replaced the third-party browser Shapefile converter with a deterministic ESRI Shapefile writer.
- Point, polyline and polygon records now have matched SHP/SHX offsets, validated extents and geometry-specific feature classes.
- Every Asset Type exports as its own feature class instead of a generic `points`, `lines` or `polygons` layer.
- Invalid or collapsed geometries are excluded and listed in `SKIPPED_FEATURES.csv` instead of corrupting the export.

## Esri-standard row and attachment IDs

- ArcMap supplies the native zero-based `FID` for each Shapefile row.
- `OBJECTID` is exported as a stable one-based row value in Shapefile, Excel, CSV and GeoJSON.
- Private application keys are removed from GIS-facing tables.
- Media files are named from the feature class and FID, for example `Water_Line_FID_000000_SITE_PHOTO_01.jpg`.
- `ATTACHMENTS.csv` and the Excel `Attachments` sheet relate files through `FEATURE_CLASS`, `REL_FID` and `REL_OBJECTID`.

## Robust offline hyperlinks

- Shapefile DBF tables contain ArcMap-safe `PHOTO_URL`, `VIDEO_URL` and `MEDIA_ALL` fields using Windows relative document paths.
- `SET_ARCMAP_HYPERLINK_BASE.py` configures the extracted directory as the ArcMap map document's Hyperlink Base.
- The ArcMap README identifies the correct Layer Properties **Display** tab; the HTML Popup tab does not enable field hyperlinks.
- Excel includes both hyperlink relationships and `HYPERLINK()` formulas in the `Features` and `Attachments` sheets.
