/*
    Copyright (C) 2026 Levantate Labs

    This file is part of the Levantate Labs fork of CircuitJS1, distributed under
    the GNU General Public License, version 2 or (at your option) any later
    version. See COPYING.txt.
*/

// AC analysis (roadmap slice L10): sweeps the frequency of one voltage source
// ("AC 1") in ngspice and returns the response between two nodes, as gain and
// phase. Nonlinear parts are linearised at the circuit's DC operating point,
// as SPICE does.

import { bodePoints, type BodePoint } from "./bode";
import { runSpice, type Complex } from "./engine";
import { buildNetlist } from "./netlist";

export interface AcSweep {
    elms: any[];
    input: any;          // the voltage source to drive
    plus: any;           // output node (circuit node object)
    minus: any;          // reference node (null = ground)
    fStart: number;
    fStop: number;
    perDecade?: number;
}

export interface AcResult {
    points: BodePoint[];
    netlist: string;
    unsupported: string[];
}

export const AC_LIMITS = { minF: 1e-3, maxF: 1e9, maxPerDecade: 100 };

export async function runAcSweep(s: AcSweep): Promise<AcResult> {
    const f0 = Math.max(AC_LIMITS.minF, s.fStart), f1 = Math.min(AC_LIMITS.maxF, s.fStop);
    if (!(f1 > f0))
        throw new Error("the stop frequency must be above the start frequency");
    const ppd = Math.max(1, Math.min(AC_LIMITS.maxPerDecade, Math.round(s.perDecade ?? 20)));
    const nl = buildNetlist(s.elms, { acInput: s.input, analysis: [`.ac dec ${ppd} ${f0} ${f1}`] });
    if (!nl.sources.includes(s.input))
        throw new Error("the input source isn't in the circuit");
    const r = await runSpice(nl.text);
    const freq = (r.vectors.get("frequency") ?? []).map((v) => (typeof v === "number" ? v : v.real));
    const vec = (node: any): Complex[] | null => {
        const name = nl.nodeName(node);
        if (name === "0")
            return null;
        const v = r.vectors.get(`v(${name})`) ?? r.vectors.get(name);
        if (v == null)
            throw new Error(`no result for node ${name}`);
        return v as Complex[];
    };
    return { points: bodePoints(freq, vec(s.plus), vec(s.minus)), netlist: nl.text, unsupported: nl.unsupported };
}
