/*
    Copyright (C) 2026 Levantate Labs

    This file is part of the Levantate Labs fork of CircuitJS1, distributed under
    the GNU General Public License, version 2 or (at your option) any later
    version. See COPYING.txt.
*/

// Dot-matrix display: a small screen of tiny LEDs with its own memory, like a
// display module. Put a column on X, a row on Y and the LED's state on D, and
// a rising edge on WR stores it; CLR (high) turns every LED off. LEDs stay as
// they were written, so counters and a ROM can draw text or a logo without the
// fast scanning a bare LED array needs. (0, 0) is the top left.
//
// Pins: Y address on the left, X address along the bottom (both most
// significant bit first; X starts one square in, clear of the corner labels),
// D / WR / CLR on the right.

import { ChipElm, Pin } from "../../ChipElm";
import { StringTokenizer } from "../../StringTokenizer";
import { EditInfo } from "../../EditInfo";
import { Choice } from "../../Choice";
import { Graphics } from "../../Graphics";
import { CircuitXMLSerializer } from "../../CircuitXMLSerializer";
import { CircuitXMLDeserializer } from "../../CircuitXMLDeserializer";
import { parseIntStrict } from "../../NumberParse";
import {
    DotMatrixFrame, MAX_HEIGHT, MAX_WIDTH, MIN_HEIGHT, MIN_WIDTH,
    addressBits, basePitch, chipSize, readAddress,
} from "./dotMatrixFrame";

const COLORS: { name: string; rgb: [number, number, number] }[] = [
    { name: "Red", rgb: [255, 59, 48] },
    { name: "Green", rgb: [52, 230, 110] },
    { name: "Amber", rgb: [255, 176, 32] },
    { name: "Blue", rgb: [64, 156, 255] },
    { name: "White", rgb: [240, 240, 235] },
];

export class DotMatrixElm extends ChipElm {
    // Distinct from every upstream dump code / XML name (fork parts start at 4000).
    static readonly DUMP_TYPE = 4001;
    static readonly XML_TYPE = "LvDotMatrix";

    // "declare": set in setupPins(), which the base constructor calls before
    // field initialisers would run
    declare width: number;
    declare height: number;
    declare color: number;
    declare frame: DotMatrixFrame;
    declare xBits: number;
    declare yBits: number;

    constructor(xx: number, yy: number);
    constructor(xa: number, ya: number, xb: number, yb: number, f: number, st: StringTokenizer);
    constructor(xa: number, ya: number, xb?: number, yb?: number, f?: number, st?: StringTokenizer) {
        if (xb === undefined) {
            super(xa, ya);
        } else {
            super(xa, ya, xb, yb!, f!, st!);
            try {
                this.width = parseIntStrict(st!.nextToken());
                this.height = parseIntStrict(st!.nextToken());
                this.color = parseIntStrict(st!.nextToken());
            } catch (e) {}
            this.resize();
        }
    }

    getDumpType(): number { return DotMatrixElm.DUMP_TYPE; }
    getXmlDumpType(): string { return DotMatrixElm.XML_TYPE; }
    getChipName(): string { return "Dot matrix display"; }

    dumpXml(doc: Document, elem: Element): void {
        super.dumpXml(doc, elem);
        CircuitXMLSerializer.dumpAttr(elem, "w", this.width);
        CircuitXMLSerializer.dumpAttr(elem, "h", this.height);
        CircuitXMLSerializer.dumpAttr(elem, "co", this.color);
    }

    undumpXml(xml: CircuitXMLDeserializer): void {
        super.undumpXml(xml);
        this.width = xml.parseIntAttr("w", this.width);
        this.height = xml.parseIntAttr("h", this.height);
        this.color = xml.parseIntAttr("co", this.color);
        this.resize();
    }

    private clampSize(): void {
        const ok = (v: number, lo: number, hi: number, d: number) =>
            Number.isFinite(v) && v >= lo && v <= hi ? Math.trunc(v) : d;
        this.width = ok(this.width, MIN_WIDTH, MAX_WIDTH, 32);
        this.height = ok(this.height, MIN_HEIGHT, MAX_HEIGHT, 16);
        if (!(this.color >= 0 && this.color < COLORS.length))
            this.color = 0;
    }

    private resize(): void {
        this.setupPins();
        this.setPoints();
    }

