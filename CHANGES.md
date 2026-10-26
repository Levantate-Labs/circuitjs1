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

### Waveform drawing

- `Scope.ts`: grid lines are collected into two paths (minor, major) and the
  trace into one path per plot, instead of one `stroke()` per line segment.
  Measured on the default LRC circuit at 1280×800: 766 → 65 `stroke()` calls
  per frame. Trace columns are joined so steep edges have no gaps, lines are
  1.5px with round joins, grid lines sit on pixel centres. Each scope is drawn
  on a rounded card; the cursor readout is a small card above the scope.
