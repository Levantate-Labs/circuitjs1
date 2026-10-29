/*
    Copyright (C) 2026 Levantate Labs

    This file is part of the Levantate Labs fork of CircuitJS1, distributed under
    the GNU General Public License, version 2 or (at your option) any later
    version. See COPYING.txt.
*/

// Parts added by the Levantate Labs fork. Registered separately from upstream's
// generated ../registerElements.ts so regenerating that file can't drop them.

import { CirSim } from "../CirSim";
import { ElementFactory } from "../ElementFactory";
import { GradePointElm } from "./grading/GradePointElm";
import { DotMatrixElm } from "./parts/DotMatrixElm";

export function registerLevantateElements(): void {
    ElementFactory.registerClass("GradePointElm", GradePointElm as any);
    CirSim.theApp.register("GradePointElm", new GradePointElm(0, 0));
    ElementFactory.registerClass("DotMatrixElm", DotMatrixElm as any);
    CirSim.theApp.register("DotMatrixElm", new DotMatrixElm(0, 0));
}
