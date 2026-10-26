/*
    Copyright (C) 2026 Levantate Labs

    This file is part of the Levantate Labs fork of CircuitJS1, distributed under
    the GNU General Public License, version 2 or (at your option) any later
    version. See COPYING.txt.
*/

// Grading point (roadmap slice L2): a coral pin with a label that marks where a
// circuit is checked. It only carries an id, a label and a kind; expected values,
// tolerances and marks live in the platform, never in the simulator.
//
// Kinds:
//   node      one terminal on a wire; reads the node voltage
//   waveform  like node, and also records samples for waveform comparison
//   branch    no terminal; its tip points at a part and reads that part's current
//   power     no terminal; its tip points at a part and reads its power
// Pins without a terminal never touch the circuit, so they can't change results.

import { CircuitElm } from "../../CircuitElm";
import { CircuitXMLSerializer } from "../../CircuitXMLSerializer";
import { CircuitXMLDeserializer } from "../../CircuitXMLDeserializer";
import { Choice } from "../../Choice";
import { CustomLogicModel } from "../../CustomLogicModel";
import { EditInfo } from "../../EditInfo";
import { Font } from "../../Font";
import { Graphics } from "../../Graphics";
import { StringTokenizer } from "../../StringTokenizer";
import { Theme } from "../theme";
import { SignalStats, type Measure } from "./signalStats";

export type GradePointKind = "node" | "waveform" | "branch" | "power";

const KINDS: { kind: GradePointKind; label: string; unit: string }[] = [
    { kind: "node",     label: "Node voltage",        unit: "V" },
    { kind: "waveform", label: "Waveform (voltage)",  unit: "V" },
    { kind: "branch",   label: "Current through part", unit: "A" },
    { kind: "power",    label: "Power in part",       unit: "W" },
];

export class GradePointElm extends CircuitElm {
    // Distinct from every upstream dump code / XML name, so circuits with grading
    // points only load in this fork (and never clash with upstream parts).
    static readonly DUMP_TYPE = 4000;
    static readonly XML_TYPE = "LvGradePoint";

    kind!: GradePointKind;
    pointId!: string;
    label!: string;
    // Set by the platform bridge in exam mode (roadmap L3): locked pins can't be
    // moved, edited or deleted. Not saved with the circuit.
    locked = false;

    readonly stats = new SignalStats();
    private target: CircuitElm | null = null;
    private lastStep = -1;

    constructor(xx: number, yy: number);
    constructor(xa: number, ya: number, xb: number, yb: number, f: number, st?: StringTokenizer);
    constructor(xa: number, ya: number, xb?: number, yb?: number, f?: number, st?: StringTokenizer) {
        if (xb === undefined)
            super(xa, ya);
        else
            super(xa, ya, xb, yb!, f!);
        this.kind = "node";
        this.pointId = GradePointElm.newId();
        this.label = "P1";
        if (st != null && st.hasMoreTokens()) {
            // legacy text format: kind id label
            this.kind = GradePointElm.parseKind(st.nextToken());
            if (st.hasMoreTokens()) this.pointId = st.nextToken();
            if (st.hasMoreTokens()) this.label = CustomLogicModel.unescape(st.nextToken());
            this.allocNodes();
        }
    }

    static newId(): string {
        return "gp_" + Math.random().toString(36).slice(2, 10);
    }

    static parseKind(s: string | null | undefined): GradePointKind {
        return KINDS.some((k) => k.kind === s) ? s as GradePointKind : "node";
    }

    static isAttached(kind: GradePointKind | undefined): boolean {
        return kind === "branch" || kind === "power";
    }

    getDumpType(): number { return GradePointElm.DUMP_TYPE; }
    getXmlDumpType(): string { return GradePointElm.XML_TYPE; }
    getClassName(): string { return "GradePointElm"; }

    // (kind is still undefined while the base constructor allocates nodes: one post)
    getPostCount(): number { return GradePointElm.isAttached(this.kind) ? 0 : 1; }

