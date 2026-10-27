/*
    Copyright (C) 2026 Levantate Labs

    This file is part of the Levantate Labs fork of CircuitJS1, distributed under
    the GNU General Public License, version 2 or (at your option) any later
    version. See COPYING.txt.
*/

// An instrument that drives the circuit (function generator, bench supply).
// Its output is a real source in the simulation, added between the red (+)
// and black (COM) lead tips only while the output is on and both tips are on
// terminals. That source part is the instrument's, not the student's:
//   - marked `levInstrument`: never saved (CircuitXMLSerializer), never in
//     undo copies or a test answer, never a grading-point target;
//   - locked (`levLocked`): can't be selected, edited, moved or deleted;
//   - draws nothing itself: the leads show where it connects.
// A load or undo rebuilds the circuit without it; it is put back next frame.

import { makePanelDraggable, placePanel, ProbeLeads, type LeadsHost } from "./leads";

export interface SourceHost extends LeadsHost {
    addElement(elm: any): void;
    removeElement(elm: any): void;
    reanalyze(): void;              // settings changed: restamp the circuit
    simTime(): number;
}

export abstract class SourceInstrument {
    protected readonly panel: HTMLElement;
    protected readonly leads: ProbeLeads;
    protected open = false;
    protected output = false;
    protected elm: any = null;
    private placedAt = "";
    private readonly outputButton: HTMLButtonElement;
    private readonly hintEl: HTMLElement;
    private readonly jacks: HTMLElement[];

    constructor(protected readonly host: SourceHost, container: HTMLElement, canvas: HTMLCanvasElement,
                opts: { title: string; className: string; body: string; jacks: [string, string]; park: { x: number; y: number } }) {
        this.panel = document.createElement("div");
        this.panel.className = `lvInstr ${opts.className} lvHidden`;
        this.panel.setAttribute("role", "dialog");
        this.panel.setAttribute("aria-label", opts.title);
        this.panel.innerHTML = `
<div class="lvMeterHead"><span>${opts.title}</span>
  <button type="button" class="lvMeterClose" aria-label="Close ${opts.title.toLowerCase()}" title="Close">×</button></div>
${opts.body}
<button type="button" class="lvInstrOutput" aria-pressed="false">Output off</button>
<p class="lvMeterHint"></p>
<div class="lvMeterJacks"><span class="lvMeterJack red">${opts.jacks[0]}</span><span class="lvMeterJack black">${opts.jacks[1]}</span></div>`;
        this.outputButton = this.panel.querySelector(".lvInstrOutput")!;
        this.hintEl = this.panel.querySelector(".lvMeterHint")!;
        this.jacks = Array.from(this.panel.querySelectorAll<HTMLElement>(".lvMeterJack"));
        this.panel.querySelector(".lvMeterClose")!.addEventListener("click", () => this.setOpen(false));
        this.outputButton.addEventListener("click", () => {
            this.output = !this.output;
            this.host.repaint();
        });
        makePanelDraggable(this.panel, this.panel.querySelector(".lvMeterHead")!, container, () => host.repaint());
        container.appendChild(this.panel);
        // sources connect only where parts' ends meet, so leads snap to terminals
        this.leads = new ProbeLeads(host, canvas, { postsOnly: true, park: opts.park, onChange: () => host.repaint() });
        container.addEventListener("pointerdown", (e) => {
            if (this.open && e.button === 0 && e.target === canvas)
                this.leads.pointerDown(e);
        }, true);
    }

    isOpen(): boolean { return this.open; }

    toggle(): void { this.setOpen(!this.open); }

    // Closing the instrument disconnects it (the output turns off).
    setOpen(on: boolean): void {
        this.open = on;
        if (!on)
            this.output = false;
        this.panel.classList.toggle("lvHidden", !on);
        if (on) {
            placePanel(this.panel, this.panel.parentElement!);
            this.leads.parkIfNew();
        }
        this.sync();
        this.host.repaint();
    }

    /** The source part to add, already configured; the base class places it. */
    protected abstract createSource(): any;
    /** Push the panel's settings onto the source part. */
    protected abstract configure(elm: any): void;
    /** Update the panel (readings, labels) once a frame. */
    protected abstract renderPanel(): void;

    // Settings changed on the panel.
    protected settingsChanged(): void {
        if (this.elm != null && this.host.elements().includes(this.elm)) {
            this.configure(this.elm);
            this.host.reanalyze();
        }
        this.host.repaint();
    }

    // Keep the source part in the circuit exactly when it should be there.
    private sync(): void {
        const red = this.leads.red.contact, black = this.leads.black.contact;
        const want = this.open && this.output && red != null && black != null && !this.leads.sameNode();
        const present = this.elm != null && this.host.elements().includes(this.elm);
        const at = want ? [black!.at.x, black!.at.y, red!.at.x, red!.at.y].join(",") : "";
        if (present && (!want || at !== this.placedAt)) {
            this.host.removeElement(this.elm);
            this.elm = null;
        }
        if (want && (this.elm == null || !this.host.elements().includes(this.elm))) {
            const elm = this.createSource();
            elm.x = black!.at.x;
            elm.y = black!.at.y;
            elm.x2 = red!.at.x;
            elm.y2 = red!.at.y;
            elm.setPoints();
            elm.levInstrument = true;
            elm.levLocked = true;
            elm.draw = () => {};            // the leads show where it connects
            this.configure(elm);
            this.host.addElement(elm);
            this.elm = elm;
            this.placedAt = at;
        }
    }

    /** The output terminals' voltage and the current out of the red lead, when connected. */
    protected outputReading(): { v: number; i: number } | null {
        const e = this.elm;
        if (e == null || !this.host.elements().includes(e) || e.nodes == null)
            return null;
        return { v: e.nodes[1].v - e.nodes[0].v, i: this.currentOut(e) };
    }

    protected abstract currentOut(elm: any): number;

    draw(ctx: CanvasRenderingContext2D): void {
        if (!this.open)
            return;
        this.leads.refresh();
        this.sync();
        this.outputButton.textContent = this.output ? "Output on" : "Output off";
        this.outputButton.classList.toggle("on", this.output);
        this.outputButton.setAttribute("aria-pressed", String(this.output));
        let hint = "";
        if (!this.leads.attached)
            hint = "Drag the red and black leads onto terminals (or wire ends).";
        else if (this.leads.sameNode())
            hint = "Both leads are on the same point.";
        else if (!this.output)
            hint = "Turn the output on to drive the circuit.";
        this.hintEl.textContent = hint;
        this.hintEl.classList.toggle("lvHidden", hint === "");
        this.renderPanel();
        ctx.save();
        this.leads.draw(ctx, this.jacks);
        ctx.restore();
    }
}

// A number field that reports finite values in [min, max] on change.
export function numberField(input: HTMLInputElement, min: number, max: number, onValue: (v: number) => void): void {
    input.addEventListener("change", () => {
        const v = Number(input.value);
        const ok = isFinite(v) && v >= min && v <= max;
        input.classList.toggle("lvInvalid", !ok);
        input.setAttribute("aria-invalid", String(!ok));
        if (ok)
            onValue(v);
    });
    // keys typed here are for the field, not the simulator's shortcuts
    for (const ev of ["keydown", "keypress", "keyup"])
        input.addEventListener(ev, (e) => e.stopPropagation());
}
