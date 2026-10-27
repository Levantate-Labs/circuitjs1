/*
    Copyright (C) 2026 Levantate Labs

    This file is part of the Levantate Labs fork of CircuitJS1, distributed under
    the GNU General Public License, version 2 or (at your option) any later
    version. See COPYING.txt.
*/

// ngspice in the browser (roadmap slice L10), through eecircuit-engine
// (MIT; ngspice is BSD-licensed) compiled to WebAssembly. It is about 20 MB
// (5.7 MB compressed), so it isn't part of the app bundle: the build copies it
// next to the app (vite.config.ts, circuitjs/spice/) and it is loaded the
// first time an analysis needs it. Runs are queued: the engine does one at a
// time.

export interface Complex { real: number; img: number; }

export interface SpiceResult {
    names: string[];                                      // lower-case vector names
    vectors: Map<string, (number | Complex)[]>;
    complex: boolean;
}

let engine: Promise<any> | null = null;
let queue: Promise<unknown> = Promise.resolve();

export function engineUrl(): string {
    if ((import.meta as any).env?.DEV)
        return "/node_modules/eecircuit-engine/dist/eecircuit-engine.mjs";
    return new URL("circuitjs/spice/eecircuit-engine.mjs", document.baseURI).href;
}

export function engineLoaded(): boolean { return engine != null; }

function loadEngine(): Promise<any> {
    if (engine == null) {
        engine = (async () => {
            const mod = await import(/* @vite-ignore */ engineUrl());
            const sim = new mod.Simulation();
            await sim.start();
            return sim;
        })();
        engine.catch(() => { engine = null; });   // let a later try load it again
    }
    return engine;
}

/** Runs a netlist; resolves with every output vector. */
export function runSpice(netlist: string): Promise<SpiceResult> {
    const run: Promise<SpiceResult> = queue.then(async (): Promise<SpiceResult> => {
        const sim = await loadEngine();
        sim.setNetList(netlist);
        const r = await sim.runSim();
        const errors: string[] = sim.getError?.() ?? [];
        if (!r || !Array.isArray(r.data) || r.data.length === 0)
            throw new Error(errors.join("; ") || "the simulation produced no results");
        const vectors = new Map<string, (number | Complex)[]>();
        for (const d of r.data)
            vectors.set(String(d.name).toLowerCase(), d.values);
        return { names: [...vectors.keys()], vectors, complex: r.dataType === "complex" } as SpiceResult;
    });
    queue = run.catch((): undefined => undefined);
    return run;
}
