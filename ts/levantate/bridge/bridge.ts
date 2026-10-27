/*
    Copyright (C) 2026 Levantate Labs

    This file is part of the Levantate Labs fork of CircuitJS1, distributed under
    the GNU General Public License, version 2 or (at your option) any later
    version. See COPYING.txt.
*/

// The embedding bridge (roadmap slice L3): the host page talks to the simulator
// with postMessage only. Protocol: docs/bridge-protocol.md.

import { CirSim } from "../../CirSim";
import { UndoManager } from "../../UndoManager";
import { Exam, applyExamUI } from "../exam/exam";
import { GradePointElm } from "../grading/GradePointElm";
import { MEASURES, type Measure } from "../grading/signalStats";

export const PROTOCOL_VERSION = 1;
const MAX_CIRCUIT_CHARS = 256 * 1024;
const CHANGE_DEBOUNCE_MS = 800;

// Hosts allowed to drive the simulator. "*." matches any subdomain; a port of
// "*" matches any port. A deployment can add more with VITE_PARENT_ORIGINS.
const DEFAULT_ORIGINS = [
    "http://localhost:*", "http://127.0.0.1:*",
    "https://studywithmaestro.com", "https://*.studywithmaestro.com",
    "https://*.levantate.in",
];

export function allowedOrigins(): string[] {
    const extra = (import.meta.env?.VITE_PARENT_ORIGINS ?? "") as string;
    return DEFAULT_ORIGINS.concat(extra.split(",").map((s) => s.trim()).filter(Boolean));
}

export function originAllowed(origin: string, patterns: string[] = allowedOrigins()): boolean {
    let u: URL;
    try { u = new URL(origin); } catch { return false; }
    return patterns.some((p) => {
        const m = /^(https?):\/\/(\*\.)?([^:/]+)(?::(\*|\d+))?$/.exec(p);
        if (!m)
            return false;
        const [, scheme, wild, host, port] = m;
        if (u.protocol !== scheme + ":")
            return false;
        const hostOk = wild ? (u.hostname.endsWith("." + host)) : u.hostname === host;
        if (!hostOk)
            return false;
        if (port === "*")
            return true;
        const actual = u.port || (scheme === "https" ? "443" : "80");
        return actual === (port ?? (scheme === "https" ? "443" : "80"));
    });
}

type HostMessage = { source: string; v: number; type: string; id?: string; [k: string]: any };

export class Bridge {
    static instance: Bridge | null = null;

    private hostOrigin: string | null = null;
    private initialized = false;
    private lastCircuit = "";
    private lastPoints = "";
    private changeTimer: number | null = null;
    private tourOffered = false;

    private constructor(private readonly app: CirSim) {}

    // Called at the end of CirSim.init(). Does nothing outside an iframe.
    static install(app: CirSim): void {
        if (window.parent === window || Bridge.instance != null)
            return;
        const b = new Bridge(app);
        Bridge.instance = b;
        window.addEventListener("message", (e) => b.onMessage(e));
        Exam.onIntegrity = (event, detail) => b.post({ type: "integrity", event, detail });
        b.watchForChanges();
        b.sendReady("*");
    }

    private sendReady(target: string): void {
        this.post({ type: "ready", version: CirSim.versionString, protocol: PROTOCOL_VERSION }, target);
    }

    private post(msg: Record<string, unknown>, target?: string): void {
        const to = target ?? this.hostOrigin;
        if (to == null)
            return;
        window.parent.postMessage({ source: "maestro-sim", v: PROTOCOL_VERSION, ...msg }, to);
    }

    private error(code: string, message: string, id?: string, target?: string): void {
        this.post({ type: "error", code, message, id }, target);
    }

    private onMessage(e: MessageEvent): void {
        if (e.source !== window.parent)
            return;
        const msg = e.data as HostMessage;
        if (msg == null || typeof msg !== "object" || msg.source !== "maestro-sim-host")
            return;
        if (!originAllowed(e.origin))
            return;
        // once a host has initialised us, only it may talk to us
        if (this.hostOrigin != null && e.origin !== this.hostOrigin)
            return;
        if (msg.v !== PROTOCOL_VERSION) {
            this.error("bad-version", "protocol " + PROTOCOL_VERSION + " expected", msg.id, e.origin);
            return;
        }
        try {
            this.handle(msg, e.origin);
        } catch (err) {
            this.error("bad-request", String(err), msg.id, e.origin);
        }
    }

    private handle(msg: HostMessage, origin: string): void {
        const app = this.app;
        if (msg.type === "hello") {
            this.sendReady(origin);
            return;
        }
        if (msg.type === "init") {
            this.init(msg, origin);
            return;
        }
        if (!this.initialized) {
            this.error("not-initialized", "send init first", msg.id, origin);
            return;
        }
        switch (msg.type) {
        case "export":
            this.post({ type: "exported", id: msg.id, circuit: app.dumpCircuit() });
            return;
        case "setReadOnly":
            app.menus.noEditCheckItem.setState(!!msg.value);
            app.repaint();
            return;
        case "getGradePoints":
            this.post({ type: "gradePoints", id: msg.id, points: this.gradePoints() });
            return;
        case "resetStats":
            for (const gp of this.pins())
                gp.stats.reset();
            return;
        case "measure":
            this.post({ type: "measured", id: msg.id, values: this.measure(msg.points), simTime: app.sim.t });
            return;
        }
        this.error("unknown-type", "unknown message type " + msg.type, msg.id);
    }

