/*
    Copyright (C) 2026 Levantate Labs

    This file is part of the Levantate Labs fork of CircuitJS1, distributed under
    the GNU General Public License, version 2 or (at your option) any later
    version. See COPYING.txt.
*/

import { describe, it, expect, beforeEach } from "vitest";
import { CircuitElm } from "../../CircuitElm";
import { ResistorElm } from "../../ResistorElm";
import { WireElm } from "../../WireElm";
import { GradePointElm } from "./GradePointElm";

const off = { getState: () => false };

function place<T extends CircuitElm>(e: T, x1: number, y1: number, x2: number, y2: number): T {
    e.x = x1; e.y = y1; e.x2 = x2; e.y2 = y2;
    e.setPoints();
    // bounding box as draw() would set it for a straight two-terminal part
    e.boundingBox.setBounds(Math.min(x1, x2) - 8, Math.min(y1, y2) - 8,
                            Math.abs(x2 - x1) + 16, Math.abs(y2 - y1) + 16);
    return e;
}

let elmList: CircuitElm[];
let sim: any;

beforeEach(() => {
    elmList = [];
    sim = { t: 0, timeStepCount: 0 };
    (CircuitElm as any).app = {
        elmList,
        needAnalyze: () => {},
        menus: {
            showValuesCheckItem: off, powerCheckItem: off, euroResistorCheckItem: off,
            showOhmCheckItem: off, smallGridCheckItem: off,
        },
    };
    (CircuitElm as any).sim = sim;
});

function step(gp: GradePointElm, t: number) {
    sim.t = t;
    sim.timeStepCount++;
    gp.stepFinished();
}

describe("GradePointElm", () => {
    it("starts as a one-terminal node pin with an id and a label", () => {
        const gp = new GradePointElm(0, 0);
        expect(gp.kind).toBe("node");
        expect(gp.getPostCount()).toBe(1);
        expect(gp.pointId).toMatch(/^gp_[a-z0-9]+$/);
        expect(gp.label).toBe("P1");
        expect(gp.getDumpType()).toBe(GradePointElm.DUMP_TYPE);
        expect(gp.getXmlDumpType()).toBe("LvGradePoint");
    });

    it("gives every new pin its own id", () => {
        const ids = new Set(Array.from({ length: 50 }, () => new GradePointElm(0, 0).pointId));
        expect(ids.size).toBe(50);
    });

    it("reads its node voltage each step", () => {
        const gp = new GradePointElm(0, 0);
        gp.nodes[0] = { v: 5 } as any;
        step(gp, 0);
        step(gp, 1e-3);
        expect(gp.measure("value")).toBe(5);
        expect(gp.measure("avg")).toBe(5);
    });

    it("counts each simulation step once", () => {
        const gp = new GradePointElm(0, 0);
        gp.nodes[0] = { v: 1 } as any;
        step(gp, 0);
        gp.stepFinished();   // same step again (e.g. called twice in one step)
        expect(gp.stats.sampleCount).toBe(1);
    });

    it("finds the part its tip points at, ignoring wires", () => {
        const r = place(new ResistorElm(0, 0), 0, 0, 64, 0);
        const w = place(new WireElm(0, 0), 0, -40, 64, -40);
        const gp = new GradePointElm(0, 0);
        gp.kind = "branch";
        gp.allocNodes();
        gp.x = 30; gp.y = 2;   // tip on the resistor body
        elmList.push(w, r, gp);
        gp.stamp();
        expect(gp.getPostCount()).toBe(0);
        expect(gp.getTarget()).toBe(r);
    });

    it("prefers the smallest part under the tip", () => {
        const big = place(new ResistorElm(0, 0), 0, 0, 320, 0);
        const small = place(new ResistorElm(0, 0), 100, 0, 132, 0);
        const gp = new GradePointElm(0, 0);
        gp.kind = "power";
        gp.allocNodes();
        gp.x = 116; gp.y = 0;
        elmList.push(big, small, gp);
        gp.stamp();
        expect(gp.getTarget()).toBe(small);
    });

    it("has no target when the tip is in empty space", () => {
        const r = place(new ResistorElm(0, 0), 0, 0, 64, 0);
        const gp = new GradePointElm(0, 0);
        gp.kind = "branch";
        gp.allocNodes();
        gp.x = 400; gp.y = 400;
        elmList.push(r, gp);
        gp.stamp();
        expect(gp.getTarget()).toBeNull();
        step(gp, 0);
        expect(gp.stats.sampleCount).toBe(0);   // NaN readings are skipped
    });

    it("reads the target's current and power", () => {
        const r = place(new ResistorElm(0, 0), 0, 0, 64, 0);
        (r as any).current = 0.002;
        r.nodes[0] = { v: 4 } as any;
        r.nodes[1] = { v: 0 } as any;
        const gp = new GradePointElm(0, 0);
        gp.kind = "branch";
        gp.allocNodes();
        gp.x = 30; gp.y = 0;
        elmList.push(r, gp);
        gp.stamp();
        expect(gp.reading()).toBeCloseTo(0.002, 9);
        gp.kind = "power";
        expect(gp.reading()).toBeCloseTo(4 * 0.002, 9);
    });

    it("hides its edit fields when locked", () => {
        const gp = new GradePointElm(0, 0);
        expect(gp.getEditInfo(0)).not.toBeNull();
        gp.levLocked = true;
        expect(gp.getEditInfo(0)).toBeNull();
        expect(gp.hasProperties()).toBe(false);
    });
});
