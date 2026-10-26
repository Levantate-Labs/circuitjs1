/*
    Copyright (C) Paul Falstad and Iain Sharp

    This file is part of CircuitJS1.

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
// Modified by Levantate Labs, 2026-10-26: sans-serif maps to the Maestro font.

import { CANVAS_FONT_FAMILY } from "./levantate/fonts";

export class Font {
    static readonly BOLD = 1;

    fontname: string;
    size: number;

    constructor(name: string, style: number, size: number) {
        if (name === "SansSerif" || name === "sans-serif" || name === "normal")
            name = CANVAS_FONT_FAMILY;
        const styleStr = (style & Font.BOLD) !== 0 ? "600 " : "normal ";
        this.fontname = styleStr + size + "px " + name;
        this.size = size;
    }
}
