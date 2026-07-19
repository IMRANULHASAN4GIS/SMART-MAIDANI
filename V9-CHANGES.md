# Smart Maidani V9 — Template System (municipal schema round-trip)

The professional workflow: office authors the schema once, the surveyor
imports it once and only collects, data returns fitting the geodatabase
exactly. Verified end-to-end against the real AAM_SW template (35 feature
classes, 84 domains, EPSG:32640). All 5 automated suites pass (125+ checks).

## Import Schema (Template) — new project-start path
Project setup now offers "Import Schema (Template)" alongside Import Data and
From Scratch. Load a Template Pack (.smtp.json, produced by the SmartMaidani.pyt
geoprocessing toolbox from the office .gdb): searchable feature-class picker
(tick today's classes), then automatic-field mapping confirmation, then
"Start collecting". Project CRS switches to the template's EPSG automatically
and the header shows the template name.

## Domain-driven dropdowns
All coded-value domains travel in the pack and live at project level.
Fields bound to a domain render as: plain dropdown (≤8 values) or a
searchable full-screen picker (e.g. Condition's 55 values). The form shows
the readable NAME; the stored and exported value is the CODE — exactly what
the geodatabase expects.

## Schema fidelity + entry-time validation
Template layers are schema-locked: exact field names (Arabic aliases intact),
types (text/number/integer/datetime), string lengths enforced via maxlength,
non-nullable fields required, defaults applied. Nothing is renamed, added
or truncated.

## Automatic field mapping (confirmed by the user)
Fields like XCOORD/YCOORD/ZCOORD, INSPECTED_BY, INSPECTION_DATE, ASSET_IMAGE,
DATA_SOURCE are pre-suggested for auto-fill (coordinates reprojected to the
template CRS at save, surveyor name, capture date, photo file name at export,
constant "GPS"). The user confirms or changes each mapping once; mapped
fields disappear from the surveyor's form.

## Office round-trip export
Export sheet gains "Office package": one GeoJSON per feature class, columns
matching the geodatabase exactly (all 66 MANHOLECHAMBER columns, nothing
added), domain CODES, geometry reprojected to the template EPSG with Z, plus
a README for the office. Load back with geoprocessing Tool 2 ("Field Data To
GDB") — insert or update-by-key. The UI warns against Shapefile for template
layers (10-char name truncation).

## Template version upgrades
Re-importing a newer pack of the same template upgrades domains and field
definitions of existing layers in place — no duplication (verified idempotent).

Service worker cache v18. Companion deliverable: SmartMaidani-Converter-Tools.zip
(two-way geoprocessing toolbox + four ready-made AAM packs).

## V9.1 — field-crew usability fix (non-nullable handling)
- GDB non-nullable fields NEVER block the surveyor: "required" now lives only
  as metadata (gdbRequired). Complete is always available on template layers.
- Non-nullable fields arrive PRE-DEFAULTED and visible in the form: authored
  default if the template has one; otherwise domain fields get an N/A-style
  code (N/A / Undefined / Unknown / Other, else first value), text gets "N/A",
  numbers get 0, dates get the capture date. The surveyor changes only what
  they actually observe on site; the office refines the rest.
- New field SEARCH box at the top of template capture forms — type to filter
  66-field forms down to the fields being edited (e.g. "cover" -> 9 fields).
- SW cache v19.
