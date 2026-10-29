/*
    Copyright (C) 2026 Levantate Labs

    This file is part of the Levantate Labs fork of CircuitJS1, distributed under
    the GNU General Public License, version 2 or (at your option) any later
    version. See COPYING.txt.
*/

// View toggles: buttons at the left of the zoom pill that show or hide the
// graph strip (scopes) and the Inspector, to give the circuit the whole
// window. When neither the action bar nor the app bar shows the run controls
// (both hidden), Run/Stop and Freeze appear in the pill so they stay one
// click away.

export interface ViewHost {
    graphsShown(): boolean;
    setGraphs(on: boolean): void;
    graphCount(): number;
    panelAvailable(): boolean;    // false when the page was opened without one
    panelShown(): boolean;
    setPanel(on: boolean): void;
    running(): boolean;
    runControlsShown(): boolean;  // Run/Reset/Freeze visible in a bar
    setRunning(on: boolean): void;
    frozen(): boolean;
    toggleFreeze(): void;
}

const svg = (body: string) =>
    "<svg viewBox='0 0 24 24' width='17' height='17' fill='none' stroke='currentColor' stroke-width='1.8' stroke-linecap='round' stroke-linejoin='round'>" + body + "</svg>";

const ICONS = {
    graphs: svg("<rect x='3' y='4' width='18' height='16' rx='2.5'/><path d='M6 14c1.5-4 3-4 4.5 0s3 4 4.5 0 2.2-3 3-2'/>"),
    panel: svg("<rect x='3' y='4' width='18' height='16' rx='2.5'/><path d='M15 4v16'/>"),
    play: svg("<path d='M8 5.5v13l10-6.5z' fill='currentColor'/>"),
    pause: svg("<path d='M8.5 5.5v13M15.5 5.5v13' stroke-width='2.4'/>"),
    freeze: svg("<path d='M12 2v20M3.3 7l17.4 10M3.3 17L20.7 7'/>"),
};

export class ViewToggles {
    private readonly graphs: HTMLButtonElement;
    private readonly panel: HTMLButtonElement;
    private readonly run: HTMLButtonElement;
    private readonly freeze: HTMLButtonElement;
    private readonly sep: HTMLElement;
    private last = "";

    constructor(private readonly host: ViewHost, pill: HTMLElement) {
        const first = pill.firstChild;
        const add = (el: HTMLElement) => pill.insertBefore(el, first);
        this.run = this.button("viewRun", () => host.setRunning(!host.running()));
        this.freeze = this.button("viewFreeze", () => host.toggleFreeze());
        this.graphs = this.button("viewGraphs", () => host.setGraphs(!host.graphsShown()));
        this.panel = this.button("viewPanel", () => host.setPanel(!host.panelShown()));
        this.freeze.innerHTML = ICONS.freeze;
        this.graphs.innerHTML = ICONS.graphs;
        this.panel.innerHTML = ICONS.panel;
        this.sep = document.createElement("span");
        this.sep.className = "zoomPillSep";
        for (const el of [this.run, this.freeze, this.graphs, this.panel, this.sep])
            add(el);
        this.update();
    }

    private button(cls: string, onClick: () => void): HTMLButtonElement {
        const b = document.createElement("button");
        b.type = "button";
        b.className = "viewToggle " + cls;
        b.addEventListener("click", onClick);
        // keep keyboard focus on the canvas so shortcuts keep working
        b.addEventListener("mousedown", (e) => e.preventDefault());
        return b;
    }

    private static set(b: HTMLButtonElement, label: string, pressed: boolean | null, hidden = false): void {
        b.title = label;
        b.setAttribute("aria-label", label);
        if (pressed == null)
            b.removeAttribute("aria-pressed");
        else
            b.setAttribute("aria-pressed", String(pressed));
        b.classList.toggle("on", pressed === true);
        b.classList.toggle("lvHidden", hidden);
    }

    // Called every frame; touches the DOM only when something changed.
    update(): void {
        const h = this.host;
        const state = [h.graphsShown(), h.graphCount(), h.panelAvailable(), h.panelShown(), h.running(), h.frozen(),
                       h.runControlsShown()].join();
        if (state === this.last)
            return;
        this.last = state;

        const n = h.graphCount();
        const count = n > 0 ? " (" + n + ")" : "";
        ViewToggles.set(this.graphs, (h.graphsShown() ? "Hide graphs" : "Show graphs") + count, h.graphsShown(), n === 0);
        ViewToggles.set(this.panel, h.panelShown() ? "Hide the Inspector" : "Show the Inspector", h.panelShown(), !h.panelAvailable());
        // Run/Stop and Freeze live in the action bar (or the app bar); here only while neither shows
        const inPill = !h.runControlsShown();
        this.run.innerHTML = h.running() ? ICONS.pause : ICONS.play;
        ViewToggles.set(this.run, h.running() ? "Stop the simulation" : "Run the simulation", null, !inPill);
        ViewToggles.set(this.freeze, h.frozen() ? "Resume the simulation" : "Freeze this instant and show currents and voltages",
                        h.frozen(), !inPill);
        this.sep.classList.toggle("lvHidden", n === 0 && !h.panelAvailable() && !inPill);
    }
}
