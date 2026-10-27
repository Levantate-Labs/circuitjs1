/*
    Copyright (C) 2026 Levantate Labs

    This file is part of the Levantate Labs fork of CircuitJS1, distributed under
    the GNU General Public License, version 2 or (at your option) any later
    version. See COPYING.txt.
*/

// Bench power supply (roadmap slice L9): set a voltage and a current limit,
// like a lab supply. Below the limit it holds the voltage (CV); a load that
// would draw more gets the limit current and the voltage drops (CC).
//
// Modelled as upstream's current source with a compliance voltage: it pushes
// the limit current until the output reaches the set voltage, then saturates.
// Upstream's knee starts limiting at 95% of the voltage (a "5 V" supply would
// sag to about 4.8 V under load), so PsuSourceElm narrows it to 0.02% (at
// least 0.1 mV) to regulate like a real supply.

import { CurrentElm } from "../../CurrentElm";
import { SimulationManager } from "../../SimulationManager";
import { SourceInstrument, numberField, type SourceHost } from "./sourceInstrument";

export class PsuSourceElm extends CurrentElm {
    // the width of the knee between constant current and constant voltage
    static kneeWidth(vmax: number): number {
        return Math.max(1e-4, 2e-4 * vmax);
    }

    setBroken(_b: boolean): void {
        this.broken = false;   // always voltage-limited: never an open current source
    }

    doStep(): void {
        const sim = SimulationManager.theSim;
        let vd = this.nodes[1].v - this.nodes[0].v;
        const vmax = this.maxVoltage;
        const vWidth = PsuSourceElm.kneeWidth(vmax);
        const vStart = vmax - vWidth;
        const vMid = (vStart + vmax) / 2;
        const vt = vWidth / 5;

        // same Newton step limits as upstream, for the narrower knee
        if (this.lastVoltDiff < vStart && vd > vStart) {
            vd = vStart;
            sim.converged = false;
        } else if (this.lastVoltDiff > vmax && vd < vmax) {
            vd = vmax;
            sim.converged = false;
        } else if (this.lastVoltDiff >= vStart && this.lastVoltDiff <= vmax) {
            const maxStep = vWidth / 4;
            if (vd > this.lastVoltDiff + maxStep) {
                vd = this.lastVoltDiff + maxStep;
                sim.converged = false;
            } else if (vd < this.lastVoltDiff - maxStep) {
                vd = this.lastVoltDiff - maxStep;
                sim.converged = false;
            }
        }
        this.lastVoltDiff = vd;

        const tanhArg = Math.tanh((vd - vMid) / vt);
        const i = this.currentValue * 0.5 * (1 - tanhArg);
        const g = -this.currentValue * 0.5 * (1 - tanhArg * tanhArg) / vt;
        const absG = Math.abs(g) + 1e-6;
        sim.stampResistor(this.nodes[0], this.nodes[1], 1 / absG);
        sim.stampCurrentSource(this.nodes[0], this.nodes[1], i - g * vd);
        this.current = i;
    }
}

export class BenchSupply extends SourceInstrument {
    private volts = 5;
    private limit = 0.5;          // amps
    private readonly vDisplay: HTMLElement;
    private readonly iDisplay: HTMLElement;
    private readonly modeTag: HTMLElement;

    constructor(host: SourceHost, container: HTMLElement, canvas: HTMLCanvasElement) {
        super(host, container, canvas, {
            title: "Power supply",
            className: "lvPsu",
            park: { x: 0.45, y: 0.62 },
            jacks: ["+", "−"],
            body: `
<div class="lvMeterLcd lvPsuLcd" aria-live="polite">
  <span class="lvPsuV">0.00</span><span class="lvMeterUnit">V</span>
  <span class="lvPsuI">0.000</span><span class="lvMeterUnit">A</span>
  <span class="lvMeterMode lvPsuMode"></span></div>
<label class="lvInstrField"><span>Voltage</span><input type="number" min="0.01" max="30" step="any" value="5"><em>V</em></label>
<label class="lvInstrField"><span>Current limit</span><input type="number" min="0.001" max="3" step="any" value="0.5"><em>A</em></label>`,
        });
        this.vDisplay = this.panel.querySelector(".lvPsuV")!;
        this.iDisplay = this.panel.querySelector(".lvPsuI")!;
        this.modeTag = this.panel.querySelector(".lvPsuMode")!;
        const [v, i] = Array.from(this.panel.querySelectorAll<HTMLInputElement>(".lvInstrField input"));
        numberField(v, 0.01, 30, (x) => { this.volts = x; this.settingsChanged(); });
        numberField(i, 0.001, 3, (x) => { this.limit = x; this.settingsChanged(); });
    }

    protected createSource(): any {
        return new PsuSourceElm(0, 0);
    }

    protected configure(e: any): void {
        e.currentValue = this.limit;
        e.maxVoltage = this.volts;
    }

    protected currentOut(e: any): number {
        return e.current;
    }

    protected renderPanel(): void {
        const r = this.outputReading();
        this.vDisplay.textContent = r ? Math.max(0, r.v).toFixed(2) : "0.00";
        this.iDisplay.textContent = r ? Math.max(0, r.i).toFixed(3) : "0.000";
        // at the limit the supply is holding the current, not the voltage
        const cc = r != null && r.i >= this.limit * 0.98;
        this.modeTag.textContent = r ? (cc ? "CC" : "CV") : "";
        this.modeTag.classList.toggle("cc", cc);
    }
}
