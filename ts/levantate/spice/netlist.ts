/*
    Copyright (C) 2026 Levantate Labs

    This file is part of the Levantate Labs fork of CircuitJS1, distributed under
    the GNU General Public License, version 2 or (at your option) any later
    version. See COPYING.txt.
*/

// SPICE netlist export (roadmap slice L10). Writes the circuit as an ngspice
// netlist using the simulator's own solved nodes (after analyzeCircuit, wires
// and labels have already merged the points they join), so the netlist only
// lists real parts. Parts SPICE can't express are listed as comments and in
// `unsupported`.
//
// One voltage source can be marked as the input for an AC analysis ("AC 1"),
// so a sweep's output voltages are directly the circuit's gain.

export interface NetlistOptions {
    title?: string;
    /** the source to drive with "AC 1" for an AC analysis */
    acInput?: any;
    /** analysis lines to append (e.g. ".ac dec 20 1 1meg") */
    analysis?: string[];
}

export interface Netlist {
    text: string;
    /** circuit node object -> SPICE node name ("0" is ground) */
    nodeName: (node: any) => string;
    unsupported: string[];
    /** the voltage sources, for choosing an AC input */
    sources: any[];
}

import { CircuitNode } from "../../CircuitNode";
import { OPEN_OHMS, SHORT_OHMS, sealOf } from "../faults/faults";

// waveform numbers of VoltageElm
const WF = { DC: 0, AC: 1, SQUARE: 2, TRIANGLE: 3, SAWTOOTH: 4, PULSE: 5, NOISE: 6, VAR: 7 };

// parts that carry no SPICE meaning (drawn, measured or already merged)
const SKIP = new Set([
    "WireElm", "GroundElm", "LabeledNodeElm", "TextElm", "BoxElm", "LineElm", "GraphicElm",
    "ScopeElm", "ProbeElm", "OutputElm", "GradePointElm", "TestPointElm", "StopTriggerElm",
    "DataRecorderElm", "AudioOutputElm",
]);

export function num(v: number): string {
    if (!isFinite(v))
        return "0";
    return Number(v.toPrecision(9)).toString();
}

export function buildNetlist(elms: any[], opts: NetlistOptions = {}): Netlist {
    const names = new Map<any, string>();
    let nextNode = 1;
    const nodeName = (n: any): string => {
        if (n == null || n === CircuitNode.ground)
            return "0";
        let s = names.get(n);
        if (s == null) {
            s = "n" + nextNode++;
            names.set(n, s);
        }
        return s;
    };

    const lines: string[] = [];
    const models: string[] = [];
    const unsupported: string[] = [];
    const sources: any[] = [];
    const count: Record<string, number> = {};
    const id = (prefix: string) => prefix + (count[prefix] = (count[prefix] ?? 0) + 1);
    const N = (ce: any, i: number) => nodeName(ce.nodes?.[i]);

    for (const ce of elms) {
        const cls: string = ce.constructor?.name ?? "";
        if (SKIP.has(cls) || ce.isWireEquivalent?.() || ce.isRemovableWire?.())
            continue;
        const type = cls.replace(/Elm$/, "");
        // a faulty part (levantate/faults): open and short are resistors,
        // reversed is the part with its two posts swapped
        const fault = sealOf(ce)?.fault;
        if (fault === "open" || fault === "short") {
            lines.push(`${id("R")} ${N(ce, 0)} ${N(ce, 1)} ${num(fault === "open" ? OPEN_OHMS : SHORT_OHMS)}`);
            continue;
        }
        const NP: NodeOf = fault === "reversed" ? (c, i) => N(c, i === 0 ? 1 : i === 1 ? 0 : i) : N;
        try {
            const line = exportPart(ce, cls, NP, id, models, sources, opts.acInput);
            if (line == null) {
                unsupported.push(type);
                lines.push(`* not exported: ${type}`);
            } else
                lines.push(...line);
        } catch (e) {
            unsupported.push(type);
            lines.push(`* not exported: ${type} (${String(e).slice(0, 60)})`);
        }
    }

    const text = [
        `* ${opts.title ?? "Maestro Simulation Lab circuit"}`,
        ...lines,
        ...models,
        ".option noacct",
        ...(opts.analysis ?? []),
        ".end",
    ].join("\n") + "\n";
    return { text, nodeName, unsupported: [...new Set(unsupported)], sources };
}

