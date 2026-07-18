# Smart Maidani ArcMap-style geometry editor

## Interaction model

The map header now follows the ArcMap Editor toolbar model. The Editor menu controls the edit session and the toolbar keeps commands in a predictable desktop-GIS order. Commands are enabled only when the ArcMap selection requirements are satisfied.

The toolbar includes Editor session control, Edit Tool, rectangle selection, Pan, Create Features, Snapping, Edit Vertices, Move, Rotate, Reshape, Cut Polygons, Split Line, Merge, Delete, Attributes, Sketch Properties, Undo, Redo, and Save Edits.

- **Create** opens the common layer picker, then uses the layer geometry type to capture a point, line, or polygon.
- **Pan** is the only hand-navigation mode.
- **Select** uses an arrow cursor. A single click selects; double-click starts vertex editing immediately.
- **Box** draws a visible virtual rectangle and selects every visible feature whose extent intersects it.
- **Edit geometry** enters a focused mode. Square handles are existing vertices; small diamond handles are edge midpoints. Drag a square to move one vertex. Select a square and use **Delete vertex** for safe deletion. Click a diamond to insert a vertex, or drag it to move the entire adjacent edge. Undo, redo, cancel, and save are always visible.
- **Move** drags the complete point, line, or polygon without changing its internal shape.
- **Split** cuts a selected line at the closest position to the click and creates two independently editable records while retaining attributes.
- **Delete** removes one or several selected features after confirmation.

Selected features are highlighted and the contextual card reports the selection count or primary geometry type. Commands are enabled only when valid: edit/move requires one feature, split requires one line, and delete accepts one or many features. Double-click/tap detection is implemented on the feature click stream rather than relying only on the browser's inconsistent native `dblclick` event.

## Consistent data path

Created and imported features use the same `records` collection, layer schema, map renderer, selection state, and geometry editor. GeoJSON, KML, and Shapefile imports are normalized to Point, LineString, or Polygon records before rendering. There is no separate imported-data editor, so both project-start paths remain behaviorally identical.

## Recommended next production steps

1. Add snapping to vertices, edges, intersections, and configurable tolerance in screen pixels.
2. Add topology rules per layer (no polygon overlap, must-not-self-intersect, line endpoints must connect).
3. Add transaction-based autosave and a durable edit journal for crash/offline recovery.
4. Add server sync with version fields, optimistic concurrency, attachment queues, and conflict resolution.
5. Move third-party map/editing libraries into the service-worker cache or application bundle for dependable offline startup.
6. Add spatial indexing and viewport-based rendering for large datasets.
7. Add keyboard shortcuts on desktop and 44–48 px touch targets with haptic feedback on supported mobile devices.
8. Test selection, vertex editing, deletion, and offline recovery against large point, line, and polygon fixtures.

“ESRI-level performance” is an engineering program, not a styling change. The current implementation establishes the correct UX and shared editing architecture; snapping, topology, sync, conflict handling, and performance instrumentation are the major remaining production capabilities.