    setupPins(): void {
        this.clampSize();
        if (this.frame == null || this.frame.width !== this.width || this.frame.height !== this.height) {
            const next = new DotMatrixFrame(this.width, this.height);
            if (this.frame != null)
                next.copyFrom(this.frame);
            this.frame = next;
        }
        this.xBits = addressBits(this.width);
        this.yBits = addressBits(this.height);
        const size = chipSize(this.width, this.height, this.cspc || 16);
        this.sizeX = size.sizeX;
        this.sizeY = size.sizeY;

        this.pins = new Array(this.getPostCount());
        for (let i = 0; i !== this.xBits; i++)
            this.pins[i] = new Pin(this, i + 1, ChipElm.SIDE_S, "X" + (this.xBits - 1 - i));
        for (let i = 0; i !== this.yBits; i++)
            this.pins[this.xBits + i] = new Pin(this, i, ChipElm.SIDE_W, "Y" + (this.yBits - 1 - i));
        const n = this.xBits + this.yBits;
        this.pins[n] = new Pin(this, 0, ChipElm.SIDE_E, "D");
        this.pins[n + 1] = new Pin(this, 1, ChipElm.SIDE_E, "WR");
        this.pins[n + 1].clock = true;
        this.pins[n + 2] = new Pin(this, 2, ChipElm.SIDE_E, "CLR");
        this.allocNodes();
    }

    getPostCount(): number { return this.xBits + this.yBits + 3; }
    getVoltageSourceCount(): number { return 0; }

    execute(): void {
        const n = this.xBits + this.yBits;
        const wr = this.pins[n + 1].value;
        if (wr && !this.lastClock) {
            const x = readAddress(this.pins.slice(0, this.xBits).map((p) => p.value));
            const y = readAddress(this.pins.slice(this.xBits, n).map((p) => p.value));
            this.frame.write(x, y, this.pins[n].value);
        }
        this.lastClock = wr;
        if (this.pins[n + 2].value)
            this.frame.clear();
    }

    reset(): void {
        super.reset();
        this.frame.clear();
    }

    draw(g: Graphics): void {
        this.drawChip(g);
        this.drawScreen(g);
    }

    private drawScreen(g: Graphics): void {
        const xs = this.rectPointsX, ys = this.rectPointsY;
        const left = Math.min(...xs), right = Math.max(...xs);
        const top = Math.min(...ys), bottom = Math.max(...ys);
        // margins for the pin labels inside the body
        const availW = right - left - 4 * this.cspc;
        const availH = bottom - top - 2.5 * this.cspc;
        const pitch = Math.max(1, Math.min(basePitch(this.width, this.height, this.cspc),
            Math.floor(availW / this.width), Math.floor(availH / this.height)));
        const sw = this.width * pitch, sh = this.height * pitch;
        const sx = Math.round((left + right - sw) / 2);
        const sy = Math.round(top + this.cspc + (availH - sh) / 2);
        const pad = Math.max(2, pitch / 2);

        const ctx = g.context;
        ctx.save();
        ctx.fillStyle = "#16130f";
        ctx.beginPath();
        if (ctx.roundRect)
            ctx.roundRect(sx - pad, sy - pad, sw + 2 * pad, sh + 2 * pad, pad);
        else
            ctx.rect(sx - pad, sy - pad, sw + 2 * pad, sh + 2 * pad);
        ctx.fill();

        const [r, gr, b] = COLORS[this.color].rgb;
        const radius = Math.max(0.5, pitch * 0.38);
        const dots = (on: boolean) => {
            ctx.beginPath();
            for (let y = 0; y !== this.height; y++)
                for (let x = 0; x !== this.width; x++) {
                    if (this.frame.get(x, y) !== on)
                        continue;
                    const cx = sx + x * pitch + pitch / 2, cy = sy + y * pitch + pitch / 2;
                    ctx.moveTo(cx + radius, cy);
                    ctx.arc(cx, cy, radius, 0, Math.PI * 2);
                }
        };
        dots(false);
        ctx.fillStyle = `rgba(${r},${gr},${b},0.13)`;
        ctx.fill();
        dots(true);
        ctx.fillStyle = `rgb(${r},${gr},${b})`;
        ctx.shadowColor = `rgba(${r},${gr},${b},0.8)`;
        ctx.shadowBlur = pitch * 1.5;
        ctx.fill();
        ctx.restore();
    }

    getChipEditInfo(n: number): EditInfo | null {
        if (n === 0)
            return new EditInfo("Width (LEDs)", this.width, MIN_WIDTH, MAX_WIDTH).setDimensionless();
        if (n === 1)
            return new EditInfo("Height (LEDs)", this.height, MIN_HEIGHT, MAX_HEIGHT).setDimensionless();
        if (n === 2) {
            const ei = new EditInfo("LED Colour", 0, -1, -1);
            ei.choice = new Choice();
            for (const c of COLORS)
                ei.choice.add(c.name);
            ei.choice.select(this.color);
            return ei;
        }
        return null;
    }

    setChipEditValue(n: number, ei: EditInfo): void {
        if (n === 0 || n === 1) {
            const [lo, hi] = n === 0 ? [MIN_WIDTH, MAX_WIDTH] : [MIN_HEIGHT, MAX_HEIGHT];
            if (!(ei.value >= lo && ei.value <= hi)) {
                ei.setError(`must be between ${lo} and ${hi}`);
                return;
            }
            if (n === 0) this.width = Math.trunc(ei.value);
            else this.height = Math.trunc(ei.value);
            this.resize();
            return;
        }
        if (n === 2)
            this.color = ei.choice!.getSelectedIndex();
    }
}