type NodeOf = (ce: any, i: number) => string;

function exportPart(ce: any, cls: string, N: NodeOf, id: (p: string) => string, models: string[],
                    sources: any[], acInput: any): string[] | null {
    switch (cls) {
    case "ResistorElm":
        return [`${id("R")} ${N(ce, 0)} ${N(ce, 1)} ${num(ce.resistance)}`];
    case "CapacitorElm":
    case "PolarCapacitorElm":
        return [`${id("C")} ${N(ce, 0)} ${N(ce, 1)} ${num(ce.capacitance)}`];
    case "InductorElm":
        return [`${id("L")} ${N(ce, 0)} ${N(ce, 1)} ${num(ce.inductance)}`];
    case "PotElm": {
        // posts: 0 and 1 the ends, 2 the wiper; position 0..1 from end 0
        const r = ce.maxResistance ?? ce.resistance, p = Math.min(0.999, Math.max(0.001, ce.position ?? 0.5));
        return [`${id("R")} ${N(ce, 0)} ${N(ce, 2)} ${num(r * p)}`, `${id("R")} ${N(ce, 2)} ${N(ce, 1)} ${num(r * (1 - p))}`];
    }
    case "SwitchElm":
    case "PushSwitchElm": {
        if (ce.position !== 0)   // open
            return [`* open switch`];
        return [`${id("R")} ${N(ce, 0)} ${N(ce, 1)} 1m`];
    }
    case "AmmeterElm":
        return [`${id("V")} ${N(ce, 0)} ${N(ce, 1)} 0`];
    case "VoltageElm":
    case "DCVoltageElm":
    case "ACVoltageElm":
    case "RailElm":
    case "VarRailElm":
    case "ACRailElm":
    case "SquareRailElm":
    case "ClockElm":
        return voltageSource(ce, N, id, sources, acInput);
    case "CurrentElm":
    case "PsuSourceElm":
        if (cls === "PsuSourceElm" || ce.maxVoltage > 0)
            // a bench supply / compliance-limited source: for an operating point
            // and small-signal analysis it is the voltage it holds
            return [`${id("V")} ${N(ce, 1)} ${N(ce, 0)} DC ${num(ce.maxVoltage)}`];
        return [`${id("I")} ${N(ce, 0)} ${N(ce, 1)} DC ${num(ce.currentValue)}`];
    case "DiodeElm":
    case "LEDElm":
    case "ZenerElm": {
        const m = ce.model ?? {};
        const name = id("DMOD");
        const params = [`IS=${num(m.saturationCurrent ?? 1e-14)}`, `N=${num(m.emissionCoefficient ?? 1)}`];
        if (m.seriesResistance > 0) params.push(`RS=${num(m.seriesResistance)}`);
        if (m.breakdownVoltage > 0) params.push(`BV=${num(m.breakdownVoltage)}`);
        models.push(`.model ${name} D(${params.join(" ")})`);
        return [`${id("D")} ${N(ce, 0)} ${N(ce, 1)} ${name}`];
    }
    case "TransistorElm":
    case "NTransistorElm":
    case "PTransistorElm": {
        const m = ce.model ?? {};
        const name = id("QMOD");
        const p = [`IS=${num(m.satCur ?? 1e-13)}`, `BF=${num(ce.beta ?? 100)}`, `BR=${num(m.betaR ?? 1)}`,
                   `NF=${num(m.emissionCoeffF ?? 1)}`, `NR=${num(m.emissionCoeffR ?? 1)}`];
        if (m.invEarlyVoltF > 0) p.push(`VAF=${num(1 / m.invEarlyVoltF)}`);
        if (m.invEarlyVoltR > 0) p.push(`VAR=${num(1 / m.invEarlyVoltR)}`);
        if (m.junctionCapBE > 0) p.push(`CJE=${num(m.junctionCapBE)}`, `VJE=${num(m.junctionPotBE)}`, `MJE=${num(m.junctionExpBE)}`);
        if (m.junctionCapBC > 0) p.push(`CJC=${num(m.junctionCapBC)}`, `VJC=${num(m.junctionPotBC)}`, `MJC=${num(m.junctionExpBC)}`);
        if (m.transitTimeF > 0) p.push(`TF=${num(m.transitTimeF)}`);
        models.push(`.model ${name} ${ce.pnp === -1 ? "PNP" : "NPN"}(${p.join(" ")})`);
        // posts: 0 base, 1 collector, 2 emitter; SPICE: C B E
        return [`${id("Q")} ${N(ce, 1)} ${N(ce, 0)} ${N(ce, 2)} ${name}`];
    }
    case "MosfetElm":
    case "NMosfetElm":
    case "PMosfetElm": {
        const m = ce.model ?? {};
        const name = id("MMOD");
        const pmos = ce.pnp === -1;
        const vt = Math.abs(m.threshold ?? ce.vt ?? 1.5);
        const p = [`VTO=${num(pmos ? -vt : vt)}`, `KP=${num(m.beta ?? ce.beta ?? 0.02)}`];
        if (m.lambda > 0) p.push(`LAMBDA=${num(m.lambda)}`);
        models.push(`.model ${name} ${pmos ? "PMOS" : "NMOS"}(LEVEL=1 ${p.join(" ")})`);
        // posts: 0 gate, 1 source, 2 drain (3 body when shown); SPICE: D G S B
        const body = ce.getPostCount() > 3 ? N(ce, 3) : N(ce, 1);
        return [`${id("M")} ${N(ce, 2)} ${N(ce, 0)} ${N(ce, 1)} ${body} ${name} W=1 L=1`];
    }
    case "OpAmpElm":
    case "OpAmpSwapElm": {
        // posts: 0 inverting, 1 non-inverting, 2 output; the simulator's model is a
        // high-gain amplifier clamped to its rails
        const g = num(ce.gain ?? 100000), hi = num(ce.maxOut ?? 15), lo = num(ce.minOut ?? -15);
        return [`${id("B")} ${N(ce, 2)} 0 V=max(min(${g}*(v(${N(ce, 1)})-v(${N(ce, 0)})),${hi}),${lo})`];
    }
    }
    return null;
}