    isGradePointElm(): boolean { return true; }

    reset(): void {
        super.reset();
        this.stats.reset();
        this.lastStep = -1;
    }

    // re-resolve the part an attached pin points at whenever the circuit is restamped
    stamp(): void {
        this.target = GradePointElm.isAttached(this.kind) ? this.findTarget() : null;
    }

    // The part whose body contains the pin's tip (smallest one wins, so a pin on a
    // resistor beats a box drawn around the whole circuit).
    findTarget(): CircuitElm | null {
        const app: any = CircuitElm.app;
        const list: CircuitElm[] = app?.elmList ?? [];
        const px = this.x, py = this.y;
        let best: CircuitElm | null = null;
        let bestArea = Infinity;
        for (const ce of list) {
            if (ce === this || ce.isWireElm() || ce.isGraphicElm() || (ce as any).isGradePointElm?.())
                continue;
            if (ce.getPostCount() < 2)
                continue;
            const bb = ce.getBoundingBox?.() ?? ce.boundingBox;
            if (bb == null)
                continue;
            const pad = 4;
            if (px < bb.x - pad || px > bb.x + bb.width + pad || py < bb.y - pad || py > bb.y + bb.height + pad)
                continue;
            const area = Math.max(1, bb.width) * Math.max(1, bb.height);
            if (area < bestArea) {
                bestArea = area;
                best = ce;
            }
        }
        return best;
    }

    getTarget(): CircuitElm | null { return this.target; }

    // the signal this pin reads right now
    reading(): number {
        switch (this.kind) {
        case "node":
        case "waveform":
            return this.nodes[0].v;
        case "branch":
            return this.target ? this.target.getCurrent() : NaN;
        case "power":
            return this.target ? this.target.getPower() : NaN;
        }
        return NaN;
    }

    stepFinished(): void {
        const sim: any = CircuitElm.sim;
        if (sim.timeStepCount === this.lastStep)
            return;
        this.lastStep = sim.timeStepCount;
        this.stats.add(sim.t, this.reading(), this.kind === "waveform");
    }

    measure(m: Measure): number { return this.stats.measure(m); }

    unit(): string { return KINDS.find((k) => k.kind === this.kind)?.unit ?? ""; }

    // ---- drawing ----

    draw(g: Graphics): void {
        const pal = Theme.palette;
        const selected = this.needsHighlight();
        const pin = selected ? CircuitElm.selectColor.getHexValue() : pal.gradePin;
        const ctx = g.context;
        g.save();

        // stem from the anchor (terminal or tip) to the label
        ctx.lineCap = "round";
        ctx.lineWidth = 2;
        ctx.strokeStyle = pin;
        ctx.setLineDash(GradePointElm.isAttached(this.kind) ? [4, 3] : []);
        ctx.beginPath();
        ctx.moveTo(this.point1.x, this.point1.y);
        ctx.lineTo(this.point2.x, this.point2.y);
        ctx.stroke();
        ctx.setLineDash([]);

        // anchor: a ring for attached pins, the usual post for node pins
        if (GradePointElm.isAttached(this.kind)) {
            ctx.beginPath();
            ctx.arc(this.point1.x, this.point1.y, 4, 0, 2 * Math.PI);
            ctx.fillStyle = pal.background;
            ctx.fill();
            ctx.lineWidth = 2;
            ctx.stroke();
        }

        // label pill at the far end
        const f = new Font("SansSerif", Font.BOLD, 12);
        g.setFont(f);
        const text = this.label;
        const tw = ctx.measureText(text).width;
        const padX = 7, h = 20;
        const w = tw + 2 * padX + 10;   // room for the dot
        let bx = this.point2.x, by = this.point2.y - h / 2;
        if (this.point2.x < this.point1.x) bx -= w;
        else if (this.point2.x === this.point1.x) bx -= w / 2;
        if (this.point2.y < this.point1.y && this.point2.x === this.point1.x) by -= h / 2;
        if (this.point2.y > this.point1.y && this.point2.x === this.point1.x) by += h / 2;

        ctx.beginPath();
        ctx.roundRect(bx, by, w, h, h / 2);
        ctx.fillStyle = pin;
        ctx.fill();
        ctx.beginPath();
        ctx.arc(bx + padX + 2, by + h / 2, 3, 0, 2 * Math.PI);
        ctx.fillStyle = pal.gradePinText;
        ctx.fill();
        ctx.fillStyle = pal.gradePinText;
        ctx.textBaseline = "middle";
        ctx.fillText(text, bx + padX + 10, by + h / 2 + 0.5);
        g.restore();

        this.setBbox(this.point1, this.point2, 2);
        this.adjustBbox(bx, by, bx + w, by + h);
        if (!GradePointElm.isAttached(this.kind))
            this.drawPosts(g);
    }

