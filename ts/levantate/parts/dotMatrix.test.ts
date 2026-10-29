/*
    Copyright (C) 2026 Levantate Labs

    This file is part of the Levantate Labs fork of CircuitJS1, distributed under
    the GNU General Public License, version 2 or (at your option) any later
    version. See COPYING.txt.
*/

import { describe, expect, it } from "vitest";
import { CircuitElm } from "../../CircuitElm";
import { StringTokenizer } from "../../StringTokenizer";
import { DotMatrixElm } from "./DotMatrixElm";
import { DotMatrixFrame, addressBits, chipSize, readAddress } from "./dotMatrixFrame";

// the same stand-in app upstream's circuit tests use
const off = { getState: () => false };
function makeApp() {
    const app: any = {
        elmList: [], postDrawList: [], badConnectionList: [], stopMessage: null,
        menus: { showValuesCheckItem: off, powerCheckItem: off, euroResistorCheckItem: off, showOhmCheckItem: off, smallGridCheckItem: off },
        ui: { elmList: [], steps: 0, lastFrameTime: 0 },
    };
    (CircuitElm as any).app = app;
    return app;
}

describe("dot-matrix frame", () => {
    it("needs enough address bits for every column and row", () => {
        expect(addressBits(8)).toBe(3);
        expect(addressBits(32)).toBe(5);
        expect(addressBits(20)).toBe(5);
        expect(addressBits(64)).toBe(6);
    });

    it("reads addresses most significant bit first", () => {
        expect(readAddress([true, false, true])).toBe(5);
        expect(readAddress([false, false, false, true, true])).toBe(3);
    });

    it("stores LEDs, ignores addresses past the edge and clears", () => {
        const f = new DotMatrixFrame(20, 10);
        f.write(19, 9, true);
        f.write(25, 2, true);   // past the right edge
        expect(f.get(19, 9)).toBe(true);
        expect(f.pixels.reduce((a, b) => a + b, 0)).toBe(1);
        f.clear();
        expect(f.get(19, 9)).toBe(false);
    });

    it("keeps what fits when resized", () => {
        const a = new DotMatrixFrame(8, 8);
        a.write(2, 3, true);
        a.write(7, 7, true);
        const b = new DotMatrixFrame(4, 4);
        b.copyFrom(a);
        expect(b.get(2, 3)).toBe(true);
    });

    it("sizes the chip around the screen and its pins", () => {
        // 32 × 16 at 4 px a LED: 5 X pins plus a clear square at each corner
        expect(chipSize(32, 16, 16)).toEqual({ sizeX: 7, sizeY: 4, pitch: 4 });
        // small screens get bigger LEDs
        expect(chipSize(8, 8, 16).pitch).toBe(8);
        // never fewer squares than pins on a side
        expect(chipSize(4, 4, 16).sizeY).toBeGreaterThanOrEqual(3);
    });
});

describe("DotMatrixElm", () => {
    function setPins(e: DotMatrixElm, x: number, y: number, d: boolean, wr: boolean, clr = false) {
        for (let i = 0; i < e.xBits; i++)
            e.pins[i].value = ((x >> (e.xBits - 1 - i)) & 1) === 1;
        for (let i = 0; i < e.yBits; i++)
            e.pins[e.xBits + i].value = ((y >> (e.yBits - 1 - i)) & 1) === 1;
        const n = e.xBits + e.yBits;
        e.pins[n].value = d;
        e.pins[n + 1].value = wr;
        e.pins[n + 2].value = clr;
        e.execute();
    }

    it("writes an LED on the rising edge of WR only", () => {
        makeApp();
        const e = new DotMatrixElm(0, 0);
        expect([e.width, e.height, e.xBits, e.yBits]).toEqual([32, 16, 5, 4]);
        expect(e.getPostCount()).toBe(12);
        setPins(e, 5, 3, true, false);
        expect(e.frame.get(5, 3)).toBe(false);
        setPins(e, 5, 3, true, true);       // rising edge
        expect(e.frame.get(5, 3)).toBe(true);
        setPins(e, 6, 3, true, true);       // WR still high: no new write
        expect(e.frame.get(6, 3)).toBe(false);
        setPins(e, 6, 3, true, false);
        setPins(e, 5, 3, false, true);      // write an off
        expect(e.frame.get(5, 3)).toBe(false);
    });

    it("clears every LED while CLR is high", () => {
        makeApp();
        const e = new DotMatrixElm(0, 0);
        setPins(e, 1, 1, true, true);
        setPins(e, 1, 1, true, false, true);
        expect(e.frame.pixels.every((p) => p === 0)).toBe(true);
    });

    it("loads its size and colour from a saved circuit", () => {
        makeApp();
        const e = new DotMatrixElm(0, 0, 32, 0, 0, new StringTokenizer("8 8 2"));
        expect([e.width, e.height, e.color, e.getPostCount()]).toEqual([8, 8, 2, 9]);
    });

    it("falls back to 32 × 16 for sizes out of range", () => {
        makeApp();
        const e = new DotMatrixElm(0, 0, 32, 0, 0, new StringTokenizer("500 1 9"));
        expect([e.width, e.height, e.color]).toEqual([32, 16, 0]);
    });
});
