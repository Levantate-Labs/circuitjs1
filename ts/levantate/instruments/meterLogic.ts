/*
    Copyright (C) 2026 Levantate Labs

    This file is part of the Levantate Labs fork of CircuitJS1, distributed under
    the GNU General Public License, version 2 or (at your option) any later
    version. See COPYING.txt.
*/

// The parts of the multimeter (multimeter.ts) that don't touch the page:
// finding what a probe tip touches, resistance between the probes, and how a
// reading is shown.

import { effectiveResistance } from "../faults/faults";

export type MeterMode = "dcv" | "acv" | "dca" | "aca" | "ohm";

export interface PointLike { x: number; y: number; }

// What the circuit offers a probe (CircuitElm satisfies it).
export interface MeterElm {
    x: number; y: number; x2: number; y2: number;
    getPostCount(): number;
    getPost(n: number): PointLike | null;
    getPostVoltage(n: number): number;
    isRemovableWire?(): boolean;
    isWireEquivalent?(): boolean;
    resistance?: number;
}

// A probe touches a part's terminal (elm + post) or a wire anywhere along it
// (any post of the wire: both ends are the same node).
export interface ProbeContact { elm: MeterElm; post: number; at: PointLike; }

const dist2 = (a: PointLike, b: PointLike) => (a.x - b.x) ** 2 + (a.y - b.y) ** 2;
const isWire = (ce: MeterElm) => !!(ce.isRemovableWire?.() || ce.isWireEquivalent?.());

// Nearest thing a probe dropped at `p` would touch, within `reach` (circuit
// units): a terminal first, otherwise the closest point on a wire. Sources
// (`postsOnly`) can only connect at terminals and wire ends: the simulator
// joins parts only where their ends meet.
export function findContact(elms: MeterElm[], p: PointLike, reach: number, postsOnly = false): ProbeContact | null {
    let best: ProbeContact | null = null;
    let bestD = reach * reach;
    for (const ce of elms) {
        for (let i = 0; i < ce.getPostCount(); i++) {
            const q = ce.getPost(i);
            if (q == null)
                continue;
            const d = dist2(p, q);
            // on a tie (a part's end on a wire's end) name the part, not the wire
            const better = best == null ? d <= bestD : d < bestD || (d === bestD && isWire(best.elm) && !isWire(ce));
            if (better) {
                bestD = d;
                best = { elm: ce, post: i, at: { x: q.x, y: q.y } };
            }
        }
    }
    if (best != null || postsOnly)
        return best;
    for (const ce of elms) {
        if (!isWire(ce))
            continue;
        const q = closestOnSegment(p, { x: ce.x, y: ce.y }, { x: ce.x2, y: ce.y2 });
        const d = dist2(p, q);
        if (d <= bestD) {
            bestD = d;
            best = { elm: ce, post: 0, at: q };
        }
    }
    return best;
}

export function closestOnSegment(p: PointLike, a: PointLike, b: PointLike): PointLike {
    const dx = b.x - a.x, dy = b.y - a.y;
    const len2 = dx * dx + dy * dy;
    if (len2 === 0)
        return { x: a.x, y: a.y };
    const t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2));
    return { x: a.x + t * dx, y: a.y + t * dy };
}

// Resistance between the probes, as a lab meter reads one part: the probes on
// the two ends of a part that has a resistance, or on one node (0 Ω).
// NaN when the probes aren't across a single resistive part.
export function resistanceBetween(red: ProbeContact | null, black: ProbeContact | null, sameNode: boolean): number {
    if (red == null || black == null)
        return NaN;
    if (sameNode)
        return 0;
    if (red.elm !== black.elm || red.post === black.post || red.elm.getPostCount() !== 2)
        return NaN;
    const r = effectiveResistance(red.elm);   // a faulty part reads as it is
    return typeof r === "number" && isFinite(r) ? r : NaN;
}

// Averages a signal over one meter refresh, like a bench meter: when the
// signal repeats, over whole cycles only (from one rising edge to a later
// one), so the average and RMS don't depend on where the window happened to
// start or stop. Time-weighted, since simulation steps aren't all equal.
export class CycleWindow {
    private t0 = NaN;
    private lastT = NaN;
    private lastV = NaN;
    private intV = 0;           // ∫v dt since the window opened
    private intV2 = 0;          // ∫v² dt
    private minV = Infinity;
    private maxV = -Infinity;
    private armed = false;
    private edges: { t: number; intV: number; intV2: number }[] = [];
    private stableRef = NaN;    // the value the signal has held since stableSince
    private stableSince = NaN;

