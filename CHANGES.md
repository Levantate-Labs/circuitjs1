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
