/*
    Copyright (C) 2026 Levantate Labs

    This file is part of the Levantate Labs fork of CircuitJS1, distributed under
    the GNU General Public License, version 2 or (at your option) any later
    version. See COPYING.txt.
*/

// Frequency response from an AC analysis: gain (dB) and phase (degrees) per
// frequency, and the numbers students read off a Bode plot. Pure functions,
// shared by the Bode panel and the grading runner.

import type { Complex } from "./engine";

export interface BodePoint { f: number; gainDb: number; phaseDeg: number; }

/** out = V(+) − V(−) for an "AC 1" input: the gain and phase at each frequency. */
export function bodePoints(freq: number[], plus: Complex[] | null, minus: Complex[] | null): BodePoint[] {
    const out: BodePoint[] = [];
    let lastPhase = NaN;
    for (let i = 0; i < freq.length; i++) {
        const re = (plus?.[i]?.real ?? 0) - (minus?.[i]?.real ?? 0);
        const im = (plus?.[i]?.img ?? 0) - (minus?.[i]?.img ?? 0);
        const mag = Math.hypot(re, im);
        let ph = (Math.atan2(im, re) * 180) / Math.PI;
        // unwrap, so a phase sweeping past ±180° stays continuous
        if (isFinite(lastPhase)) {
            while (ph - lastPhase > 180) ph -= 360;
            while (ph - lastPhase < -180) ph += 360;
        }
        lastPhase = ph;
        out.push({ f: freq[i], gainDb: mag > 0 ? 20 * Math.log10(mag) : -400, phaseDeg: ph });
    }
    return out;
}

/** Interpolated value of `key` at frequency f (linear in log f). */
export function valueAt(points: BodePoint[], f: number, key: "gainDb" | "phaseDeg"): number {
    if (points.length === 0 || !(f > 0))
        return NaN;
    if (f <= points[0].f)
        return points[0][key];
    for (let i = 1; i < points.length; i++) {
        const a = points[i - 1], b = points[i];
        if (f <= b.f) {
            const t = (Math.log(f) - Math.log(a.f)) / (Math.log(b.f) - Math.log(a.f));
            return a[key] + t * (b[key] - a[key]);
        }
    }
    return points[points.length - 1][key];
}

export interface BodeSummary {
    peakDb: number;
    peakF: number;
    /** where the gain is 3 dB below the peak, going down / up from it */
    lowCutoff: number | null;
    highCutoff: number | null;
}

export function summarize(points: BodePoint[]): BodeSummary {
    let peak = 0;
    for (let i = 1; i < points.length; i++)
        if (points[i].gainDb > points[peak].gainDb)
            peak = i;
    const level = points[peak].gainDb - 3;
    const cross = (i: number, j: number) => {
        // f where the gain crosses `level` between points i and j (log f)
        const a = points[i], b = points[j];
        const t = (level - a.gainDb) / (b.gainDb - a.gainDb);
        return Math.exp(Math.log(a.f) + t * (Math.log(b.f) - Math.log(a.f)));
    };
    let lowCutoff: number | null = null, highCutoff: number | null = null;
    for (let i = peak; i > 0; i--)
        if (points[i - 1].gainDb < level) { lowCutoff = cross(i - 1, i); break; }
    for (let i = peak; i < points.length - 1; i++)
        if (points[i + 1].gainDb < level) { highCutoff = cross(i, i + 1); break; }
    return { peakDb: points[peak].gainDb, peakF: points[peak].f, lowCutoff, highCutoff };
}
