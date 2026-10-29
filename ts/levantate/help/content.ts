/*
    Copyright (C) 2026 Levantate Labs

    This file is part of the Levantate Labs fork of CircuitJS1, distributed under
    the GNU General Public License, version 2 or (at your option) any later
    version. See COPYING.txt.
*/

// The user guide shown in the Help panel (levantate/help/helpPanel.ts).
// Bodies are fixed HTML written here, never user input.

export interface HelpSection {
    id: string;
    title: string;
    summary: string;     // one line under the title
    body: string;        // HTML
    keywords?: string;   // extra words for search
}

const k = (...keys: string[]) => keys.map((s) => "<kbd>" + s + "</kbd>").join(" + ");

export const SHORTCUTS: [string, string][] = [
    [k("Esc"), "Select tool / cancel"],
    [k("w"), "Add a wire"],
    [k("r") + " " + k("c") + " " + k("L"), "Resistor, capacitor, inductor"],
    [k("d") + " " + k("v") + " " + k("g"), "Diode, voltage source, ground"],
    [k("s") + " " + k("a"), "Switch, op amp"],
    [k("/"), "Search all parts and commands"],
    [k("Delete"), "Delete the selected parts"],
    [k("Ctrl", "Z") + " / " + k("Ctrl", "Y"), "Undo / redo"],
    [k("Ctrl", "C") + " " + k("Ctrl", "X") + " " + k("Ctrl", "V"), "Copy, cut, paste"],
    [k("Ctrl", "A"), "Select everything"],
    [k("Space") + " + drag", "Pan the view"],
    ["Scroll", "Pan the view"],
    [k("Ctrl") + " + scroll", "Zoom towards the pointer"],
    [k("Shift", "1"), "Zoom to fit the circuit"],
    [k("Shift", "2"), "Zoom to the selection"],
    [k("Ctrl", "0"), "Zoom to 100%"],
    [k("?") + " or " + k("F1"), "Open this help"],
];

