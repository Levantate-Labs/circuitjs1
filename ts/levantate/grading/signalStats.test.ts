/*
    Copyright (C) 2026 Levantate Labs

    This file is part of the Levantate Labs fork of CircuitJS1, distributed under
    the GNU General Public License, version 2 or (at your option) any later
    version. See COPYING.txt.
*/

import { describe, it, expect } from "vitest";
import { SignalStats } from "./signalStats";

function sine(stats: SignalStats, amp: number, freq: number, offset: number, seconds: number, dt: number) {
    for (let t = 0; t <= seconds; t += dt)
        stats.add(t, offset + amp * Math.sin(2 * Math.PI * freq * t), true);
}

describe("SignalStats", () => {
    it("is empty until it has samples", () => {
        const s = new SignalStats();
        expect(s.measure("value")).toBeNaN();
        expect(s.sampleCount).toBe(0);
    });

    it("reads a DC level", () => {
        const s = new SignalStats();
        for (let i = 0; i < 100; i++) s.add(i * 1e-3, 5);
        expect(s.measure("value")).toBe(5);
        expect(s.measure("avg")).toBeCloseTo(5, 9);
        expect(s.measure("rms")).toBeCloseTo(5, 9);
        expect(s.measure("p2p")).toBe(0);
        expect(s.measure("freq")).toBe(0);
        expect(s.measure("period")).toBeNaN();
    });

    it("reads amplitude, RMS, average and frequency of a sine", () => {
        const s = new SignalStats();
        sine(s, 2, 50, 1, 0.2, 1e-5);   // 10 full cycles of 2 V amplitude on a 1 V offset
        expect(s.measure("max")).toBeCloseTo(3, 3);
        expect(s.measure("min")).toBeCloseTo(-1, 3);
        expect(s.measure("p2p")).toBeCloseTo(4, 3);
        expect(s.measure("avg")).toBeCloseTo(1, 2);
        // RMS of offset + sine = sqrt(offset² + amp²/2)
        expect(s.measure("rms")).toBeCloseTo(Math.sqrt(1 + 2), 2);
        expect(s.measure("freq")).toBeCloseTo(50, 1);
        expect(s.measure("period")).toBeCloseTo(0.02, 4);
    });

    it("starts over after reset", () => {
        const s = new SignalStats();
        sine(s, 2, 50, 0, 0.1, 1e-4);
        s.reset();
        expect(s.sampleCount).toBe(0);
        s.add(0, 7);
        expect(s.measure("max")).toBe(7);
        expect(s.getSamples()).toHaveLength(0);
    });

    it("keeps waveform samples bounded", () => {
        const s = new SignalStats();
        sine(s, 1, 1000, 0, 0.1, 1e-6);   // 100k samples
        const all = (s as any).samples.length;
        expect(all).toBeLessThanOrEqual(SignalStats.MAX_SAMPLES);
        const pts = s.getSamples(256);
        expect(pts).toHaveLength(256);
        for (let i = 1; i < pts.length; i++)
            expect(pts[i].t).toBeGreaterThan(pts[i - 1].t);
    });

    it("ignores non-finite samples", () => {
        const s = new SignalStats();
        s.add(0, 1);
        s.add(1, NaN);
        s.add(2, Infinity);
        expect(s.sampleCount).toBe(1);
        expect(s.measure("max")).toBe(1);
    });
});
