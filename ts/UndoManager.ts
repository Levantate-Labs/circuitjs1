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
// Modified by Levantate Labs, 2026-10-27: no recovery copy in local storage during exams; 2026-10-28: undo/redo keep the starter's parts and locks in exams, and skip copies identical to the current circuit. See CHANGES.md.

import { Exam } from "./levantate/exam/exam";
import { CirSim } from "./CirSim";
import { CircuitLoader } from "./CircuitLoader";

class UndoItem {
    dump: string;
    scale: number;
    transform4: number;
    transform5: number;

    constructor(sim: CirSim, dump: string) {
        this.dump = dump;
        this.scale = sim.transform[0];
        this.transform4 = sim.transform[4];
        this.transform5 = sim.transform[5];
    }
}

export class UndoManager {
    sim: CirSim;
    undoStack: UndoItem[];
    redoStack: UndoItem[];

    constructor(sim: CirSim) {
        this.sim = sim;
        this.undoStack = [];
        this.redoStack = [];
    }

    // the dump without the sidebar slider settings (simulation speed, current speed, power
    // brightness), which are saved in the root element
    static withoutSliders(dump: string): string {
        const end = dump.indexOf('>');
        if (end < 0)
            return dump;
        return dump.substring(0, end).replace(/ (ic|cb|pb)="[^"]*"/g, "") + dump.substring(end);
    }

    pushUndo(): void {
        this.redoStack.length = 0;
        const s = this.sim.dumpCircuit();
        // (moving a sidebar slider isn't an undoable change, and shouldn't mark the circuit changed)
        if (this.undoStack.length > 0 &&
                UndoManager.withoutSliders(s) === UndoManager.withoutSliders(this.undoStack[this.undoStack.length - 1].dump))
            return;
        this.undoStack.push(new UndoItem(this.sim, s));
        this.enableUndoRedo();
        this.sim.savedFlag = false;
        this.sim.unsavedChanges = true;
    }

    doUndo(): void {
        const current = this.sim.dumpCircuit();
        UndoManager.dropCopiesOf(this.undoStack, current);
        if (this.undoStack.length === 0)
            return;
        this.redoStack.push(new UndoItem(this.sim, current));
        const ui = this.undoStack.pop()!;
        this.loadUndoItem(ui);
        this.enableUndoRedo();
    }

    doRedo(): void {
        const current = this.sim.dumpCircuit();
        UndoManager.dropCopiesOf(this.redoStack, current);
        if (this.redoStack.length === 0)
            return;
        this.undoStack.push(new UndoItem(this.sim, current));
        const ui = this.redoStack.pop()!;
        this.loadUndoItem(ui);
        this.enableUndoRedo();
    }

    // Levantate Labs: an edit pushes a copy before it (on mouse down) and after
    // it (on mouse up), so the top of the stack is often the circuit as it is
    // now, and undo would visibly do nothing until pressed again. Skip copies
    // that match the current circuit (ignoring slider positions).
    static dropCopiesOf(stack: UndoItem[], current: string): void {
        const now = UndoManager.withoutSliders(current);
        while (stack.length > 0 && UndoManager.withoutSliders(stack[stack.length - 1].dump) === now)
            stack.pop();
    }

    loadUndoItem(ui: UndoItem): void {
        // Levantate Labs: a saved copy of the circuit is restored as it was; the
        // exam's part allow-list only limits parts the student adds (it would
        // drop the starter's own parts here), and starter locks are put back
        const enforcing = Exam.enforcing;
        Exam.enforcing = false;
        try {
            this.sim.loader.readCircuit(ui.dump, CircuitLoader.RC_NO_CENTER);
        } finally {
            Exam.enforcing = enforcing;
        }
        Exam.relock(this.sim.elmList, (ce) => this.sim.deleteSliders(ce));
        this.sim.transform[0] = this.sim.transform[3] = ui.scale;
        this.sim.transform[4] = ui.transform4;
        this.sim.transform[5] = ui.transform5;
    }

    doRecover(): void {
        this.pushUndo();
        this.sim.loader.readCircuit(this.sim.recovery!);
        this.sim.allowSave(false);
        this.sim.menus.recoverItem.setEnabled(false);
        this.sim.unsavedChanges = false;
    }

    enableUndoRedo(): void {
        this.sim.menus.redoItem.setEnabled(this.redoStack.length > 0);
        this.sim.menus.undoItem.setEnabled(this.undoStack.length > 0);
    }

    writeRecoveryToStorage(): void {
        // Levantate Labs: exams keep nothing in the shared local storage
        if (Exam.active)
            return;
        CirSim.console("write recovery");
        const stor = window.localStorage;
        if (stor == null)
            return;
        const s = this.sim.dumpCircuit();
        stor.setItem("circuitRecovery", s);
    }

    readRecovery(): void {
        const stor = window.localStorage;
        if (stor == null)
            return;
        this.sim.recovery = stor.getItem("circuitRecovery");
    }
}
