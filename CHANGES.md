# Changes in the Levantate Labs fork

This file records modifications made by Levantate Labs to CircuitJS1
(upstream: https://github.com/pfalstad/circuitjs1), as required by section
2(a) of the GNU General Public License version 2. Modified source files also
carry a notice at the top with the date of change.

All changes are licensed under the same terms as CircuitJS1: GNU General Public
License, version 2 or (at your option) any later version.

## 2026-10-26

- Forked from upstream `master` at `e952e788` (5.0.3).
- README.md: added a note identifying this fork and its licence.
- ts/package.json: `license` field set to `GPL-2.0-or-later` to match
  COPYING.txt (upstream had the npm default `ISC`).

### Maestro theme

- New `ts/levantate/theme.ts`: light and dark canvas palettes (paper canvas,
  teal for positive voltage, coral for negative, stone at 0 V, amber current
  dots, blue selection) pushed into `CircuitElm`'s shared colours. Colours given
  by URL parameter or local storage still win. Light is the default; the
  existing Options > White Background item switches light/dark for both the
  canvas and the page chrome (`<html data-theme>`).
- New `ts/levantate/maestro.css` (loaded after `style.css` from `main.ts`):
  restyles the menu bar, dropdowns, context menus, toolbar, side panel,
  buttons, dialogs, popups, command palette and toast with the Maestro tokens.
  `circuitjs.html` no longer links `style.css` directly so the order is fixed.
- New `ts/levantate/fonts.ts` and the `@fontsource-variable/plus-jakarta-sans`
  dependency (OFL-1.1, bundled locally): Plus Jakarta Sans for the page and the
  canvas text (`Font.ts` maps sans-serif to it).
- `UIManager.ts`: sliders redrawn (device-resolution canvas, rounded track,
  round thumb), side panel widened to 152–216px with padding and labels,
  Run/Stop button now shows the state ("Running"/"Stopped"), canvas and
  bottom-area colours from the theme, theme switch redraws sliders and
  re-picks scope trace colours.
- `Toolbar.ts`: inline colours and hover handlers replaced by CSS classes
  (`toolbarButton`, `active`, `toolbarSep`, `palette-container`, `paletteItem`),
  separators between edit, zoom and parts groups, ARIA labels; resistor icon
  leads use `currentColor`.
- `Adjustable.ts`: element sliders use the side-panel label style.
- `ScopePlot.ts`, `ScopeFFT.ts`: trace colours from the theme.
- `ScopeOverlays.ts`: overlay text inset from the scope card edge.

### Deployment

- `ts/package.json`: `start` script serves `dist/` with `serve` (MIT) on
  `$PORT`, `postbuild` copies `ts/serve.json` into `dist/`, `engines.node` set to
  `>=22.12`. New `ts/serve.json` and `DEPLOY.md` (Railway settings).
- `ts/vite.config.ts`: the app is built into `dist/workspace/` with the page
  renamed to `index.html`, so it is served at `/workspace/`; `dist/` is emptied
  at the start of each build. `jsinterface.html` (demo) points at
  `index.html`. `serve.json` redirects `/`, `/workspace` and `/circuitjs.html`
  to `/workspace/`.

### Product name

- The browser tab and page title read **Maestro Circuit Lab** (`ts/levantate/brand.ts`,
  `CirSim.baseTitle`, `circuitjs.html`). The unused manifest link was removed.
- `circuitjs/about.html` names the product, states that it is a modified version
  of CircuitJS1 by Paul Falstad and Iain Sharp under the same licence, and links
  to this fork's source. All original credits, licence and warranty notices are
  kept (GPLv2 section 2(c)). The JavaScript API keeps its name
  (`window.CircuitJS1`) so existing integrations keep working.

## 2026-10-28

### UX fixes

- **Current beads** (`CircuitElm.drawDots`): moving current is drawn as round
  beads with a thin ring in the canvas colour, 24px apart (was 4px squares every
  16px, which made wires look dashed), filled in one path per segment. Bead
  speed is unchanged.
- **Scope labels** (`ScopeOverlays.ts`): drawn with a halo in the card colour so
  traces underneath don't make them unreadable.
- **Embedded in a host page** (any `init`, not only exams): the File menu shows
  only About, and import/export/print/recovery commands and their shortcuts are
  blocked (the host saves circuits). Upstream's "(saved)" status and the empty
  "Current Circuit:" heading are hidden.
- Toast for blocked actions reads "Not available here".
- Harness: an empty parts box sends `null` (every part), not `[]` (wires only).

## 2026-10-27

### Precision tools (roadmap slice L7)

- **Alignment guides** (`ts/levantate/canvas/guides.ts`): while parts are
  dragged, placed or rewired by an end, dashed magenta guides show every
  terminal of the moving parts that lines up (same x or y) with a terminal of a
  part that stays put. Positions already snap to the grid, so the guides
  confirm alignment rather than pull parts around. A single unselected part
  dragged by the cursor counts as moving (upstream selects it only for the
  instant of each move).
- **Distance readout**: a pill next to the cursor shows how far the drag has
  gone, in grid squares (e.g. "← 5  ↑ 4"), or the size of a part being placed.
- **Minimap** (`ts/levantate/canvas/minimap.ts`): bottom-left overview of the
  whole circuit with the visible area outlined; click or drag on it to move the
  view. It appears only when part of the circuit is off-screen. Options > Show
  Minimap (saved, on by default); URL parameter `minimap=0` / `1` overrides it.
- `levantate/theme.ts`: guide and minimap colours. Tests: `guides.test.ts`.

### Embedding bridge and exam mode (roadmap slice L3)

- **Protocol:** `docs/bridge-protocol.md` (v1). A host page drives the
  simulator in an iframe with `postMessage` only: `init`, `export`,
  `setReadOnly`, `getGradePoints`, `resetStats`, `measure`; the simulator sends
  `ready`, `initialized`, `changed` (debounced), `exported`, `gradePoints`,
  `measured`, `integrity`, `error`.
- **Bridge:** `ts/levantate/bridge/bridge.ts`, installed at the end of
  `CirSim.init()`, active only inside an iframe. Messages are accepted only from
  allowed origins (localhost, `studywithmaestro.com` and its subdomains,
  `*.levantate.in`, plus `VITE_PARENT_ORIGINS` at build time); the first `init`
  fixes the host origin. Circuits are capped at 256 KB.
- **Exam mode** (`ts/levantate/exam/exam.ts`, `init.exam`): hides the File,
  Tools and Circuits menus and Options > Disable Editing; blocks import/export,
  print, recovery, examples, subcircuit and dev tools; keeps the clipboard and
  crash recovery out of local storage (shared by all tabs on the site); reports
  copy/cut/paste and blocked actions to the host; adds an "About & licence" link
  to the side panel so the GPL notice stays reachable.
- **Part allow-list** (`init.parts`): only listed parts (plus wires) can be
  added, via `CirSim.constructElement`; menus, toolbar buttons and variant
  pickers hide the rest; pasted circuits drop disallowed parts.
- **Locked starter parts** (`init.lockStarter`): `CircuitElm.levLocked`.
  Locked parts can't be selected (so not moved, cut, copied, mirrored or
  rotated), deleted by hover, edited, rewired by dragging an end, value-scrolled
  or split; their sliders are removed; whole-circuit mirror/rotate is blocked.
  Grading points use the same flag.
