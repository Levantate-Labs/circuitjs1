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
- **Embedded in a host page** (any `init`, not only exams): the File menu is
  hidden entirely and import/export/print/recovery commands and their shortcuts
  are blocked (the host saves circuits); the "About & licence" link in the side
  panel keeps the GPL notice reachable. Upstream's "(saved)" status and the empty
  "Current Circuit:" heading are hidden.
- Toast for blocked actions reads "Not available here".
- Harness: an empty parts box sends `null` (every part), not `[]` (wires only).

### Tool dock (roadmap slice L8a)

- New `ts/levantate/canvas/dock.ts`: a floating dock at the bottom centre of
  the canvas with Select, Hand (pan), the common parts (wire, resistor,
  capacitor, inductor, diode, voltage source, ground, switch, op amp), "More
  parts" (opens the searchable part palette) and Add Grading Point. Click a part
  to pick it or press and drag it onto the canvas; the active tool is
  highlighted. Part buttons follow an exam's part allow-list and the grading pin
  is hidden in exams.
- While the dock is on, the toolbar's parts group is hidden (`Toolbar.ts` tags
  its separator `toolbarSepParts`) and zoom to fit leaves room for the dock
  (`UIManager.centerCircuit`).
- Options > Show Tool Dock (saved, on by default); URL parameter `dock=0` / `1`
  overrides it.

### Freeze and inspect

- New `ts/levantate/canvas/freeze.ts`: a **Freeze** button under Run/Stop stops
  the simulation at the current instant (scopes stop with it) and labels the
  circuit with that instant's values: the current through each two-terminal
  part with an arrow for its direction, an arrowhead on each wire carrying
  current, and the voltage at each node (0 V and ground unlabelled). Labels keep
  clear of each other and of the controls floating over the canvas. A bar at
  the top left shows the frozen time, toggles for currents and voltages, and
  Resume. Running, resetting or editing the circuit ends the freeze.
- Hooks in `UIManager.ts` (button, overlay drawing, ending the freeze);
  `maestro.css` styles and `--info` colour tokens. Tests: `freeze.test.ts`.

### Properties panel (roadmap slice L8b)

- New `ts/levantate/canvas/properties.ts`: a part's editor is a panel floating
  in the top-right of the canvas (under the zoom pill, clear of the tool dock)
  instead of a dialog beside the side panel. It is titled with the part's name
  and has a close button; Esc closes it and it can still be dragged.
- Edits apply as soon as a field changes (Enter, leaving the field, the −/+
  steppers, choices and checkboxes), so there is no Apply/OK/Cancel row; opening
  the panel is one undo step. A value that doesn't parse is outlined in red
  instead of being ignored silently.
- A **Live** section pinned to the bottom of the panel shows the part's
  readings (current, voltage, power, and whatever else the part reports) as the
  simulation runs.
- The part being edited keeps its highlight on the canvas.
- Hooks: `EditDialog.ts` (panel mode for circuit parts; editors for models and
  options are unchanged dialogs), `UIManager.ts` (live update, highlight).
  Tests: `properties.test.ts`.

### Show and hide the graphs and side panel

- New `ts/levantate/canvas/viewToggles.ts`: two buttons at the left of the
  zoom pill hide or show the graph strip (scopes, with a count in the tooltip)
  and the side panel, giving the circuit the whole window. While the side panel
  is hidden, Run/Stop and Freeze appear in the pill.
- Options > Show Graphs and Show Side Panel do the same (saved, on by default);
  URL parameters `graphs=0` / `1` and `sidePanel=0` / `1` override them. Pages
  opened with `hideSidebar` keep upstream's behaviour.
- Hooks: `UIManager.ts` (canvas and circuit area sizes, bottom-area drawing),
  `MouseManager.ts` (no scope splitter while graphs are hidden), `Menus.ts`.

### Help panel and first-run tour (roadmap slice L8, onboarding)

- New `ts/levantate/help/`: a user guide for students.
  - **Help panel** (`helpPanel.ts`, `content.ts`): a drawer on the right with
    sections on getting started, building a circuit, finding parts, changing
    values and units, running, measuring and Freeze, graphs, moving around,
    layout and options, working in a test, error messages and how to fix them,
    and keyboard shortcuts. A search box filters and opens matching sections.
    Opened from the ? button at the end of the zoom pill, the ? key or F1.
  - **Guided tour** (`tour.ts`): eight short steps that spotlight the dock, the
    canvas, a part, Run/Stop, Freeze, the graphs, the zoom pill and the help
    button, with Back / Next / Skip and arrow keys. Steps for things not on
    screen are left out. It starts by itself once per device (local storage
    key `lvTourDone`); the Help panel replays it. URL parameter `tour=0` turns
    the automatic start off.
  - Styles in `help.css`, loaded from `main.ts` after `maestro.css`.