    private init(msg: HostMessage, origin: string): void {
        const app = this.app;
        if (msg.circuit != null && (typeof msg.circuit !== "string" || msg.circuit.length > MAX_CIRCUIT_CHARS)) {
            this.error("too-large", "circuit must be a string of at most " + MAX_CIRCUIT_CHARS + " characters", msg.id, origin);
            return;
        }
        this.hostOrigin = origin;

        Exam.embedded = true;
        Exam.active = !!msg.exam;
        Exam.allowedParts = Array.isArray(msg.parts) ? new Set(msg.parts.map(String)) : null;
        Exam.enforcing = false;   // the starter circuit may contain any part

        if (typeof msg.circuit === "string") {
            try {
                app.importCircuitFromText(msg.circuit, false);
            } catch (err) {
                Exam.enforcing = true;
                this.error("bad-circuit", "could not load the circuit: " + err, msg.id);
                return;
            }
        }
        if (msg.lockStarter)
            Exam.lockStarter(app.elmList, (ce) => app.deleteSliders(ce));
        else
            Exam.lockedKeys.clear();
        Exam.enforcing = true;

        if (typeof msg.theme === "string")
            app.menus.printableCheckItem.setState(msg.theme !== "dark");
        if (typeof msg.dotGrid === "boolean")
            app.menus.dotGridCheckItem.setState(msg.dotGrid);
        app.menus.noEditCheckItem.setState(!!msg.readOnly);
        if (typeof msg.running === "boolean")
            app.setSimRunning(msg.running);
        // instruments (the multimeter): on unless the host turns them off
        app.ui.instrumentsAllowed = msg.instruments !== false;
        if (!app.ui.instrumentsAllowed && app.ui.meter?.isOpen())
            app.ui.meter.setOpen(false);
        // compact top bar: on in exams unless the host says otherwise
        const compact = typeof msg.compact === "boolean" ? msg.compact : !!msg.exam;
        if (compact !== app.ui.compactBar)
            app.ui.setCompactBar(compact);

        // undo can't go back past the host's starter circuit
        app.undoManager.undoStack.length = 0;
        app.undoManager.redoStack.length = 0;
        app.undoManager.enableUndoRedo();

        const ui: any = app.ui;
        applyExamUI({
            topItems: app.menus.topItems,
            toolbar: ui.toolbar.element,
            mainMenuItems: ui.mainMenuItems,
            mainMenuItemNames: ui.mainMenuItemNames,
            sidePanel: ui.verticalPanel,
            examHidden: [app.menus.noEditCheckItem._li],
            onAbout: () => app.commands.menuPerformed("file", "about"),
        });
        // drop the part tool if it was set to one the allow-list now forbids
        if (!Exam.isPartAllowed(ui.mouseModeStr))
            app.commands.menuPerformed("main", "Select");

        // the host saves the circuit, so don't show upstream's "(saved)" status
        app.savedFlag = false;
        app.ui.titleLabel.textContent = "";

        this.initialized = true;
        this.lastCircuit = UndoManager.withoutSliders(app.dumpCircuit());
        app.needAnalyze();
        this.post({ type: "initialized", id: msg.id, parts: Exam.allowedParts ? [...Exam.allowedParts] : null });
        // first-run tour, once per device, unless the host turns it off
        if (!this.tourOffered) {
            this.tourOffered = true;
            app.ui.tour?.maybeAutoStart(msg.tour !== false && !msg.readOnly && app.ui.tourAllowed);
        }
        this.postGradePointsIfChanged(true);
    }

    private pins(): GradePointElm[] {
        return this.app.elmList.filter((e: any) => e instanceof GradePointElm) as GradePointElm[];
    }

    private gradePoints(): { id: string; label: string; kind: string }[] {
        return this.pins().map((p) => ({ id: p.pointId, label: p.label, kind: p.kind }));
    }

    private postGradePointsIfChanged(force = false): void {
        const points = this.gradePoints();
        const key = JSON.stringify(points);
        if (!force && key === this.lastPoints)
            return;
        this.lastPoints = key;
        this.post({ type: "gradePoints", points });
    }

    private measure(points: unknown): Record<string, Record<string, number | null>> {
        const byId = new Map(this.pins().map((p) => [p.pointId, p]));
        const out: Record<string, Record<string, number | null>> = {};
        if (!Array.isArray(points))
            return out;
        for (const req of points.slice(0, 200)) {
            const id = String(req?.id ?? "");
            const m = String(req?.measure ?? "value") as Measure;
            const pin = byId.get(id);
            const v = pin && (MEASURES as readonly string[]).includes(m) ? pin.measure(m) : NaN;
            (out[id] ??= {})[m] = isFinite(v) ? v : null;
        }
        return out;
    }

    // Edits go through UndoManager.pushUndo() and CirSim.needAnalyze(); after
    // either, check (debounced) whether the circuit really changed.
    private watchForChanges(): void {
        const app = this.app;
        const schedule = () => this.scheduleChangeCheck();
        const analyze = app.needAnalyze.bind(app);
        app.needAnalyze = () => { analyze(); schedule(); };
        const um = app.undoManager;
        const push = um.pushUndo.bind(um);
        um.pushUndo = () => { push(); schedule(); };
    }

    private scheduleChangeCheck(): void {
        if (!this.initialized)
            return;
        if (this.changeTimer != null)
            window.clearTimeout(this.changeTimer);
        this.changeTimer = window.setTimeout(() => {
            this.changeTimer = null;
            const circuit = this.app.dumpCircuit();
            const key = UndoManager.withoutSliders(circuit);
            if (key !== this.lastCircuit) {
                this.lastCircuit = key;
                this.post({ type: "changed", circuit });
            }
            this.postGradePointsIfChanged();
        }, CHANGE_DEBOUNCE_MS);
    }
}