- Undo history starts empty after `init`.
- Upstream fix: `CircuitXMLDeserializer` skips parts it can't create instead of
  crashing.
- Removed the third-party Dropbox script from `circuitjs.html` (its menu item is
  hidden).
- `serve.json`: `Content-Security-Policy: frame-ancestors` for the same hosts.
- Dev page `ts/harness.html` (not in `dist/`) plays the host to exercise the
  protocol. Tests: `bridge.test.ts` (origin matching).

### Grading points (roadmap slice L2)

- New part **Grading Point** (`ts/levantate/grading/GradePointElm.ts`, Draw >
  Outputs and Labels > Add Grading Point): a coral pin with a label marking
  where a circuit is checked. It stores only an id, a label and a kind.
  - `node`: one terminal on a wire, reads the node voltage.
  - `waveform`: like `node`, and also records samples (bounded) for waveform
    comparison.
  - `branch` / `power`: no terminal, so they never change the circuit; the tip
    points at a part (smallest part under the tip, wires ignored) and reads its
    current / power. The part is re-found whenever the circuit is restamped.
- Readings via `ts/levantate/grading/signalStats.ts`: value, average, RMS,
  max, min, peak-to-peak, frequency and period since the last reset, so a
  grader can settle, reset and measure over a window.
- Saved as `<LvGradePoint k=… id=… lb=…/>` (legacy text code 4000); both are
  distinct from upstream's codes. A `locked` flag (set later by exam mode) hides
  the pin's edit fields.
- Registered from `ts/levantate/registerElements.ts`, called from `CirSim.init()`
  after upstream's generated `registerElements.ts`, so regenerating that file
  can't drop it.
- `levantate/theme.ts`: pin colours. Tests: `signalStats.test.ts`,
  `GradePointElm.test.ts` (15 tests).

### Canvas visuals (roadmap slice L1)

- New `ts/levantate/canvas/visuals.ts`, drawn from `UIManager.updateCircuit()`:
  - **Dot grid** on the canvas, aligned with the snapping grid. Spacing doubles
    as you zoom out and the in-between dots fade first, so the grid never jumps.
    Not included in exported images.
  - **Setting:** Options > Show Dot Grid (`Menus.ts`), saved in local storage,
    on by default. The URL parameter `dotGrid=0` / `dotGrid=1` overrides the
    saved setting (for embedding).
  - **Hover halo:** soft rounded highlight behind the part under the cursor.
  - **Selection bounds:** one rectangle around everything selected.
  - **Selection box:** tinted fill with a 1px outline (was an outline only).
- `levantate/theme.ts`: `canvasDot` colour for light and dark.
- Product name changed to **Maestro Simulation Lab** (tab title, About box).

## 2026-10-26 (continued)

### Canvas navigation (Figma-style, phase K1)

- New `ts/levantate/canvas/navigation.ts`, installed in front of `MouseManager`:
  scroll pans; Ctrl/Cmd+scroll and trackpad pinch zoom towards the cursor;
  Space+drag and middle-drag pan; Shift+1 zoom to fit, Shift+2 zoom to
  selection, Ctrl/Cmd+0 / + / − zoom (stopping the browser's page zoom); zoom
  range 10%–800% (was 20%–250%); zoom pill with menu at the top right of the
  canvas. Scrolling over a resistor, capacitor or inductor still edits its value
  unless a pan is in progress. Space no longer switches to Select mode unless the
  user assigned their own shortcut to it.
- Hooks: `MouseManager.ts` (install, touch pinch uses the exact finger ratio),
  `CommandManager.ts` (zoom commands step through preset levels),
  `UIManager.ts` (mount the pill, update its label each frame).

### Waveform drawing

- `Scope.ts`: grid lines are collected into two paths (minor, major) and the
  trace into one path per plot, instead of one `stroke()` per line segment.
  Measured on the default LRC circuit at 1280×800: 766 → 65 `stroke()` calls
  per frame. Trace columns are joined so steep edges have no gaps, lines are
  1.5px with round joins, grid lines sit on pixel centres. Each scope is drawn
  on a rounded card; the cursor readout is a small card above the scope.