- Bridge: `init.tour` (default true) lets the host turn the tour off; it never
  starts in read-only mode, and embedded pages start it after `init` so it
  matches the exam's layout. `docs/bridge-protocol.md` updated.
- Hooks: `UIManager.ts` (creates both), `CirSim.ts` (automatic start outside
  an iframe). Tests: `help.test.ts`.

### Grading runner and service (roadmap slice L6)

- New `ts/levantate/grader/runner.ts`: with `?grader=1` the page exposes
  `window.LvGrader.run({ circuit, settle, window, points })`. It loads the
  circuit, stops live stepping, fakes the clock so each pass of the simulation
  loop advances exactly one time step, runs to `settle`, resets the grading
  points' statistics, runs through `window` and returns the readings, the
  simulated time, the step count and the circuit's grading points. Results are
  the same on every run and every machine. Simulator stop messages are reported
  as errors; step and time limits keep a circuit from running forever.
  `CirSim.ts` installs it (and skips the tour) when the parameter is present.
- New `ts/grader/server.mjs`: an HTTP service (`POST /grade`, bearer token,
  `GET /healthz`) that serves the built app to headless Chromium on a loopback
  port, blocks every other request the page makes, reloads the page for each
  circuit and returns the runner's result. `ts/grader/Dockerfile` builds it on
  the Playwright image; `playwright-core` (Apache-2.0) added as a dependency.
  API and deployment: `docs/grader-service.md`. Tests: `runner.test.ts`.
- Exam mode (`levantate/exam/exam.ts`): grading points can no longer be added
  or pasted, whatever the part allow-list says; only the question's own
  (locked) pins exist. A student who could add one could give it a checked
  pin's id and choose what it measures.

### Compact exam top bar (roadmap slice L8) and undo in exams

- Exams open with a compact top bar: only the menu bar, no toolbar row. Its
  tools are already in the tool dock and the zoom pill; the dock gains Undo and
  Redo while the toolbar row is hidden (`levantate/canvas/dock.ts`,
  `UIManager.setCompactBar`). `init.compact` overrides it (default: on in
  exams). The dock is hidden whenever the circuit is read-only.
- Fix: in an exam, undo and redo rebuilt the circuit through the part
  allow-list, so starter parts that aren't on the list (and grading points)
  disappeared, and the rest came back unlocked. Restoring a saved copy now
  skips the allow-list, and locked starter parts are re-locked by type,
  position and id (`Exam.lockStarter` / `Exam.relock`, `UndoManager.ts`).
  Tests: `exam.test.ts`.
- Help guide, "In a test or assignment": grading points can't be added, the
  dock has Undo/Redo in the compact bar, and answers are marked from readings
  taken after submitting.

### End-to-end tests and an undo fix

- New `ts/e2e/` (`npm run test:e2e`, after `npm run build`): a host page on
  another origin drives the built lab through the embedding protocol (exam
  init, compact bar, measuring, adding a part and undoing, read-only), and the
  grading service is started and checked (token, repeatable readings, AC
  readings, bad requests). Uses `playwright-core`; `E2E_BROWSER_CHANNEL=msedge`
  (or `chrome`) uses an installed browser instead of Playwright's Chromium.
- Upstream fix (`UndoManager.ts`): an edit saves a copy of the circuit before
  and after it, so the first Undo restored the circuit as it already was and
  seemed to do nothing. Undo and Redo now skip copies identical to the
  current circuit.

### Multimeter (roadmap slice L9)

- New `ts/levantate/instruments/`: a bench multimeter over the canvas, opened
  from the tool dock. It never changes the circuit, so it works on a test's
  locked parts.
  - **Volts (DC/AC):** red and black probe tips with leads from the meter's
    jacks; drag a tip onto a terminal or anywhere on a wire and it snaps there.
    Shows red minus black.
  - **Amps (DC/AC):** a clamp: pick a part and read the current through it.
  - **Ohms:** the resistance of the part whose two ends the probes are on.
  - Readings are averaged every simulation step (`CirSim.onTimeStep` feeds it)
    and refreshed a few times a second. A changing signal is read over whole
    cycles (`CycleWindow`: from one rising edge to a later one, time-weighted),
    so values are right at any simulation speed; until the first whole cycle
    the meter says it is measuring. DC shows the average, AC the RMS of the
    varying part; auto-ranged to four digits.
- Bridge: `init.instruments` (default true) lets the host turn instruments off.
- Help guide: a Multimeter section. Tests: `meterLogic.test.ts`; the e2e test
  checks the meter is in the exam dock.

