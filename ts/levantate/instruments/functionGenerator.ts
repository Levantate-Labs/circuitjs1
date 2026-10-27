/*
    Copyright (C) 2026 Levantate Labs

    This file is part of the Levantate Labs fork of CircuitJS1, distributed under
    the GNU General Public License, version 2 or (at your option) any later
    version. See COPYING.txt.
*/

// Function generator (roadmap slice L9): sine, square, triangle or sawtooth
// with frequency, peak-to-peak amplitude and DC offset, through a 50 Ω output
// like a bench generator. The output is upstream's voltage source with an
// internal resistance, added by SourceInstrument while the output is on.

import { VoltageElm } from "../../VoltageElm";
import { SourceInstrument, numberField, type SourceHost } from "./sourceInstrument";

const WAVES: { wf: number; label: string; title: string }[] = [
    { wf: VoltageElm.WF_AC, label: "∿", title: "Sine" },
    { wf: VoltageElm.WF_SQUARE, label: "⊓", title: "Square" },
    { wf: VoltageElm.WF_TRIANGLE, label: "⋀", title: "Triangle" },
    { wf: VoltageElm.WF_SAWTOOTH, label: "⩘", title: "Sawtooth" },
];

export const OUTPUT_OHMS = 50;

export class FunctionGenerator extends SourceInstrument {
    private waveform = VoltageElm.WF_AC;
    private frequency = 100;      // Hz
    private vpp = 5;              // volts peak to peak
    private offset = 0;           // volts
    private readonly waveButtons = new Map<number, HTMLButtonElement>();

    constructor(host: SourceHost, container: HTMLElement, canvas: HTMLCanvasElement) {
        super(host, container, canvas, {
            title: "Function generator",
            className: "lvGen",
            park: { x: 0.3, y: 0.55 },
            jacks: ["OUTPUT", "COM"],
            body: `
<div class="lvMeterModes lvGenWaves" role="radiogroup" aria-label="Waveform"></div>
<label class="lvInstrField"><span>Frequency</span><input type="number" min="0.01" max="1000000" step="any" value="100"><em>Hz</em></label>
<label class="lvInstrField"><span>Amplitude</span><input type="number" min="0" max="40" step="any" value="5"><em>Vpp</em></label>
<label class="lvInstrField"><span>Offset</span><input type="number" min="-20" max="20" step="any" value="0"><em>V</em></label>
<p class="lvInstrNote">50 Ω output</p>`,
        });
        const waves = this.panel.querySelector(".lvGenWaves")!;
        for (const w of WAVES) {
            const b = document.createElement("button");
            b.type = "button";
            b.textContent = w.label;
            b.title = w.title;
            b.setAttribute("aria-label", w.title);
            b.setAttribute("role", "radio");
            b.addEventListener("click", () => {
                this.waveform = w.wf;
                this.settingsChanged();
            });
            waves.appendChild(b);
            this.waveButtons.set(w.wf, b);
        }
        const [freq, amp, off] = Array.from(this.panel.querySelectorAll<HTMLInputElement>(".lvInstrField input"));
        numberField(freq, 0.01, 1e6, (v) => {
            this.retime(v);
            this.frequency = v;
            this.settingsChanged();
        });
        numberField(amp, 0, 40, (v) => { this.vpp = v; this.settingsChanged(); });
        numberField(off, -20, 20, (v) => { this.offset = v; this.settingsChanged(); });
    }

    // a new frequency carries on from the current phase instead of jumping:
    // keep (t - t0) * f the same
    private retime(newFreq: number): void {
        const e = this.elm;
        if (e == null || !(newFreq > 0) || !(this.frequency > 0))
            return;
        const t = this.host.simTime();
        e.freqTimeZero = t - (t - e.freqTimeZero) * this.frequency / newFreq;
    }

    protected createSource(): any {
        return new VoltageElm(0, 0, VoltageElm.WF_AC);
    }

    protected configure(e: any): void {
        e.waveform = this.waveform;
        e.frequency = this.frequency;
        e.maxVoltage = this.vpp / 2;
        e.bias = this.offset;
        e.dutyCycle = 0.5;
        e.internalResistance = OUTPUT_OHMS;
    }

    protected currentOut(e: any): number {
        return -e.getCurrent();
    }

    protected renderPanel(): void {
        for (const [wf, b] of this.waveButtons) {
            b.classList.toggle("on", wf === this.waveform);
            b.setAttribute("aria-checked", String(wf === this.waveform));
        }
    }
}
