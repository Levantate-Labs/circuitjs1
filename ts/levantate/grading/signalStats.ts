/*
    Copyright (C) 2026 Levantate Labs

    This file is part of the Levantate Labs fork of CircuitJS1, distributed under
    the GNU General Public License, version 2 or (at your option) any later
    version. See COPYING.txt.
*/

// Running statistics of one signal (a node voltage, a part's current or power),
// fed one sample per simulation step. Everything is measured since the last
// reset(), so a grader can let the circuit settle, reset, run for a window and
// then read the values.

export const MEASURES = ["value", "avg", "rms", "max", "min", "p2p", "freq", "period"] as const;
export type Measure = typeof MEASURES[number];

export interface Sample { t: number; v: number; }

export class SignalStats {
    // cap on recorded samples for waveform comparison; older ones are thinned out
    static readonly MAX_SAMPLES = 4096;

    private last = 0;
    private count = 0;
    private sum = 0;
    private sumSq = 0;
    private maxV = -Infinity;
    private minV = Infinity;

    // frequency: rising crossings of the midpoint between max and min, with hysteresis
    private armed = false;
    private firstRise = -1;
    private lastRise = -1;
    private rises = 0;

    private samples: Sample[] = [];
    private sampleStride = 1;    // keep every n-th sample once the buffer has been thinned
    private sampleSkip = 0;

    reset(): void {
        this.last = 0;
        this.count = 0;
        this.sum = this.sumSq = 0;
        this.maxV = -Infinity;
        this.minV = Infinity;
        this.armed = false;
        this.firstRise = this.lastRise = -1;
        this.rises = 0;
        this.samples = [];
        this.sampleStride = 1;
        this.sampleSkip = 0;
    }

    add(t: number, v: number, recordSamples: boolean = false): void {
        if (!isFinite(v))
            return;
        this.last = v;
        this.count++;
        this.sum += v;
        this.sumSq += v * v;
        if (v > this.maxV) this.maxV = v;
        if (v < this.minV) this.minV = v;

        const span = this.maxV - this.minV;
        if (span > 1e-9) {
            const mid = (this.maxV + this.minV) / 2;
            const hyst = span * 0.1;
            if (v < mid - hyst)
                this.armed = true;
            else if (this.armed && v > mid + hyst) {
                this.armed = false;
                if (this.firstRise < 0)
                    this.firstRise = t;
                this.lastRise = t;
                this.rises++;
            }
        }

        if (recordSamples) {
            if (this.sampleSkip++ % this.sampleStride === 0)
                this.samples.push({ t, v });
            if (this.samples.length > SignalStats.MAX_SAMPLES) {
                // thin out: keep every other sample and halve the rate from now on
                this.samples = this.samples.filter((_, i) => i % 2 === 0);
                this.sampleStride *= 2;
            }
        }
    }

    get sampleCount(): number { return this.count; }

    measure(m: Measure): number {
        if (this.count === 0)
            return NaN;
        switch (m) {
        case "value":  return this.last;
        case "avg":    return this.sum / this.count;
        case "rms":    return Math.sqrt(Math.max(0, this.sumSq / this.count));
        case "max":    return this.maxV;
        case "min":    return this.minV;
        case "p2p":    return this.maxV - this.minV;
        case "freq":   return this.frequency();
        case "period": { const f = this.frequency(); return f > 0 ? 1 / f : NaN; }
        }
        return NaN;
    }

    private frequency(): number {
        // needs at least two rising edges to know a period
        if (this.rises < 2 || this.lastRise <= this.firstRise)
            return 0;
        return (this.rises - 1) / (this.lastRise - this.firstRise);
    }

    // Recorded samples, thinned to at most maxPoints.
    getSamples(maxPoints: number = 1024): Sample[] {
        if (this.samples.length <= maxPoints)
            return this.samples.slice();
        const step = this.samples.length / maxPoints;
        const out: Sample[] = [];
        for (let i = 0; i < maxPoints; i++)
            out.push(this.samples[Math.floor(i * step)]);
        return out;
    }
}
