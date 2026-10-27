/*
    Copyright (C) 2026 Levantate Labs

    This file is part of the Levantate Labs fork of CircuitJS1, distributed under
    the GNU General Public License, version 2 or (at your option) any later
    version. See COPYING.txt.
*/

// Frequency-response grading (roadmap slice L10): an AC analysis of a circuit
// in ngspice, read at a grading point. Used through window.LvGrader.ac() by the
// grading service, like the time-domain runner (runner.ts). Measures:
//   gain_db@<Hz>   gain in dB at a frequency
//   phase@<Hz>     phase in degrees at a frequency
//   peak_db        the highest gain in the sweep
//   peak_f         where it is
//   f3db_low       the −3 dB point below the peak (Hz)
//   f3db_high      the −3 dB point above the peak (Hz)
// The output is the pin's node (relative to a second pin's node, or ground);
// the input is the circuit's AC voltage source (or the `input`-th source).

import { VoltageElm } from "../../VoltageElm";
import { GradePointElm } from "../grading/GradePointElm";
import { AC_LIMITS, runAcSweep } from "../spice/ac";
import { summarize, valueAt } from "../spice/bode";

export interface AcGradeRequest {
    circuit: string;
    out: string;                 // grading point id
    ref?: string | null;         // grading point id, or ground
    input?: number | null;       // which voltage source (in circuit order); default: the AC one
    from: number;
    to: number;
    perDecade?: number;
    measures: string[];
}

export interface AcGradeResult {
    ok: boolean;
    error?: { code: "bad-request" | "bad-circuit" | "no-point" | "no-input" | "spice"; message: string };
    values: Record<string, number | null>;
    unsupported: string[];
    points: { id: string; label: string; kind: string }[];
}

const MEASURE_RE = /^(gain_db@|phase@)(\d+(\.\d+)?(e[+-]?\d+)?)$|^(peak_db|peak_f|f3db_low|f3db_high)$/;

export function validateAcRequest(req: AcGradeRequest): string | null {
    if (typeof req?.circuit !== "string" || req.circuit.trim() === "")
        return "circuit is required";
    if (req.circuit.length > 256 * 1024)
        return "circuit is too large";
    if (typeof req.out !== "string" || req.out === "")
        return "out (a grading point id) is required";
    if (!(req.from >= AC_LIMITS.minF) || !(req.to <= AC_LIMITS.maxF) || !(req.to > req.from))
        return `from/to must be within ${AC_LIMITS.minF}..${AC_LIMITS.maxF} Hz, from < to`;
    if (!Array.isArray(req.measures) || req.measures.length === 0 || req.measures.length > 50)
        return "measures must be a list of 1 to 50";
    for (const m of req.measures)
        if (!MEASURE_RE.test(String(m)))
            return `unknown measure "${m}"`;
    return null;
}

export async function runAcGrading(app: any, req: AcGradeRequest): Promise<AcGradeResult> {
    const fail = (code: NonNullable<AcGradeResult["error"]>["code"], message: string, points: AcGradeResult["points"] = []): AcGradeResult =>
        ({ ok: false, error: { code, message }, values: {}, unsupported: [], points });
    const bad = validateAcRequest(req);
    if (bad)
        return fail("bad-request", bad);

    app.setSimRunning(false);
    try {
        app.loader.readCircuit(req.circuit);
        // analysing and stamping assigns the nodes the netlist uses
        app.sim.analyzeCircuit();
        app.analyzeFlag = false;
        if (app.stopMessage == null)
            app.sim.preStampAndStampCircuit();
    } catch (e) {
        return fail("bad-circuit", "the circuit could not be read: " + e);
    }
    if (app.stopMessage != null)
        return fail("bad-circuit", String(app.stopMessage));

    const pins: GradePointElm[] = app.elmList.filter((e: any) => e instanceof GradePointElm);
    const points = pins.map((p) => ({ id: p.pointId, label: p.label, kind: p.kind }));
    const pin = (id: string) => {
        const found = pins.filter((p) => p.pointId === id);
        return found.length === 1 ? found[0] : null;   // missing or duplicated: no reading
    };
    const out = pin(req.out);
    const ref = req.ref ? pin(req.ref) : null;
    if (out == null || (req.ref && ref == null))
        return fail("no-point", `grading point ${out == null ? req.out : req.ref} isn't in the circuit (or appears twice)`, points);

    const sources: any[] = app.elmList.filter((e: any) => e instanceof VoltageElm && !(e as any).levInstrument);
    const input = req.input != null ? sources[req.input] : sources.find((s: any) => s.waveform !== 0) ?? sources[0];
    if (input == null)
        return fail("no-input", "the circuit has no voltage source to sweep", points);

    try {
        const r = await runAcSweep({
            elms: app.elmList, input, plus: (out as any).nodes[0], minus: ref ? (ref as any).nodes[0] : null,
            fStart: req.from, fStop: req.to, perDecade: req.perDecade ?? 40,
        });
        const s = summarize(r.points);
        const values: Record<string, number | null> = {};
        for (const m of req.measures) {
            let v: number | null = null;
            if (m.startsWith("gain_db@")) v = valueAt(r.points, Number(m.slice(8)), "gainDb");
            else if (m.startsWith("phase@")) v = valueAt(r.points, Number(m.slice(6)), "phaseDeg");
            else if (m === "peak_db") v = s.peakDb;
            else if (m === "peak_f") v = s.peakF;
            else if (m === "f3db_low") v = s.lowCutoff;
            else if (m === "f3db_high") v = s.highCutoff;
            values[m] = v != null && isFinite(v) ? v : null;
        }
        return { ok: true, values, unsupported: r.unsupported, points };
    } catch (e) {
        return fail("spice", (e as Error).message, points);
    }
}
