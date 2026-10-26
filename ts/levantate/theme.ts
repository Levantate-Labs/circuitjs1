/*
    Copyright (C) 2026 Levantate Labs

    This file is part of the Levantate Labs fork of CircuitJS1.

    CircuitJS1 is free software: you can redistribute it and/or modify
    it under the terms of the GNU General Public License as published by
    the Free Software Foundation, either version 2 of the License, or
    (at your option) any later version.

    CircuitJS1 is distributed in the hope that it will be useful,
    but WITHOUT ANY WARRANTY; without even the implied warranty of
    MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
    GNU General Public License for more details.

    You should have received a copy of the GNU General Public License
    along with CircuitJS1.  If not, see <http://www.gnu.org/licenses/>.
*/

// Maestro canvas palettes. The DOM chrome reads the same values as CSS custom
// properties (levantate/maestro.css); the canvas can't, so they live here too.
// "Light" is upstream's "White Background" (printable) option.

import { Color } from "../Color";
import { CircuitElm } from "../CircuitElm";

export interface CanvasPalette {
    background: string;    // circuit canvas
    ink: string;           // element bodies, labels (upstream whiteColor)
    inkMuted: string;      // secondary strokes (upstream lightGrayColor)
    select: string;
    positive: string;      // wire colour at +V
    negative: string;      // wire colour at -V
    neutral: string;       // wire colour at 0 V
    current: string;       // moving current dots
    bottomArea: string;    // strip behind docked scopes / info text
    infoText: string;
    scopeBg: string;
    scopeBorder: string;
    gridMinor: string;
    gridMajor: string;
    canvasDot: string;     // dot grid on the circuit canvas
    gradePin: string;      // grading point pins
    gradePinText: string;
    guide: string;         // alignment guides and drag readout
    guideText: string;
    minimapBg: string;
    minimapInk: string;
    traceVoltage: string;
    traceCurrent: string;
    traceOther: string;
    traceSeries: string[]; // extra plots on one scope
    fft: string;
    fftDim: string;
}

export const MAESTRO_LIGHT: CanvasPalette = {
    background: "#f6f4f1",
    ink: "#3d3d3d",
    inkMuted: "#7a7a7a",
    select: "#005596",
    positive: "#104e64",
    negative: "#f95c4b",
    neutral: "#8f8a7e",
    current: "#fe9a00",
    bottomArea: "#efece6",
    infoText: "#484b52",
    scopeBg: "#ffffff",
    scopeBorder: "#e4ded2",
    gridMinor: "#efece6",
    gridMajor: "#d6cfc0",
    canvasDot: "#c9c1b1",
    gradePin: "#f95c4b",
    gradePinText: "#ffffff",
    guide: "#d6338f",
    guideText: "#ffffff",
    minimapBg: "#ffffff",
    minimapInk: "#7a7a7a",
    traceVoltage: "#104e64",
    traceCurrent: "#f95c4b",
    traceOther: "#3d3d3d",
    traceSeries: ["#104e64", "#f95c4b", "#fe9a00", "#005596",
                  "#009689", "#103164", "#d80f00", "#7a7a7a"],
    fft: "#f95c4b",
    fftDim: "#f6c3bc",
};

export const MAESTRO_DARK: CanvasPalette = {
    background: "#0d0d0d",
    ink: "#d4d0c8",
    inkMuted: "#8f8a7e",
    select: "#6f97b3",
    positive: "#4a93ad",
    negative: "#ff5a4a",
    neutral: "#6c685e",
    current: "#ffaa2b",
    bottomArea: "#14130f",
    infoText: "#c0bcb2",
    scopeBg: "#1d1b16",
    scopeBorder: "#2e2a22",
    gridMinor: "#25221c",
    gridMajor: "#3d382e",
    canvasDot: "#3a352c",
    gradePin: "#ff5a4a",
    gradePinText: "#14130f",
    guide: "#f06fb5",
    guideText: "#14130f",
    minimapBg: "#1d1b16",
    minimapInk: "#8f8a7e",
    traceVoltage: "#4a93ad",
    traceCurrent: "#ff5a4a",
    traceOther: "#d4d0c8",
    traceSeries: ["#4a93ad", "#ff5a4a", "#ffaa2b", "#6f97b3",
                  "#2dab9c", "#a8c5da", "#ff8273", "#8f8a7e"],
    fft: "#ff5a4a",
    fftDim: "#5a2a24",
};

// Colours for DOM-hosted controls that draw on their own small canvases (sliders).
export interface ChromePalette {
    textMuted: string;
    border: string;
    borderStrong: string;
    track: string;
    accent: string;
    thumb: string;
}

const CHROME_LIGHT: ChromePalette = {
    textMuted: "#7a7a7a",
    border: "#e4ded2",
    borderStrong: "#d6cfc0",
    track: "#e4ded2",
    accent: "#f95c4b",
    thumb: "#ffffff",
};

const CHROME_DARK: ChromePalette = {
    textMuted: "#8f8a7e",
    border: "#2e2a22",
    borderStrong: "#3d382e",
    track: "#2e2a22",
    accent: "#ff5a4a",
    thumb: "#1d1b16",
};

// colours set explicitly by URL parameter or local storage win over the theme
const overridden = new Set<string>();

export const Theme = {
    light: true,

    get palette(): CanvasPalette {
        return this.light ? MAESTRO_LIGHT : MAESTRO_DARK;
    },

    get chrome(): ChromePalette {
        return this.light ? CHROME_LIGHT : CHROME_DARK;
    },

    markOverridden(name: "positive" | "negative" | "neutral" | "select" | "current"): void {
        overridden.add(name);
    },

    // Push the palette into CircuitElm's shared colours. Called every frame from
    // UIManager.updateCircuit(), so toggling the theme takes effect at once; it only
    // does work when the theme actually changed (or force is set).
    applied: null as boolean | null,

    apply(light: boolean, force: boolean = false): void {
        if (!force && this.applied === light)
            return;
        this.applied = this.light = light;
        document.documentElement.dataset.theme = light ? "light" : "dark";
        const p = this.palette;
        CircuitElm.whiteColor = new Color(p.ink);
        CircuitElm.lightGrayColor = new Color(p.inkMuted);
        if (!overridden.has("positive")) CircuitElm.positiveColor = new Color(p.positive);
        if (!overridden.has("negative")) CircuitElm.negativeColor = new Color(p.negative);
        if (!overridden.has("neutral"))  CircuitElm.neutralColor  = new Color(p.neutral);
        if (!overridden.has("select"))   CircuitElm.selectColor   = new Color(p.select);
        if (!overridden.has("current"))  CircuitElm.currentColor  = new Color(p.current);
        CircuitElm.setColorScale();
    },
};
