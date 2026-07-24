# EasyCapture V11 — Protected Field Collection Foundation

This release implements the highest-priority reliability, offline, rapid-capture,
data-protection and guided-editing recommendations from the technical review.

## Included

- New EasyCapture GIS artwork for the welcome screen, header, PWA installation
  icon, maskable icon and Apple touch icon.
- V22 cache generation and cache-busted application files so deployed updates
  replace the previous interface and branding.
- Safer IndexedDB transactions and complete ZIP backup/restore, including binary
  attachments.
- Attachment lifecycle protection: abandoning an edit does not delete committed
  media, and abandoned draft media is cleaned up.
- Stable field keys, collision checks, template validation, and preservation of
  imported numeric and Boolean types.
- Offline-readiness checks for the application shell, libraries, quota and
  persistent-storage protection.
- Separate bounded map-tile caching and clearer offline map availability guidance.
- Continuous point capture with manual or distance-based GPS capture, configured
  defaults, template autofill, accuracy threshold, haptic feedback, and
  `needs_attributes` status.
- Status filters and a “complete next incomplete record” workflow.
- Geometry validation for coordinate range, minimum vertices, zero-length
  segments, polygon closure and basic self-intersection.
- Guided edit sessions, double-click/tap editing, undo/redo, move, rotate,
  vertices, reshape, split, merge, cut, delete, attributes and sketch tools.
- Configurable vertex/endpoint and edge snapping with tolerance and target-layer
  controls.
- Bulk attribute update for selected records in the same layer.

## Specialist desktop-GIS capabilities still planned

V11 is a robust field-editing foundation; it does not claim full ArcGIS Pro
desktop parity. The remaining specialist phases are:

1. Self-host the currently pinned third-party libraries for deterministic
   first-ever startup without internet.
2. Add repeated session attributes and more advanced field-level validation.
3. Replace rollback-based sessions with a complete in-memory working-copy
   transaction.
4. Add production-grade trim, extend, full-path polygon cutting, intersection
   snapping and topology-aware editing.
5. Add transactional GIS imports and a comprehensive pre-export QA/QC report.

## Offline note

After one successful online load, the application shell and successfully fetched
libraries are cached. Only previously cached map areas and zoom levels are
available offline. The current package still references pinned CDN libraries, so
fully deterministic first-ever offline startup requires the planned self-hosting
phase.
