/*
    Copyright (C) 2026 Levantate Labs

    This file is part of the Levantate Labs fork of CircuitJS1, distributed under
    the GNU General Public License, version 2 or (at your option) any later
    version. See COPYING.txt.
*/

// The memory and layout behind the dot-matrix display part (DotMatrixElm),
// kept free of the simulator so it can be tested on its own.

export const MIN_WIDTH = 4, MAX_WIDTH = 64;
export const MIN_HEIGHT = 4, MAX_HEIGHT = 32;

/** Address bits needed to reach every column (or row) of `n`. */
export function addressBits(n: number): number {
    return Math.max(1, Math.ceil(Math.log2(n)));
}

/** Reads an address from pin levels, most significant bit first. */
export function readAddress(levels: boolean[]): number {
    let v = 0;
    for (const on of levels)
        v = (v << 1) | (on ? 1 : 0);
    return v;
}

/** The display's own memory: one bit per LED, row by row from the top left. */
export class DotMatrixFrame {
    readonly pixels: Uint8Array;

    constructor(readonly width: number, readonly height: number) {
        this.pixels = new Uint8Array(width * height);
    }

    /** Sets one LED; addresses past the edge are ignored, as on a real module. */
    write(x: number, y: number, on: boolean): void {
        if (x < this.width && y < this.height)
            this.pixels[y * this.width + x] = on ? 1 : 0;
    }

    get(x: number, y: number): boolean {
        return this.pixels[y * this.width + x] === 1;
    }

    clear(): void {
        this.pixels.fill(0);
    }

    /** Copies what fits of another frame (keeps the picture when resized). */
    copyFrom(other: DotMatrixFrame): void {
        for (let y = 0; y < Math.min(this.height, other.height); y++)
            for (let x = 0; x < Math.min(this.width, other.width); x++)
                this.pixels[y * this.width + x] = other.pixels[y * other.width + x];
    }
}

/**
 * Chip size in grid squares (`cspc2` pixels each) for a screen of
 * width × height LEDs: room for the screen with margins for the pin labels,
 * and at least one square per pin on each side.
 */
export function chipSize(width: number, height: number, cspc: number): { sizeX: number; sizeY: number; pitch: number } {
    const pitch = basePitch(width, height, cspc);
    const cspc2 = cspc * 2;
    // X pins sit one square in from each corner
    const sizeX = Math.max(addressBits(width) + 2, Math.ceil((width * pitch + 4 * cspc) / cspc2));
    const sizeY = Math.max(addressBits(height), 3, Math.ceil((height * pitch + 2.5 * cspc) / cspc2));
    return { sizeX, sizeY, pitch };
}

/** LED spacing in pixels: roomier for small screens, tiny for big ones. */
export function basePitch(width: number, height: number, cspc: number): number {
    return width <= 16 && height <= 16 ? cspc / 2 : cspc / 4;
}