function voltageSource(ce: any, N: NodeOf, id: (p: string) => string, sources: any[], acInput: any): string[] {
    sources.push(ce);
    const oneTerminal = ce.getPostCount() === 1;
    // VoltageElm: V(post 1) - V(post 0) = v; with an internal resistance the
    // source sits between post 0 and an internal node, the resistor after it
    const hasR = ce.internalResistance > 0 && !oneTerminal;
    const plus = oneTerminal ? N(ce, 0) : hasR ? N(ce, 2) : N(ce, 1);
    const minus = oneTerminal ? "0" : N(ce, 0);
    const amp = ce.maxVoltage ?? 0, bias = ce.bias ?? 0, f = ce.frequency ?? 0;
    let spec: string;
    switch (ce.waveform) {
    case WF.AC: {
        const phaseDeg = ((ce.phaseShift ?? 0) * 180) / Math.PI;
        spec = `DC ${num(bias)} SIN(${num(bias)} ${num(amp)} ${num(f)} 0 0 ${num(phaseDeg)})`;
        break;
    }
    case WF.SQUARE:
    case WF.PULSE: {
        const per = f > 0 ? 1 / f : 1, duty = ce.dutyCycle ?? 0.5, edge = per * 1e-4;
        const lo = ce.waveform === WF.PULSE ? bias : bias - amp;
        spec = `DC ${num(lo)} PULSE(${num(lo)} ${num(bias + amp)} 0 ${num(edge)} ${num(edge)} ${num(per * duty)} ${num(per)})`;
        break;
    }
    case WF.TRIANGLE: {
        const per = f > 0 ? 1 / f : 1;
        spec = `DC ${num(bias)} PULSE(${num(bias - amp)} ${num(bias + amp)} 0 ${num(per / 2)} ${num(per / 2)} 1e-12 ${num(per)})`;
        break;
    }
    case WF.SAWTOOTH: {
        const per = f > 0 ? 1 / f : 1;
        spec = `DC ${num(bias - amp)} PULSE(${num(bias - amp)} ${num(bias + amp)} 0 ${num(per)} 1e-12 0 ${num(per)})`;
        break;
    }
    default:   // DC, and noise / variable sources at their mean
        spec = `DC ${num(ce.waveform === WF.DC ? amp + bias : bias)}`;
    }
    if (ce === acInput)
        spec += " AC 1";
    const out = [`${id("V")} ${plus} ${minus} ${spec}`];
    if (hasR)
        out.push(`${id("R")} ${N(ce, 2)} ${N(ce, 1)} ${num(ce.internalResistance)}`);
    return out;
}
