/*
    Copyright (C) 2026 Levantate Labs

    This file is part of the Levantate Labs fork of CircuitJS1, distributed under
    the GNU General Public License, version 2 or (at your option) any later
    version. See COPYING.txt.
*/

// Guided tour for first-time students: a few steps that spotlight a part of
// the screen each, with Back / Next / Skip. It starts by itself the first time
// the lab is opened on a device (remembered in local storage) and can be
// restarted from the Help panel. Steps whose target isn't on screen (no graphs
// yet, dock turned off) are skipped.

export interface Rect { left: number; top: number; width: number; height: number; }

export interface TourStep {
    title: string;
    body: string;                      // HTML written here, never user input
    target?: () => Rect | null;        // nothing: a centred card
}

export interface TourHost {
    circuitRect(): Rect | null;        // the circuit area of the canvas
    partRect(): Rect | null;           // a part on the canvas, to point at
    graphsRect(): Rect | null;         // the graph strip, when it is showing
}

const STORAGE_KEY = "lvTourDone";
const VERSION = "1";

function visible(selector: string): () => Rect | null {
    return () => {
        const el = document.querySelector<HTMLElement>(selector);
        if (el == null)
            return null;
        const r = el.getBoundingClientRect();   // (0 × 0 when hidden)
        return r.width > 0 && r.height > 0 ? r : null;
    };
}

function firstOf(...targets: (() => Rect | null)[]): () => Rect | null {
    return () => {
        for (const t of targets) {
            const r = t();
            if (r != null)
                return r;
        }
        return null;
    };
}

export function tourSteps(host: TourHost): TourStep[] {
    const kbd = (s: string) => "<kbd>" + s + "</kbd>";
    return [
        {
            title: "Welcome to the Simulation Lab",
            body: "Build circuits and watch them run: moving dots show current and wire colours show " +
                  "voltage. This short tour shows you the basics.",
        },
        {
            title: "Add parts",
            target: visible(".toolDock"),
            body: "Pick a part here, then drag on the canvas to place it. You can also press a part " +
                  "and drag it straight onto the canvas. The magnifier searches every part.",
        },
        {
            title: "Connect with wires",
            target: () => host.circuitRect(),
            body: "Press " + kbd("w") + " and drag from one terminal dot to another to connect parts. " +
                  "Drag a part to move it, and press " + kbd("Delete") + " to remove what's selected. " +
                  kbd("Esc") + " goes back to the Select tool.",
        },
        {
            title: "Change values",
            target: firstOf(() => host.partRect(), () => host.circuitRect()),
            body: "Click a part to open its properties. Type a value like " + kbd("4.7k") + " or " +
                  kbd("10u") + " and press Enter. The Live section shows its current and voltage.",
        },
        {
            title: "Run, stop and reset",
            target: firstOf(visible(".runStop"), visible(".viewRun")),
            body: "The circuit runs live. Click here to pause or carry on; Reset starts again from zero. " +
                  "Teal wires are positive, coral negative and grey at 0 V.",
        },
        {
            title: "Freeze a moment",
            target: firstOf(visible(".freezeButton"), visible(".viewFreeze")),
            body: "Freeze stops the circuit at one instant and labels every current, with its direction, " +
                  "and every voltage. Great for checking your working.",
        },
        {
            title: "Graphs",
            target: () => host.graphsRect(),
            body: "Graphs plot values over time. Right-click a part and choose <b>View in New Scope</b> " +
                  "to add one; hover a graph to read it.",
        },
        {
            title: "Move around",
            target: visible(".zoomPill"),
            body: "Scroll to pan and " + kbd("Ctrl") + " + scroll to zoom; " + kbd("Shift") + " + " +
                  kbd("1") + " fits the circuit. The first buttons here hide the graphs or the side " +
                  "panel when you need more room.",
        },
        {
            title: "Help is always here",
            target: visible(".helpButton"),
            body: "Open the guide any time with this button, or press " + kbd("?") + " or " + kbd("F1") +
                  ". It explains every feature and the common error messages, and can replay this tour.",
        },
    ];
}

// Where the card goes: below the target if it fits, else above, else beside
// it, kept inside the viewport.
export function placeCard(target: Rect | null, card: { width: number; height: number },
                          view: { width: number; height: number }): { left: number; top: number } {
    const gap = 14, m = 12;
    const clampX = (x: number) => Math.max(m, Math.min(x, view.width - card.width - m));
    const clampY = (y: number) => Math.max(m, Math.min(y, view.height - card.height - m));
    if (target == null)
        return { left: clampX((view.width - card.width) / 2), top: clampY((view.height - card.height) / 2) };
    const cx = target.left + target.width / 2 - card.width / 2;
    const below = target.top + target.height + gap;
    if (below + card.height <= view.height - m)
        return { left: clampX(cx), top: below };
    const above = target.top - gap - card.height;
    if (above >= m)
        return { left: clampX(cx), top: above };
    const cy = target.top + target.height / 2 - card.height / 2;
    const left = target.left - gap - card.width;
    if (left >= m)
        return { left, top: clampY(cy) };
    return { left: clampX(target.left + target.width + gap), top: clampY(cy) };
}

