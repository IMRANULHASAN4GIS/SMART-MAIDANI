# EasyCapture V5

## ArcMap-style geometry editing

- The complete Editor toolbar stays visible in the application header.
- The arrow Edit tool is the default; the hand tool is used only when Pan is selected.
- Double-clicking a point, line or polygon starts geometry editing immediately.
- Lines and polygons expose square vertex handles and diamond segment handles.
- Drag a square to move a vertex. Click a diamond to add a vertex. Drag a diamond to move an edge.
- Select a vertex and use Delete, the Delete vertex button, or right-click to remove it.
- Snapping is explicitly displayed as **Snap ON** or **Snap OFF** and snaps to visible vertices and edges.
- Rectangle selection, move, rotate, reshape, split, cut, merge, attributes, sketch coordinates and undo/redo remain available from the same toolbar.

## Asset Type naming

The layer creation field is now labeled **Type Asset Name**. Asset Type terminology is used throughout the setup and layer-management workflow. GIS exports include the value in the `asset_type` field.

## Working photo/video hyperlinks

- **Excel + Media** downloads a ZIP containing `attributes.xlsx` and its `media/` folder. Cells carry both an OOXML link and an Excel `HYPERLINK()` formula.
- **Shapefile** downloads a self-contained ZIP containing the shapefile set, matching QGIS styles, `media/`, a media manifest and ArcMap instructions.
- Extract the complete ZIP before opening Excel or GIS files; relative offline links require the folder structure to remain together.

## Default field route

GPS points are saved automatically per project. The Field Route screen reports distance, travel time, point count and average speed and supports pause/resume, zoom, clear and GeoJSON download. Complete packages automatically include `data/field_route.geojson` with timestamps, accuracy, speed and route summary properties.
