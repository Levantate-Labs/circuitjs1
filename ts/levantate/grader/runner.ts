/*
    Copyright (C) 2026 Levantate Labs

    This file is part of the Levantate Labs fork of CircuitJS1, distributed under
    the GNU General Public License, version 2 or (at your option) any later
    version. See COPYING.txt.
*/

// Grading runner (roadmap slice L6): runs a circuit for a fixed amount of
// simulated time and reads its grading points, the same way every time.
//
// The live simulator advances in real time (as many steps as fit in each
// animation frame), so two runs never measure exactly the same window. Here
// the clock is faked so every call into the simulation loop advances exactly
// one time step, and we step until the simulated time is reached:
//   load circuit -> step to `settle` -> reset statistics -> step through
//   `window` -> measure.
// It only measures; expected values and marks stay with the host.
//
// Installed only when the page is opened with ?grader=1 (window.LvGrader), and
// used by the grading service in ts/grader/.

import { GradePointElm } from "../grading/GradePointElm";
import { MEASURES, type Measure } from "../grading/signalStats";

export interface GradeRequest {
    circuit: string;
    settle: number;           // simulated seconds before measuring
    window: number;           // simulated seconds measured
    points: { id: string; measure: string }[];
}

export interface GradeResult {
    ok: boolean;
    error?: { code: "bad-circuit" | "sim-stopped" | "too-slow" | "bad-request"; message: string };
    values: Record<string, Record<string, number | null>>;
    simTime: number;
    steps: number;
    points: { id: string; label: string; kind: string }[];
}

export const LIMITS = {
    maxCircuitChars: 256 * 1024,
    maxSimSeconds: 10,
    maxSteps: 4_000_000,
    maxWallMs: 30_000,
    maxPoints: 200,
};

export function validateRequest(req: GradeRequest): string | null {
    if (typeof req?.circuit !== "string" || req.circuit.trim() === "")
        return "circuit is required";
    if (req.circuit.length > LIMITS.maxCircuitChars)
        return "circuit is too large";
    for (const k of ["settle", "window"] as const)
        if (typeof req[k] !== "number" || !isFinite(req[k]) || req[k] < 0)
            return k + " must be a non-negative number of seconds";
    if (req.window <= 0)
        return "window must be more than 0";
    if (req.settle + req.window > LIMITS.maxSimSeconds)
        return "settle + window is more than " + LIMITS.maxSimSeconds + " s";
    if (!Array.isArray(req.points) || req.points.length > LIMITS.maxPoints)
        return "points must be a list of at most " + LIMITS.maxPoints;
    return null;
}

// Runs one grading request against the app. The page is reloaded between
// requests by the service, so state from one circuit never leaks into the next.
export function runGrading(app: any, req: GradeRequest): GradeResult {
    const empty = (error: GradeResult["error"]): GradeResult =>
        ({ ok: false, error, values: {}, simTime: 0, steps: 0, points: [] });
    const bad = validateRequest(req);
    if (bad)
        return empty({ code: "bad-request", message: bad });

    // no live stepping while we drive the simulation ourselves
    app.setSimRunning(false);
    try {
        app.loader.readCircuit(req.circuit);
    } catch (e) {
        return empty({ code: "bad-circuit", message: "the circuit could not be read: " + e });
    }
    app.stopMessage = null;
    app.sim.resetTime?.();
    // a saved speed of 0 would mean "never step"; speed only scales real time,
    // which the fake clock below replaces, so any non-zero value will do
    if (app.getIterCount() <= 0)
        app.ui.speedBar.setValue(117);
    app.simRunning = true;   // runCircuit() stops early when not running

    const realNow = Date.now;
    let fake = 1;
    // each call sees 10^6 ms pass, so the loop never skips a frame for being
    // early, and the frame budget is always spent after one step
    Date.now = () => (fake += 1e6);
    app.ui.lastFrameTime = -1e15;
    const wallStart = performance.now();
    let steps = 0;
    let error: GradeResult["error"];

    const stepUntil = (target: number): boolean => {
        while (app.sim.t < target) {
            if (app.analyzeFlag || app.dcAnalysisFlag) {
                app.sim.analyzeCircuit();
                app.analyzeFlag = false;
            }
            if (app.stopMessage == null && app.sim.needsStamp)
                app.sim.preStampAndStampCircuit();
            if (app.stopMessage != null) {
                error = { code: "sim-stopped", message: String(app.stopMessage) };
                return false;
            }
            const before = app.sim.t;
            app.sim.runCircuit(false);
            if (app.stopMessage != null) {
                error = { code: "sim-stopped", message: String(app.stopMessage) };
                return false;
            }
            if (app.sim.t === before && app.sim.matrices == null) {
                // nothing to simulate (an empty circuit): time can't advance
                return true;
            }
            if (++steps > LIMITS.maxSteps || performance.now() - wallStart > LIMITS.maxWallMs) {
                error = { code: "too-slow", message: "the circuit took too long to simulate" };
                return false;
            }
        }
        return true;
    };

    const pins = (): GradePointElm[] => app.elmList.filter((e: any) => e instanceof GradePointElm);
    let values: GradeResult["values"] = {};
    try {
        app.analyzeFlag = true;
        if (stepUntil(req.settle)) {
            for (const p of pins())
                p.stats.reset();
            if (stepUntil(req.settle + req.window))
                values = measure(pins(), req.points);
        }
    } finally {
        Date.now = realNow;
        app.simRunning = false;
    }
    return {
        ok: error == null,
        error,
        values,
        simTime: app.sim.t,
        steps,
        points: pins().map((p) => ({ id: p.pointId, label: p.label, kind: p.kind })),
    };
}

export function measure(pins: GradePointElm[], points: { id: string; measure: string }[]): GradeResult["values"] {
    const byId = new Map(pins.map((p) => [p.pointId, p]));
    const out: GradeResult["values"] = {};
    for (const req of points) {
        const id = String(req?.id ?? "");
        const m = String(req?.measure ?? "value");
        const pin = byId.get(id);
        const v = pin && (MEASURES as readonly string[]).includes(m) ? pin.measure(m as Measure) : NaN;
        (out[id] ??= {})[m] = isFinite(v) ? v : null;
    }
    return out;
}

export function installGrader(app: any): void {
    (window as any).LvGrader = {
        version: 1,
        run: (req: GradeRequest) => runGrading(app, req),
    };
}