export const HELP_SECTIONS: HelpSection[] = [
    {
        id: "start",
        title: "Getting started",
        summary: "What you see on screen and how a circuit comes to life.",
        body: `
<p>The lab is a live circuit simulator. Everything you build runs straight away:
moving dots show current and wire colours show voltage.</p>
<ul>
  <li><b>Canvas</b>: the dotted area in the middle, where you build.</li>
  <li><b>Tool dock</b>: the bar at the bottom with the common parts.</li>
  <li><b>Side panel</b>: Run/Stop, Reset, Freeze and the speed sliders.</li>
  <li><b>Graphs</b>: the strip along the bottom that plots values over time.</li>
  <li><b>Zoom pill</b>: top right; zoom, and buttons to hide the graphs or side panel.</li>
</ul>
<p>New here? <a href="#" data-help-action="tour">Take the 1-minute tour</a>.</p>`,
        keywords: "welcome intro overview basics tour first time",
    },
    {
        id: "build",
        title: "Building a circuit",
        summary: "Place parts, connect them with wires, move and delete.",
        body: `
<ol>
  <li><b>Pick a part</b> in the tool dock (or press its key, e.g. ${k("r")} for a resistor).</li>
  <li><b>Drag on the canvas</b> to place it. The length of the drag sets its size.
      You can also press a dock button and drag it straight onto the canvas.</li>
  <li><b>Connect</b> with wires: press ${k("w")} and drag from one dot to another. The dots
      at the ends of parts are their terminals; anything that touches a terminal is connected.</li>
  <li>Press ${k("Esc")} to go back to the Select tool.</li>
</ol>
<p><b>Move</b> a part by dragging it. Drag one end of a part or wire to stretch or re-route it.
<b>Delete</b> with ${k("Delete")}, or right-click a part for more actions: rotate, mirror,
swap terminals, copy.</p>
<p>While you drag, pink guides show when terminals line up, and a small label shows how far you
have moved, in grid squares.</p>
<p class="helpTip">A red dot on the canvas means a terminal that is close to something but not
connected. Drag it onto the other terminal.</p>`,
        keywords: "place add wire connect move delete rotate mirror flip drag terminal join",
    },
    {
        id: "parts",
        title: "Finding parts",
        summary: "The dock, the search box and the Draw menu.",
        body: `
<p>The dock has the parts you will use most: wire, resistor, capacitor, inductor, diode,
voltage source, ground, switch and op amp.</p>
<p>For anything else, click <b>More parts</b> (the magnifier in the dock) or press ${k("/")}
and type a name, for example <i>transistor</i>, <i>LED</i>, <i>AC source</i> or <i>555</i>.
The <b>Draw</b> menu lists every part by group.</p>
<p>Some parts have variants (for example an NPN or PNP transistor); pick them from the
search results or the Draw menu.</p>`,
        keywords: "dock search palette draw menu transistor led source ac dc component",
    },
    {
        id: "memory",
        title: "Memory chips and LED displays",
        summary: "ROM, static RAM, the LED array and the dot matrix display.",
        body: `
<p>A <b>ROM</b> holds a table of numbers. The address pins (A) pick a row and the data pins (D)
show that row's number in binary. <b>Static RAM</b> works the same way, and you can also write
to it while the circuit runs: put a number on D and pull <b>WE</b> low.</p>
<p>Click a chip to set its <b>address bits</b> and <b>data bits</b> and to edit its
<b>Contents</b>, one line per run of values: <code>0: 255 255 64 32</code> puts 255 at
address 0, 255 at 1, 64 at 2 and 32 at 3. You can also load the contents from a file.
<b>OE</b> must be low (connected to ground) for the data pins to drive anything.</p>
<p>The <b>LED array</b> is a grid of LEDs: each one lights when its row pin is higher than its
column pin. Displays light one column at a time, fast enough that your eye sees the whole
picture. Open <b>Circuits › Maestro › Maestro Welcome</b> to see a counter and a ROM draw the
Maestro M, then change the ROM's contents to draw your own letter.</p>
<p>The <b>dot matrix display</b> (Draw › Outputs and Labels) is a small screen of tiny LEDs with
its own memory. Put a column number on the <b>X</b> pins, a row number on the <b>Y</b> pins
and the LED's state on <b>D</b>; a rising edge on <b>WR</b> stores it, and <b>CLR</b> (high)
turns every LED off. (0, 0) is the top left. Click it to set its width, height and colour.
<b>Circuits › Maestro › Dot Matrix Display</b> shows a counter and a ROM writing a sign.</p>
<p class="helpTip">In the ROM's numbers the top data pin (the highest D) is the biggest bit, 128 for
8 data bits, so 255 lights a whole column and 128 only its top LED.</p>`,
        keywords: "rom ram sram memory eeprom chip address data contents led array matrix display multiplex digital lookup table dot screen sign pixel",
    },
    {
        id: "values",
        title: "Changing values",
        summary: "The properties panel, units and quick adjustments.",
        body: `
<p><b>Click a part</b> to open its properties panel on the right of the canvas. Changes apply
as soon as you press ${k("Enter")} or leave the field, and the part stays highlighted.</p>
<p>Type values with a unit prefix:</p>
<table class="helpTable">
  <tr><td><code>p</code></td><td>pico, 10<sup>-12</sup></td><td><code>k</code></td><td>kilo, 10<sup>3</sup></td></tr>
  <tr><td><code>n</code></td><td>nano, 10<sup>-9</sup></td><td><code>M</code></td><td>mega, 10<sup>6</sup></td></tr>
  <tr><td><code>u</code></td><td>micro, 10<sup>-6</sup></td><td><code>G</code></td><td>giga, 10<sup>9</sup></td></tr>
  <tr><td><code>m</code></td><td>milli, 10<sup>-3</sup></td><td></td><td></td></tr>
</table>
<p>So <code>4.7k</code> is 4700, <code>10u</code> is 0.00001 and <code>2k2</code> is 2200.
A capital <code>M</code> is mega; a small <code>m</code> is milli.</p>
<p>The <b>−</b> and <b>+</b> buttons step through standard values (1, 1.2, 1.5, 1.8, 2.2 …).
You can also scroll the mouse wheel over a resistor, capacitor or inductor to change its value.</p>
<p>The <b>Live</b> section at the bottom of the panel shows the part's current, voltage and
power as the circuit runs. ${k("Esc")} or the × closes the panel. ${k("Ctrl", "Z")} undoes
everything you changed while it was open.</p>`,
        keywords: "properties edit value units resistance capacitance kilo micro milli mega prefix panel live",
    },
    {
        id: "run",
        title: "Running the simulation",
        summary: "Run, stop, reset, speed and what the colours mean.",
        body: `
<p>The circuit runs as soon as it is built. <b>Running</b> / <b>Stopped</b> in the side panel
shows the state; click it to pause or continue. <b>Reset</b> starts again from time zero with
every capacitor and inductor empty.</p>
<ul>
  <li><b>Wire colours</b> show voltage: <span class="helpSwatch pos"></span> teal is positive,
      <span class="helpSwatch neg"></span> coral is negative and <span class="helpSwatch zero"></span>
      grey is 0 V.</li>
  <li><b>Moving dots</b> show current. Faster dots mean more current; their direction is the
      direction of conventional current (Options menu to change).</li>
  <li><b>Simulation Speed</b> changes how fast simulated time passes.
      <b>Current Speed</b> only changes how fast the dots move.</li>
</ul>
<p>The time since the last reset is shown at the bottom right.</p>`,
        keywords: "run stop pause reset speed colour color voltage current dots time",
    },
    {
        id: "measure",
        title: "Measuring and Freeze",
        summary: "Read currents and voltages, and freeze one instant.",
        body: `
<ul>
  <li><b>Hover a part</b> to see its current, voltage and power at the bottom right of the canvas.</li>
  <li><b>Hover a terminal</b> to see the voltage at that point.</li>
  <li><b>Click a part</b> to keep its readings open in the properties panel.</li>
</ul>
<p><b>Freeze</b> (side panel) stops the circuit at the current instant and labels it:
the current through every part with an arrow for its direction, arrows on the wires, and
the voltage at every point. The graphs stop at the same moment, so you can compare. Use the
bar at the top left to show or hide currents and voltages, and <b>Resume</b> to carry on.
Changing the circuit also ends a freeze, because the labels would be out of date.</p>`,
        keywords: "measure read hover freeze pause instant current voltage power labels arrows multimeter",
    },
    {
        id: "meter",
        title: "Instruments",
        summary: "Multimeter, function generator, power supply and Bode plot.",
        body: `
<p>Open them from the Instruments button in the tool dock. The <b>multimeter</b> never changes
the circuit, so it also works on a test's locked parts.</p>
<ul>
  <li><b>V⎓ / V~</b>: drag the red and black probe tips onto two points (a terminal or anywhere on a
      wire). The meter shows red minus black: DC is the average, AC the RMS of the changing part.</li>
  <li><b>A⎓ / A~</b>: click <b>Clamp a part</b>, then click a part to read the current through it.</li>
  <li><b>Ω</b>: put the probes on the two ends of one part to read its resistance.</li>
</ul>
<p>Like a real meter it averages for a moment before showing a value. A changing signal is read
over whole cycles, so in a slow simulation the first AC reading can take a few seconds.</p>
<p><b>Function generator</b> and <b>power supply</b> are in the same Instruments menu. Drag their
red (+) and black leads onto terminals or wire ends, set them up, and press <b>Output on</b>:</p>
<ul>
  <li>The generator gives a sine, square, triangle or sawtooth wave with the frequency,
      peak-to-peak amplitude and offset you set, through a 50 Ω output like a lab generator.</li>
  <li>The supply holds its voltage (<b>CV</b>) until the load would draw more than the current
      limit, then holds the limit current instead (<b>CC</b>), like a bench supply.</li>
</ul>
<p><b>Bode plot</b> (also in Instruments) shows how the circuit responds across frequencies: pick
the input source, put the red <b>OUT</b> probe where you want to look (and <b>REF</b> on another
point, or leave it on ground), set the range and press <b>Run sweep</b>. It plots the gain in dB and
the phase in degrees, marks the −3 dB points and reads values under the pointer. It uses SPICE
(ngspice), loaded the first time you run a sweep.</p>
<p>Instruments are never part of your saved circuit or your answer.</p>`,
        keywords: "multimeter meter voltmeter ammeter ohmmeter probe clamp measure voltage current resistance dmm function signal generator wave sine square power supply psu bench current limit cv cc instruments bode frequency response ac analysis gain phase cutoff filter spice",
    },
    {
        id: "graphs",
        title: "Graphs",
        summary: "Plot voltage, current or power over time.",
        body: `
<ol>
  <li><b>Right-click a part</b> and choose <b>View in New Scope</b>. A graph of that part
      appears in the strip at the bottom.</li>
  <li><b>Hover a graph</b> to read the value at any moment.</li>
  <li>Click the <b>gear</b> on a graph for its controls, like a bench scope's front panel:
      <ul>
        <li><b>Time</b> − / + makes the visible window shorter or longer.</li>
        <li><b>Trigger</b> Auto or Normal holds a repeating wave still: pick the rising or falling
            edge and the level it crosses.</li>
        <li>The <b>Max, Min, P-P, Avg, RMS, Freq, Duty</b> chips show those measurements on the graph.</li>
        <li><b>Cursors</b> adds two lines, A and B, that you drag along the graph; the panel shows
            each value, the time between them (Δt), 1/Δt and the difference (ΔV).</li>
        <li><b>All settings…</b> opens every option, such as what the graph plots and its scale.</li>
      </ul></li>
</ol>
<p>Drag the line above the graphs to make them taller or shorter. The <b>Scopes</b> menu
stacks or combines all graphs. The graph button in the zoom pill hides the strip when you
need more room.</p>`,
        keywords: "scope graph plot oscilloscope waveform time chart gear stack combine trigger cursor timebase measurement frequency rms",
    },
    {
        id: "navigate",
        title: "Moving around",
        summary: "Pan, zoom and fit the circuit on screen.",
        body: `
<ul>
  <li><b>Pan</b>: scroll, hold ${k("Space")} and drag, drag with the middle mouse button,
      or pick the Hand tool in the dock.</li>
  <li><b>Zoom</b>: ${k("Ctrl")} + scroll (or pinch on a trackpad) zooms towards the pointer;
      the − and + in the zoom pill; click the percentage for preset levels.</li>
  <li><b>Fit</b>: ${k("Shift", "1")} fits the whole circuit, ${k("Shift", "2")} the selection.</li>
  <li>When part of the circuit is off screen, a <b>minimap</b> appears at the bottom left.
      Click or drag in it to jump there.</li>
</ul>`,
        keywords: "pan zoom fit scroll minimap hand navigate view",
    },
    {
        id: "layout",
        title: "Layout and options",
        summary: "Hide the graphs or side panel and choose what is shown.",
        body: `
<p>The two buttons at the left of the zoom pill hide or show the <b>graphs</b> and the
<b>side panel</b>. With the side panel hidden, Run/Stop and Freeze move into the pill.</p>
<p>The <b>Options</b> menu turns on and off the tool dock, the dot grid, the minimap,
the graphs and the side panel. <b>White Background</b> switches between light and dark.
Your choices are remembered on this device.</p>`,
        keywords: "layout hide show side panel graphs options dark light theme dock grid minimap",
    },
    {
        id: "tests",
        title: "In a test or assignment",
        summary: "What changes when the lab is part of a Maestro question.",
        body: `
<ul>
  <li>Your circuit is saved by Maestro as you work, so there is no File menu.</li>
  <li>The question may limit which parts you can use; only those appear in the dock and search.</li>
  <li>Parts of a starter circuit may be <b>locked</b>: you can't select, move or change them,
      but you can connect to them.</li>
  <li>Coral pins with labels are <b>grading points</b>, where your circuit is checked.
      They come with the question: you can't move, delete or add them.</li>
  <li>The toolbar row is hidden to give you more room. Every tool is in the dock at the
      bottom, which also has <b>Undo</b> and <b>Redo</b> (or ${k("Ctrl", "Z")} / ${k("Ctrl", "Y")}).
      Undo never removes the question's own parts.</li>
  <li>After you submit, Maestro runs your circuit for a moment and measures it at the grading
      points; your marks come from those readings.</li>
</ul>
<p class="helpTip">Build the circuit, let it run for a moment, and check the values at the
grading points before you submit. Hover a pin's part or click it to see its readings.</p>`,
        keywords: "exam test assignment question locked grading points submit save allowed parts undo redo toolbar marks",
    },
    {
        id: "problems",
        title: "When something goes wrong",
        summary: "Messages the simulator shows and how to fix them.",
        body: `
<dl class="helpDefs">
  <dt>Voltage source/wire loop with no resistance!</dt>
  <dd>Two sources or a wire are connected straight across each other, or a wire shorts a
      source. Add a resistor or remove the short.</dd>
  <dt>Singular matrix!</dt>
  <dd>Part of the circuit has no path to the rest, often a missing ground or a part with an
      unconnected end. Check every terminal is connected and add a ground.</dd>
  <dt>Path to ground with no resistance!</dt>
  <dd>A source is shorted to ground. Add a resistor in the path.</dd>
  <dt>Convergence failed!</dt>
  <dd>The simulator couldn't settle on an answer, usually with diodes or transistors and very
      large or small values. Check the values, then press Reset.</dd>
  <dt>Red dots</dt>
  <dd>Terminals that nearly touch but aren't connected. Drag one onto the other.</dd>
  <dt>Nothing is moving</dt>
  <dd>The simulation may be stopped (the side panel shows <b>Stopped</b>) or frozen. Click
      <b>Stopped</b> or <b>Resume</b>. If the dots are too slow to see, raise Current Speed.</dd>
</dl>
<p>After fixing the problem, the simulation carries on; press Reset if values look stuck.</p>`,
        keywords: "error problem singular matrix loop resistance convergence red dot stuck not working fix",
    },
    {
        id: "keys",
        title: "Keyboard shortcuts",
        summary: "Faster building with the keyboard.",
        body: "",   // filled from SHORTCUTS by the panel
        keywords: "keyboard shortcut keys hotkey",
    },
];

// Case-insensitive match on every word of the query against a section's text.
export function matchesQuery(section: HelpSection, query: string): boolean {
    const words = query.toLowerCase().split(/\s+/).filter(Boolean);
    if (words.length === 0)
        return true;
    const text = (section.title + " " + section.summary + " " + (section.keywords ?? "") + " " +
                  section.body.replace(/<[^>]+>/g, " ")).toLowerCase();
    return words.every((w) => text.includes(w));
}