export class Tour {
    private steps: TourStep[] = [];
    private index = 0;
    private root: HTMLElement | null = null;
    private spot!: HTMLElement;
    private card!: HTMLElement;
    private readonly onResize = () => this.layout();
    private readonly onKey = (e: KeyboardEvent) => this.key(e);

    constructor(private readonly host: TourHost) {}

    static seen(): boolean {
        try {
            return localStorage.getItem(STORAGE_KEY) === VERSION;
        } catch {
            return true;   // no storage: don't nag on every visit
        }
    }

    private static markSeen(): void {
        try { localStorage.setItem(STORAGE_KEY, VERSION); } catch { /* ignore */ }
    }

    isRunning(): boolean {
        return this.root != null;
    }

    // First visit on this device, unless the page or host turned it off.
    maybeAutoStart(allowed: boolean): void {
        if (allowed && !Tour.seen() && !this.isRunning())
            setTimeout(() => this.start(), 600);
    }

    start(): void {
        this.stop(false);
        // leave out steps for things not on screen, so the count is right
        this.steps = tourSteps(this.host).filter((s) => s.target == null || s.target() != null);
        this.index = 0;

        this.root = document.createElement("div");
        this.root.className = "lvTour";
        this.spot = document.createElement("div");
        this.spot.className = "lvTourSpot";
        this.card = document.createElement("div");
        this.card.className = "lvTourCard";
        this.card.setAttribute("role", "dialog");
        this.card.setAttribute("aria-modal", "true");
        this.card.setAttribute("aria-live", "polite");
        this.card.tabIndex = -1;
        this.root.append(this.spot, this.card);
        document.body.appendChild(this.root);
        this.card.addEventListener("click", (e) => {
            const b = (e.target as HTMLElement).closest<HTMLElement>("[data-tour]");
            if (b == null)
                return;
            const a = b.dataset.tour;
            if (a === "next") this.go(1);
            else if (a === "back") this.go(-1);
            else this.stop(true);
        });
        window.addEventListener("resize", this.onResize);
        document.addEventListener("keydown", this.onKey, true);
        this.show();
    }

    stop(seen: boolean): void {
        if (this.root == null)
            return;
        if (seen)
            Tour.markSeen();
        window.removeEventListener("resize", this.onResize);
        document.removeEventListener("keydown", this.onKey, true);
        this.root.remove();
        this.root = null;
    }

    // move by dir, skipping steps whose target isn't on screen
    private go(dir: number): void {
        let i = this.index + dir;
        while (i > 0 && i < this.steps.length && this.steps[i].target != null && this.steps[i].target!() == null)
            i += dir;
        if (i >= this.steps.length) {
            this.stop(true);
            return;
        }
        this.index = Math.max(0, i);
        this.show();
    }

    private key(e: KeyboardEvent): void {
        if (e.key === "Escape") this.stop(true);
        else if (e.key === "ArrowRight" || e.key === "Enter") this.go(1);
        else if (e.key === "ArrowLeft") this.go(-1);
        else return;
        e.preventDefault();
        e.stopPropagation();
    }

    private show(): void {
        const step = this.steps[this.index];
        const n = this.steps.length;
        const last = this.index === n - 1;
        const first = this.index === 0;
        this.card.setAttribute("aria-label", step.title);
        this.card.innerHTML = `
<div class="lvTourStep">${first ? "Quick tour" : this.index + " of " + (n - 1)}</div>
<h3>${step.title}</h3>
<p>${step.body}</p>
<div class="lvTourDots">${this.steps.slice(1).map((_, i) => `<span class="${i + 1 === this.index ? "on" : ""}"></span>`).join("")}</div>
<div class="lvTourButtons">
  <button type="button" class="lvTourSkip" data-tour="skip">${last ? "" : first ? "Not now" : "Skip tour"}</button>
  <span>
    ${first ? "" : `<button type="button" class="lvTourBack" data-tour="back">Back</button>`}
    <button type="button" class="lvTourNext" data-tour="next">${first ? "Start the tour" : last ? "Finish" : "Next"}</button>
  </span>
</div>`;
        if (last)
            this.card.querySelector(".lvTourSkip")!.remove();
        this.layout();
        (this.card.querySelector(".lvTourNext") as HTMLElement).focus();
    }

    private layout(): void {
        if (this.root == null)
            return;
        const step = this.steps[this.index];
        const r = step.target ? step.target() : null;
        const pad = 6;
        this.root.classList.toggle("centred", r == null);
        if (r != null) {
            Object.assign(this.spot.style, {
                display: "block",
                left: (r.left - pad) + "px", top: (r.top - pad) + "px",
                width: (r.width + 2 * pad) + "px", height: (r.height + 2 * pad) + "px",
            });
        } else {
            this.spot.style.display = "none";
        }
        const pos = placeCard(r == null ? null : { left: r.left - pad, top: r.top - pad, width: r.width + 2 * pad, height: r.height + 2 * pad },
                              { width: this.card.offsetWidth, height: this.card.offsetHeight },
                              { width: window.innerWidth, height: window.innerHeight });
        this.card.style.left = pos.left + "px";
        this.card.style.top = pos.top + "px";
    }
}