    // ---- saving ----

    dumpXml(doc: Document, elem: Element): void {
        super.dumpXml(doc, elem);
        CircuitXMLSerializer.dumpAttr(elem, "k", this.kind);
        CircuitXMLSerializer.dumpAttr(elem, "id", this.pointId);
        CircuitXMLSerializer.dumpAttr(elem, "lb", this.label);
    }

    undumpXml(xml: CircuitXMLDeserializer): void {
        super.undumpXml(xml);
        this.kind = GradePointElm.parseKind(xml.parseStringAttr("k", "node"));
        this.pointId = xml.parseStringAttr("id", this.pointId) ?? this.pointId;
        this.label = xml.parseStringAttr("lb", this.label) ?? this.label;
        this.allocNodes();
    }

    // ---- info and editing ----

    getInfo(arr: string[]): void {
        const kind = KINDS.find((k) => k.kind === this.kind)!;
        arr[0] = "Grading point " + this.label;
        arr[1] = kind.label;
        let i = 2;
        if (GradePointElm.isAttached(this.kind)) {
            const t = this.target;
            arr[i++] = t ? "Part: " + t.getClassName().replace(/Elm$/, "") : "Not on a part: move the tip onto one";
        }
        const u = kind.unit;
        const fmt = (v: number, unit: string) => isNaN(v) ? "—" : CircuitElm.getUnitText(v, unit);
        arr[i++] = "Now = " + fmt(this.measure("value"), u);
        arr[i++] = "Avg = " + fmt(this.measure("avg"), u) + ", RMS = " + fmt(this.measure("rms"), u);
        arr[i++] = "Max = " + fmt(this.measure("max"), u) + ", Min = " + fmt(this.measure("min"), u);
        const fq = this.measure("freq");
        if (fq > 0)
            arr[i++] = "Freq = " + CircuitElm.getUnitText(fq, "Hz");
    }

    getEditInfo(n: number): EditInfo | null {
        if (this.locked)
            return null;
        if (n === 0) {
            const ei = new EditInfo("Label", 0, -1, -1);
            ei.text = this.label;
            return ei;
        }
        if (n === 1) {
            const ei = new EditInfo("Measures", 0, -1, -1);
            ei.choice = new Choice();
            for (const k of KINDS)
                ei.choice.add(k.label);
            ei.choice.select(Math.max(0, KINDS.findIndex((k) => k.kind === this.kind)));
            return ei;
        }
        return null;
    }

    setEditValue(n: number, ei: EditInfo): void {
        if (n === 0) {
            const v = (ei.textf ? ei.textf.value : ei.text ?? "").trim();
            this.label = v.length > 0 ? v.slice(0, 24) : this.label;
        }
        if (n === 1) {
            const kind = KINDS[ei.choice.getSelectedIndex()]?.kind ?? "node";
            if (kind !== this.kind) {
                this.kind = kind;
                this.allocNodes();
                this.setPoints();
                this.stats.reset();
                (CircuitElm.app as any)?.needAnalyze?.();
            }
        }
    }
}