### Function generator and bench power supply (roadmap slice L9)

- The dock's meter button is now **Instruments**, a menu with the multimeter,
  a function generator and a power supply. Panels open in free space and can
  be dragged; leads are shared (`levantate/instruments/leads.ts`).
- **Function generator** (`functionGenerator.ts`): sine, square, triangle or
  sawtooth; frequency, peak-to-peak amplitude and offset; 50 Ω output (upstream
  `VoltageElm` with an internal resistance). Changing the frequency keeps the
  phase continuous.
- **Power supply** (`benchSupply.ts`): voltage and current limit with CV/CC
  shown, as on a bench supply. `PsuSourceElm` is upstream's current source with
  a compliance voltage, with the knee narrowed from 5% to 0.02% so the output
  holds its setting under load.
- **How a source instrument connects** (`sourceInstrument.ts`): while its
  output is on and both leads are on terminals (sources can only join where
  parts' ends meet), it adds its source part between them. That part is marked
  `levInstrument`: `CircuitXMLSerializer` doesn't save it (so it's never in an
  answer, an export or an undo copy), it's locked, it draws nothing, grading
  points and the Freeze labels ignore it, and `MouseManager` doesn't hover or
  click it. A load or undo rebuilds the circuit without it; it is added back
  on the next frame. Closing the instrument turns the output off.
- Multimeter: a step that has settled refreshes the reading straight away.
- `init.instruments: false` closes and hides all three. Help guide section
  renamed Instruments.

### Scope panel (roadmap slice L9)

- New `ts/levantate/instruments/scopePanel.ts`: a docked scope's gear opens a
  bench-scope front panel instead of the long properties dialog (which stays
  one click away under "All settings…"; scopes drawn inside the circuit keep
  the dialog). It shows the scope's name and: the visible time window with
  − / + (upstream `speedUp` / `slowDown`); the trigger (off / auto / normal,
  rising or falling edge, level: upstream `ScopeTrigger`); chips for the
  measurements upstream draws on the graph (max, min, peak-to-peak, average,
  RMS, frequency, duty cycle); and two cursors, A and B, fixed on screen like a
  bench scope's, dragged along the graph, with each value, Δt, 1/Δt and ΔV.
- Hooks: `MouseManager.ts` (the gear), `UIManager.ts` (cursors drawn after the
  graphs). Help guide: the Graphs section describes the panel.

### SPICE export, AC analysis and Bode plot (roadmap slice L10)

- New `ts/levantate/spice/`:
  - `netlist.ts`: exports the circuit as an ngspice netlist on the simulator's
    solved nodes (wires and labels already merged; ground is `0`): resistors,
    capacitors, inductors, potentiometers, closed switches, ammeters, voltage
    sources and rails (DC, SIN, PULSE; an internal resistance as a series R),
    current sources, the bench supply (as the voltage it holds), diodes, LEDs
    and zeners (`.model D`), NPN/PNP (`.model` with IS, BF, BR, NF, NR, VAF,
    junction capacitances, TF), MOSFETs (level 1: VTO, KP, LAMBDA) and op amps
    (a behavioural source with the simulator's gain, clamped to its rails).
    Anything else is a comment and is reported. One source can be marked
    `AC 1` as the input of an AC analysis.
  - `engine.ts`: ngspice in WebAssembly via `eecircuit-engine` (MIT; ngspice
    is BSD-licensed), about 20 MB (5.7 MB compressed). Not bundled: the build
    copies it to `circuitjs/spice/` (`vite.config.ts`) and it loads the first
    time an analysis runs. Runs are queued.
  - `ac.ts`: an `.ac dec` sweep from one source to a pair of nodes; `bode.ts`:
    gain (dB) and unwrapped phase, values at a frequency, peak and −3 dB
    points.
- **Bode plot** (`levantate/instruments/bodePanel.ts`, in the Instruments
  menu): choose the input source, put the OUT and REF probes on the circuit,
  set the range and run; gain and phase on a log axis with the −3 dB points
  marked and a readout under the pointer; "Copy SPICE netlist" (not in exams).
- **Grading** (`levantate/grader/acRunner.ts`, `LvGrader.ac`): the grading
  service accepts `"analysis": "ac"` and returns gain/phase at frequencies,
  peak and cutoff frequencies at a grading point (`docs/grader-service.md`).
- Tests: `netlist.test.ts`, `bode.test.ts`; the grading e2e test grades an RC
  low-pass with ngspice. `grader/server.mjs` and the e2e server serve `.mjs`.
- `circuitjs/about.html` credits ngspice (modified BSD), EEcircuit-engine (MIT)
  and Plus Jakarta Sans (OFL).

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
