# Forma — 3D equation renderer

A browser-based renderer for explicit surfaces (`z = f(x, y)`) and implicit
surfaces (`F(x, y, z) = 0`). It uses plain HTML, CSS, JavaScript, and WebGL, with
no runtime dependencies.

## Run

On a computer, open `renderer-3d.html` in a browser with WebGL enabled. Keep the `css/` and `js/`
folders alongside it. No installation, server, internet connection, or build
step is required. The page can also be served by any static web server.

### Phone or single-file copy

Some phone browsers and file viewers cannot load neighboring CSS and JavaScript
files from an opened local document. Generate a self-contained version on your
computer with Node.js 18 or newer:

```sh
npm run build
```

Copy **`dist/forma-3d.html`** to the phone and open it in a browser that runs
JavaScript and supports WebGL. This file contains all styles and scripts; you
do not need to copy the `css/` or `js/` folders. No package installation is
needed to build it. Run the command again after changing the application.

If the phone opens the file in a document preview that does not run JavaScript,
the bundled version still needs to be opened in a suitable browser or accessed
as a page served over HTTP. Bundling fixes missing companion files; it cannot
add JavaScript execution or WebGL support to a file viewer.

The interface is in Polish, with a responsive layout, camera controls, surface
settings, and PNG export. Surfaces start without triangle lines; choose
"Powierzchnia + siatka" or "Siatka" to show them. Twelve example shapes live
below the space settings. Selecting one reveals an explanation and an equation
experiment; editing the equation or switching modes hides the explanation.
The renderer stays within the browser window while the sidebar scrolls
independently. On narrow screens, the renderer sits above the scrollable controls.

## Compare equations

Select **Dodaj równanie** to add another input. Each numbered card has its own
equation mode, color picker, **Pokaż** checkbox, and **Usuń** button. Click
**Renderuj powierzchnie** or press Enter in an equation input to render all
visible, nonempty equations. Errors appear on the affected card; other valid
surfaces still render. At least one input stays available.

Click or focus a card to choose where a shape preset is inserted. Presets
preserve the other equations and, when comparing several surfaces, expand the
shared domain if necessary rather than shrinking it. All surfaces share the
domain, quality, display style, camera, grid, and axes. Colors and visibility
update the view immediately; previously rendered meshes are reused when possible.

PNG export includes only visible rendered surfaces, with their numbered,
colored equations above the image. Exact intersection curves are not calculated.
More equations, especially implicit surfaces at high quality, increase memory
use and calculation time.

## Inspect points

Click or tap a surface to see its equation number and approximate `x, y, z`
coordinates. The nearest visible surface is selected when surfaces overlap.
Dragging still rotates the view, Shift-drag pans, and pinching zooms.

Use **Przypnij punkt** in the readout to keep a colored marker. Repeat at other
positions to compare points in the **Przypięte punkty** sidebar list. Remove
individual pins with **Usuń**, or clear the list with **Wyczyść**. **Wyczyść wybór**
or Escape while the canvas has focus clears the current selection.

Markers follow the shared camera and use depth testing. Hiding an equation
hides its pins; showing it restores them. Rendering a different equation or
removing a surface clears its points. Pins survive quality and domain changes,
but points outside the current domain are hidden. Coordinates are interpolated
on the rendered triangles, so they are approximations rather than exact symbolic
solutions. In wire mode, picking still uses the underlying surface triangles.

## Cross-sections

Enable **Pokaż przekrój** under **Przekrój powierzchni**, choose `z = a`, `x = a`,
or `y = a`, and move the position slider. The cutting plane and highlighted
intersections share the 3D camera. The flat preview shows the same section with
equal scaling on both axes and a color for each visible equation. Turn off
**Płaszczyzna** to keep the contours without the transparent plane.

For example, select **Sfera** and move a horizontal section: the circle shrinks
as the plane approaches the top or bottom. Try **Torus** at `z = 0` to see two
concentric circles. The preview also shows isolated contact points and filled
regions when a surface coincides with the plane. Sections are approximated from
the current mesh; increasing quality improves their accuracy. Moving the slider
does not rebuild the surfaces. PNG export includes the 3D section and its plane
equation.

## Project structure

| File                           | Responsibility                                                 |
| ------------------------------ | -------------------------------------------------------------- |
| `renderer-3d.html`             | Page structure and accessible controls                         |
| `css/styles.css`               | Appearance, responsive layouts, and reduced-motion rules       |
| `js/equation-parser.js`        | Expression tokenization and safe equation evaluation           |
| `js/geometry.js`               | Explicit surface meshes and marching tetrahedra                |
| `js/sections.js`               | Triangle/plane intersections and cutting-plane geometry        |
| `js/state.js`                  | DOM references, presets, shared state, and camera defaults     |
| `js/renderer.js`               | WebGL setup, shaders, buffers, matrices, and drawing           |
| `js/equations.js`              | Equation records, visibility, labels, and GPU resource cleanup |
| `js/picking.js`                | Screen rays, matrix inversion, and mesh triangle intersections |
| `js/inspector.js`              | Point selection, pins, coordinate readout, and markers         |
| `js/cross-section.js`          | Section controls, contour buffers, and the 2D preview          |
| `js/ui.js`                     | Messages, mode selection, domain display, and mesh rebuilding  |
| `js/controls.js`               | Mouse, touch, keyboard, form, and settings handlers            |
| `js/export.js`                 | PNG creation and download                                      |
| `js/main.js`                   | Animation loop, lifecycle events, and startup                  |
| `tests/renderer.test.cjs`      | Parser, geometry, and script-loading regression checks         |
| `scripts/build-standalone.cjs` | Generate the self-contained HTML distribution                  |

Scripts load in the order listed in the HTML, using `defer` so the DOM is ready
before they run. They are classic scripts sharing one scope, with mutable state
declared in `state.js`. This deliberately retains support for opening the page
directly through `file://`; ES module imports would require a web server in
common browsers. `main.js` runs last and starts the renderer after all functions
and event handlers are available.

## Development

Node.js 18 or newer is needed only for the development tools. Install the pinned
formatter with `npm ci`, then use:

```sh
npm test
npm run format
npm run format:check
```

Tests use Node's built-in test runner and need no installed packages. Formatting
uses Prettier. Neither tool is loaded by the application.
