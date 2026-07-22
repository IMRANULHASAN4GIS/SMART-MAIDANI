# EasyCapture V8

Five capability upgrades, closing the main gaps identified against ArcGIS Field
Maps, Fulcrum and QField. All existing flows re-verified: 4 automated suites
(export engine, standard runtime, streaming capture, V8 features) — 95+ checks,
all passing. Service worker cache bumped to v17.

## 1. Conditional / branching form logic
Any field in an Asset Type can now be set to "only show this field when
[another field] = / ≠ [value]" (e.g. show *Depth (m)* only when *Asset Type =
Manhole*). The capture form shows/hides fields live as the surveyor fills the
form, and required-field validation correctly ignores hidden fields — a hidden
required field never blocks saving, and stale hidden values don't mislead.

## 2. Barcode / QR scanning
Every text field in the capture form has a scan button. It opens a dedicated
camera overlay using the native BarcodeDetector API and fills the field on a
successful read (QR, EAN-13/8, Code 128/39, UPC-A/E, ITF, Data Matrix,
PDF417). Conditional visibility and validation re-run after a scan.
Platform note: BarcodeDetector is available on Chrome for Android (fast,
offline). Safari on iPhone does not implement it — the scanner reports this
plainly on-screen and the surveyor types the value instead.

## 3. Merge from another surveyor (multi-device, no server)
Import sheet now has "Merge from another surveyor": bring in a second device's
work via its project.json or full ZIP export. Layers are matched by name +
geometry type (new ones created automatically, unknown sources fall back to a
"Merged Records" layer), records are matched by their stable ID, and whichever
version has the newer updatedAt wins — re-merging the same file is idempotent
and never duplicates. The ZIP export's project.json now also embeds layer
schemas so merges reconstruct fields correctly. Limitation stated in the UI:
photos/videos are not carried by the merge (geometry + attributes only).

## 4. Snapping while editing
Already present since V7 (vertex + edge snapping with pixel tolerance, visual
indicator, toolbar toggle, on by default) — verified, no change needed. Earlier
comparison tables listing this as a gap were wrong.

## 5. External RTK/GNSS receiver support (Web Bluetooth)
Menu → External GNSS receiver pairs a Bluetooth LE GNSS unit exposing an NMEA
serial stream (Nordic UART service — common on survey receivers). The stream is
checksum-validated and parsed (GGA, GST, RMC, VTG); corrected positions feed
the same onFix() pipeline as the phone GPS, so manual capture, Streaming
Capture and route tracking all use the receiver automatically. Fix quality is
shown live on the GPS pill (RTK FIXED / RTK FLOAT / DGPS / GPS / NO FIX) with
GST-based accuracy when the receiver reports it (cm-level under RTK FIXED).
While the receiver is delivering sentences, phone-GPS fixes are suppressed so
low-accuracy positions can't sneak in; if the receiver goes silent for 10 s the
app falls back to phone GPS and says so.
Platform note: Web Bluetooth works on Chrome for Android and desktop
Chrome/Edge. Safari on iPhone/iPad does not implement it; on those devices the
app states this and continues with phone GPS.