    // thresholds for edges: the previous window's range once there is one
    constructor(private range: { min: number; max: number } | null = null) {}

    add(t: number, v: number): void {
        if (!isFinite(v))
            return;
        if (isNaN(this.t0)) {
            this.t0 = this.lastT = t;
            this.lastV = v;
        }
        const dt = t - this.lastT;
        if (dt > 0) {
            this.intV += (v + this.lastV) / 2 * dt;
            this.intV2 += (v * v + this.lastV * this.lastV) / 2 * dt;
        }
        this.lastT = t;
        this.lastV = v;
        if (!(Math.abs(v - this.stableRef) <= Math.max(1e-9, 1e-4 * Math.abs(v)))) {
            this.stableRef = v;
            this.stableSince = t;
        }
        if (v < this.minV) this.minV = v;
        if (v > this.maxV) this.maxV = v;

        const lo = this.range?.min ?? this.minV, hi = this.range?.max ?? this.maxV;
        const span = hi - lo;
        if (span <= 1e-12)
            return;
        const mid = (hi + lo) / 2, hyst = span * 0.1;
        if (v < mid - hyst)
            this.armed = true;
        else if (this.armed && v > mid + hyst) {
            this.armed = false;
            this.edges.push({ t, intV: this.intV, intV2: this.intV2 });
        }
    }

    /** Whole cycles seen so far. */
    get cycles(): number { return Math.max(0, this.edges.length - 1); }

    get duration(): number { return isNaN(this.t0) ? 0 : this.lastT - this.t0; }

    /** The signal hasn't varied (a DC reading needs no whole cycles). */
    get steady(): boolean {
        const span = this.maxV - this.minV;
        return span <= Math.max(1e-9, 1e-3 * Math.max(Math.abs(this.maxV), Math.abs(this.minV)));
    }

    /** The signal changed (a step) and has held still for the latter half of the window. */
    get settled(): boolean {
        return this.edges.length === 0 && this.duration > 0 && this.lastT - this.stableSince >= this.duration / 2;
    }

    /** The value it has settled at. */
    get settledValue(): number { return this.stableRef; }

    get observedRange(): { min: number; max: number } | null {
        return this.maxV >= this.minV ? { min: this.minV, max: this.maxV } : null;
    }

    /** Average and RMS: over whole cycles when there are any, else over the window. */
    result(): { avg: number; rms: number } {
        let iv = this.intV, iv2 = this.intV2, T = this.duration;
        // without a known range the first edge can come early (the range is still
        // growing), so skip it when there are enough later ones
        const first = this.range == null && this.edges.length >= 3 ? 1 : 0;
        if (this.edges.length - first >= 2) {
            const a = this.edges[first], b = this.edges[this.edges.length - 1];
            iv = b.intV - a.intV;
            iv2 = b.intV2 - a.intV2;
            T = b.t - a.t;
        }
        if (!(T > 0))
            return { avg: this.lastV, rms: Math.abs(this.lastV) };
        return { avg: iv / T, rms: Math.sqrt(Math.max(0, iv2 / T)) };
    }
}

const PREFIXES: [number, string][] = [[1e6, "M"], [1e3, "k"], [1, ""], [1e-3, "m"], [1e-6, "µ"], [1e-9, "n"]];

export const MODE_UNIT: Record<MeterMode, string> = { dcv: "V", acv: "V", dca: "A", aca: "A", ohm: "Ω" };

// A meter display: four significant digits, auto-ranged ("4.998 V",
// "12.35 mA"), "OL" past the meter's range and "- - - -" for no reading.
export function formatReading(v: number, mode: MeterMode): { digits: string; unit: string } {
    const unit = MODE_UNIT[mode];
    if (!isFinite(v))
        return { digits: "- - - -", unit };
    const limit = mode === "ohm" ? 100e6 : 10e3;
    if (Math.abs(v) >= limit)
        return { digits: "OL", unit };
    const a = Math.abs(v);
    // below a nanovolt / nanoamp is simulation noise: a meter shows zero
    if (a < 1e-9)
        return { digits: (0).toFixed(3), unit };
    let [scale, prefix] = PREFIXES[PREFIXES.length - 1];
    for (const [s, p] of PREFIXES)
        if (a >= s) {
            scale = s;
            prefix = p;
            break;
        }
    const x = v / scale;
    const ax = Math.abs(x);
    const decimals = ax >= 100 ? 1 : ax >= 10 ? 2 : 3;
    return { digits: x.toFixed(decimals), unit: prefix + unit };
}
