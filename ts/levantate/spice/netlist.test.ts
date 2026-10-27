/*
    Copyright (C) 2026 Levantate Labs

    This file is part of the Levantate Labs fork of CircuitJS1, distributed under
    the GNU General Public License, version 2 or (at your option) any later
    version. See COPYING.txt.
*/

import { describe, expect, it } from "vitest";
import { CircuitElm } from "../../CircuitElm";
import { SimulationManager } from "../../SimulationManager";
import { ResistorElm } from "../../ResistorElm";
import { CapacitorElm } from "../../CapacitorElm";
import { VoltageElm } from "../../VoltageElm";
import { WireElm } from "../../WireElm";
import { GroundElm } from "../../GroundElm";
import { buildNetlist, num } from "./netlist";

// the same stand-in app upstream's circuit tests use
const off = { getState: () => false };
function makeApp(elms: any[]) {
    const app: any = {
        elmList: elms, postDrawList: [], badConnectionList: [],
        showResistanceInVoltageSources: true, dumpMatrix: false, stopMessage: null,
        dcAnalysisFlag: false, simRunning: true, minFrameRate: 10,
        menus: { showValuesCheckItem: off, powerCheckItem: off, euroResistorCheckItem: off, showOhmCheckItem: off, smallGridCheckItem: off },
        ui: { elmList: elms, steps: 0, lastFrameTime: 0 },
        scopeManager: { canDelayWireProcessing: () => false },
        setStopElm: () => {}, getIterCount: () => 1, isPrintable: () => false, onTimeStep: () => {},
        stop: (s: string) => { app.stopMessage = s; },
    };
    (CircuitElm as any).app = app;
    return app;
}

function analyzed(elms: any[]) {
    const app = (CircuitElm as any).app;
    app.elmList.push(...elms);
    const sim = new SimulationManager(app);
    (CircuitElm as any).sim = sim;
    sim.analyzeCircuit();
    sim.preStampCircuit(false);
    sim.stampCircuit();
    return app;
}

function place<T extends CircuitElm>(e: T, x1: number, y1: number, x2: number, y2: number): T {
    e.x = x1; e.y = y1; e.x2 = x2; e.y2 = y2;
    e.setPoints();
    return e;
}

describe("buildNetlist", () => {
    // AC source (+ at the top), R across the top, C down to the bottom rail, grounded
    function rcLowPass() {
        makeApp([]);
        const v = place(new VoltageElm(0, 0, VoltageElm.WF_AC), 0, 128, 0, 0);
        v.frequency = 1000;
        v.maxVoltage = 5;
        const r = place(new ResistorElm(0, 0), 0, 0, 128, 0);
        (r as any).resistance = 1000;
        const c = place(new CapacitorElm(0, 0), 128, 0, 128, 128);
        (c as any).capacitance = 1e-7;
        const w = place(new WireElm(0, 0), 0, 128, 128, 128);
        const g = place(new GroundElm(0, 0), 0, 128, 0, 160);
        return { elms: [v, r, c, w, g], v, r, c };
    }

    it("writes parts on the solved nodes, with ground as 0", () => {
        const { elms, v } = rcLowPass();
        analyzed(elms);
        const nl = buildNetlist(elms, { acInput: v, analysis: [".ac dec 20 1 1meg"] });
        const lines = nl.text.split("\n");
        expect(lines).toContain("V1 n1 0 DC 0 SIN(0 5 1000 0 0 0) AC 1");
        expect(lines).toContain("R1 n1 n2 1000");
        expect(lines).toContain("C1 n2 0 1e-7");
        expect(lines).toContain(".ac dec 20 1 1meg");
        expect(lines[lines.length - 2]).toBe(".end");
        expect(nl.unsupported).toEqual([]);
        expect(nl.sources).toEqual([v]);
    });

    it("drives only the chosen source with AC 1", () => {
        const { elms } = rcLowPass();
        analyzed(elms);
        expect(buildNetlist(elms).text).not.toContain("AC 1");
    });

    it("formats numbers compactly", () => {
        expect(num(1e-7)).toBe("1e-7");
        expect(num(1000)).toBe("1000");
        expect(num(0.1 + 0.2)).toBe("0.3");
    });
});
