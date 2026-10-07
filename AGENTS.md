# Repository Guidelines

## Project Structure & Module Organization

`renderer-3d.html` is the entry point. `css/styles.css` contains the theme and
responsive layouts. JavaScript lives in `js/`, separated into equation parsing,
geometry generation, shared state, WebGL rendering, UI updates, controls, PNG
export, and startup. `tests/renderer.test.cjs` contains regression checks.
Graphics and shaders are embedded in HTML or JavaScript; there is no separate
asset directory.

The application uses ordered, deferred classic scripts sharing one scope.
Declare shared mutable state in `js/state.js` and keep `js/main.js` last in the
HTML script list. Preserve direct offline opening through `file://` when
changing dependencies or loading behavior.

## Build, Test, and Development Commands

Open `renderer-3d.html` in a WebGL-enabled browser to run locally. Keep `css/`
and `js/` alongside it. No build step or server is required.

Use Node.js 18 or newer for development commands:

- `npm ci`: install the pinned development formatter.
- `npm test`: run Node's built-in test suite; no installed dependencies required.
- `npm run format`: format the source files and listed documentation with Prettier.
- `npm run format:check`: check formatting without changing files.
- `npx prettier --check AGENTS.md`: check this guide, which the format scripts omit.

## Coding Style & Naming Conventions

Follow `.prettierrc.json`: two-space indentation, single JavaScript quotes,
and a 100-character print width. Use strict mode in browser scripts,
`camelCase` for functions and variables, and descriptive lowercase filenames
such as `equation-parser.js`. Preserve Polish interface text and UTF-8 encoding.
Keep equation evaluation free of `eval()` and `Function()`.

## Testing Guidelines

Use `node:test`, `node:assert/strict`, and descriptive behavioral test names.
Place tests in `tests/*.test.cjs`. Cover relevant parser errors, precedence,
mesh bounds and normals, script ordering, or startup behavior when changing
those areas. There is no enforced numerical coverage threshold.

Run tests and formatting checks before submitting changes. For rendering or
control changes, also check desktop/mobile layouts, camera interactions, and
PNG export in a browser; Node tests do not exercise real GPU rendering.

## Commit & Pull Request Guidelines

Use concise imperative commit subjects, such as `Extract camera controls`.
Keep changes focused. Pull requests should explain the problem, resulting
behavior, and validation performed; link relevant issues and include screenshots
for visual changes. Preserve existing functionality during structural refactors.
