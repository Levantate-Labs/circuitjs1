/*
    Copyright (C) 2026 Levantate Labs

    This file is part of the Levantate Labs fork of CircuitJS1, distributed under
    the GNU General Public License, version 2 or (at your option) any later
    version. See COPYING.txt.
*/

import { describe, expect, it } from "vitest";
import { Exam, lockKey } from "./exam";

class ResistorElm { levLocked = false; constructor(public x: number, public y: number, public x2: number, public y2: number) {} }
class GradePointElm { levLocked = false; constructor(public x: number, public y: number, public x2: number, public y2: number, public pointId: string) {} }

describe("starter locks across undo", () => {
    it("re-locks the starter's parts in a rebuilt circuit, and only those", () => {
        const removed: unknown[] = [];
        Exam.lockStarter([new ResistorElm(0, 0, 64, 0), new GradePointElm(64, 0, 96, -32, "gp_vout")], (ce) => removed.push(ce));
        // undo rebuilds every part from the saved copy: new objects, no locks
        const rebuilt = [new ResistorElm(0, 0, 64, 0), new GradePointElm(64, 0, 96, -32, "gp_vout"), new ResistorElm(0, 64, 64, 64)];
        Exam.relock(rebuilt, () => {});
        expect(rebuilt.map((e) => e.levLocked)).toEqual([true, true, false]);
        expect(removed).toHaveLength(2);   // starter sliders removed
    });

    it("tells grading points with different ids apart", () => {
        expect(lockKey(new GradePointElm(0, 0, 1, 1, "a"))).not.toBe(lockKey(new GradePointElm(0, 0, 1, 1, "b")));
    });

    it("does nothing without locked starter parts", () => {
        Exam.lockedKeys.clear();
        const parts = [new ResistorElm(0, 0, 64, 0)];
        Exam.relock(parts, () => {});
        expect(parts[0].levLocked).toBe(false);
    });
});
