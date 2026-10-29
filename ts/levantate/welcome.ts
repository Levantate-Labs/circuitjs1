/*
    Copyright (C) 2026 Levantate Labs

    This file is part of the Levantate Labs fork of CircuitJS1, distributed under
    the GNU General Public License, version 2 or (at your option) any later
    version. See COPYING.txt.
*/

// The circuit the lab opens with when no circuit was asked for. The default in
// setuplist.txt (the Maestro welcome display) opens on a device's first visit;
// after that the lab opens on a blank canvas, and the welcome stays one click
// away in Circuits › Maestro. Inside a host page (the Maestro platform's
// iframe) the host sends the circuit, so the lab starts blank there and that
// doesn't count as a visit.

const STORAGE_KEY = "lvWelcomeSeen";
export const BLANK_FILE = "blank.txt";

function seen(): boolean {
    try {
        return localStorage.getItem(STORAGE_KEY) === "1";
    } catch {
        return false;
    }
}

/**
 * Which circuit to start with, given the list's default. `opening` says the
 * lab is about to open it, which is what counts as having seen the welcome.
 */
export function startCircuit(file: string, title: string, opening: boolean,
                             embedded = window.parent !== window): { file: string; title: string } {
    if (embedded || seen())
        return { file: BLANK_FILE, title: "Blank Circuit" };
    if (opening) {
        try { localStorage.setItem(STORAGE_KEY, "1"); } catch { /* ignore */ }
    }
    return { file, title };
}
