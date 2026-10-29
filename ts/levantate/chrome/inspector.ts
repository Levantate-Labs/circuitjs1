/*
    Copyright (C) 2026 Levantate Labs

    This file is part of the Levantate Labs fork of CircuitJS1, distributed under
    the GNU General Public License, version 2 or (at your option) any later
    version. See COPYING.txt.
*/

// The Inspector: the panel on the right of the canvas (upstream's side panel).
// Sections: Simulation (time, time step, speed against real time), Animation
// (the current dots and power glow sliders) and Live controls (sliders for
// potentiometers and other adjustable parts, which upstream added to the
// panel without a heading), with About and licence at the foot.

export interface InspectorStats {
    time: string;        // simulated time, e.g. "12.40 ms"
    step: string;        // time step, e.g. "5 µs"
    rate: string;        // simulated time per real second, e.g. "0.40×", or "" when stopped
}

export class Inspector {
    /** Live control widgets go in here (UIManager.addWidgetToVerticalPanel). */
    readonly liveControls: HTMLElement;
    /** The power glow row, shown only in power view. */
    readonly powerRow: HTMLElement;
    private readonly liveEmpty: HTMLElement;
    private readonly values: Record<keyof InspectorStats, HTMLElement>;
    private last = "";

    constructor(panel: HTMLElement, sliders: { current: HTMLElement; power: HTMLElement }, onAbout: () => void) {
        panel.classList.add("inspector");

        const sim = this.section(panel, "Simulation");
        const grid = document.createElement("dl");
        grid.className = "inspectorStats";
        const row = (label: string) => {
            const dt = document.createElement("dt");
            dt.textContent = label;
            const dd = document.createElement("dd");
            grid.append(dt, dd);
            return dd;
        };
        this.values = { time: row("Time"), step: row("Time step"), rate: row("Speed") };
        this.values.rate.title = "Simulated time per second of real time";
        sim.appendChild(grid);

        const anim = this.section(panel, "Animation");
        anim.appendChild(this.slider("Current dots", sliders.current,
            "How fast the dots move. It doesn't change the circuit."));
        this.powerRow = this.slider("Power glow", sliders.power, "How brightly parts glow in power view");
        anim.appendChild(this.powerRow);

        const live = this.section(panel, "Live controls");
        this.liveControls = document.createElement("div");
        this.liveControls.className = "inspectorLive";
        this.liveEmpty = document.createElement("p");
        this.liveEmpty.className = "inspectorEmpty";
        this.liveEmpty.textContent = "Sliders for potentiometers and other adjustable parts show up here.";
        live.append(this.liveControls, this.liveEmpty);

        const foot = document.createElement("div");
        foot.className = "inspectorFoot";
        const about = document.createElement("button");
        about.type = "button";
        about.className = "lvAboutLink";
        about.textContent = "About and licence";
        about.addEventListener("click", onAbout);
        foot.appendChild(about);
        panel.appendChild(foot);
    }

    private section(panel: HTMLElement, title: string): HTMLElement {
        const s = document.createElement("section");
        s.className = "inspectorSection";
        const h = document.createElement("h2");
        h.textContent = title;
        s.appendChild(h);
        panel.appendChild(s);
        return s;
    }

    private slider(label: string, el: HTMLElement, help: string): HTMLElement {
        const wrap = document.createElement("div");
        wrap.className = "inspectorSlider";
        const l = document.createElement("div");
        l.className = "sideLabel";
        l.textContent = label;
        l.title = help;
        wrap.append(l, el);
        return wrap;
    }

    /** Shows the live-controls hint only while there are none. */
    syncLive(): void {
        this.liveEmpty.classList.toggle("lvHidden", this.liveControls.childElementCount > 0);
    }

    /** Called a few times a second; touches the DOM only when something changed. */
    update(stats: InspectorStats): void {
        const key = stats.time + "|" + stats.step + "|" + stats.rate;
        if (key === this.last)
            return;
        this.last = key;
        this.values.time.textContent = stats.time;
        this.values.step.textContent = stats.step;
        this.values.rate.textContent = stats.rate || "Stopped";
    }
}

/** Simulated seconds per real second, as "0.40×" (3 significant figures). */
export function formatRate(simSecondsPerSecond: number): string {
    if (!(simSecondsPerSecond > 0))
        return "";
    const v = simSecondsPerSecond;
    const digits = v >= 100 ? 0 : v >= 10 ? 1 : v >= 1 ? 2 : Math.min(6, 2 - Math.floor(Math.log10(v)));
    return v.toFixed(digits) + "×";
}
