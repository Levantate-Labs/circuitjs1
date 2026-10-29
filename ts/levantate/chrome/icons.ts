/*
    Copyright (C) 2026 Levantate Labs

    This file is part of the Levantate Labs fork of CircuitJS1, distributed under
    the GNU General Public License, version 2 or (at your option) any later
    version. See COPYING.txt.
*/

// Line icons for the lab's app bar, action bar and Inspector (24 × 24, drawn
// with currentColor so they follow the theme).

const svg = (body: string, size = 18) =>
    `<svg viewBox='0 0 24 24' width='${size}' height='${size}' fill='none' stroke='currentColor' ` +
    `stroke-width='1.8' stroke-linecap='round' stroke-linejoin='round' aria-hidden='true'>${body}</svg>`;

export const ICONS = {
    undo: svg("<path d='M9 14L4 9l5-5'/><path d='M4 9h10.5a5.5 5.5 0 010 11H11'/>"),
    redo: svg("<path d='M15 14l5-5-5-5'/><path d='M20 9H9.5a5.5 5.5 0 000 11H13'/>"),
    cut: svg("<circle cx='6' cy='6' r='3'/><circle cx='6' cy='18' r='3'/><path d='M20 4L8.12 15.88M14.47 14.48L20 20M8.12 8.12L12 12'/>"),
    copy: svg("<rect x='9' y='9' width='12' height='12' rx='2'/><path d='M5 15H4a1 1 0 01-1-1V4a1 1 0 011-1h10a1 1 0 011 1v1'/>"),
    paste: svg("<rect x='8' y='2' width='8' height='4' rx='1'/><path d='M16 4h2a2 2 0 012 2v14a2 2 0 01-2 2H6a2 2 0 01-2-2V6a2 2 0 012-2h2'/>"),
    duplicate: svg("<rect x='8' y='8' width='13' height='13' rx='2'/><path d='M4 16V5a1 1 0 011-1h11'/><path d='M14.5 11.5v6M11.5 14.5h6'/>"),
    rotateLeft: svg("<path d='M3 12a9 9 0 109-9 9.75 9.75 0 00-6.74 2.74L3 8'/><path d='M3 3v5h5'/>"),
    rotateRight: svg("<path d='M21 12a9 9 0 11-9-9 9.75 9.75 0 016.74 2.74L21 8'/><path d='M21 3v5h-5'/>"),
    flipH: svg("<path d='M12 3v18'/><path d='M8 7L3 12l5 5V7z'/><path d='M16 7l5 5-5 5V7z'/>"),
    flipV: svg("<path d='M3 12h18'/><path d='M7 8l5-5 5 5H7z'/><path d='M7 16l5 5 5-5H7z'/>"),
    trash: svg("<path d='M3 6h18'/><path d='M8 6V4h8v2'/><path d='M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6'/>"),
    search: svg("<circle cx='11' cy='11' r='7'/><path d='M21 21l-4.35-4.35'/>"),
    sun: svg("<circle cx='12' cy='12' r='4'/><path d='M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41'/>"),
    moon: svg("<path d='M21 12.79A9 9 0 1111.21 3 7 7 0 0021 12.79z'/>"),
    reset: svg("<path d='M3 12a9 9 0 019-9 9.75 9.75 0 016.74 2.74L21 8'/><path d='M21 3v5h-5'/><path d='M21 12a9 9 0 01-9 9 9.75 9.75 0 01-6.74-2.74L3 16'/><path d='M8 16H3v5'/>", 16),
    speed: svg("<path d='M12 14l4-4'/><path d='M3.34 19a10 10 0 1117.32 0'/>", 16),
};

/** The Maestro mark: an M in a rounded square, in the brand colour. */
export const MAESTRO_MARK =
    "<svg viewBox='0 0 24 24' width='24' height='24' aria-hidden='true'>" +
    "<rect width='24' height='24' rx='6' fill='var(--primary)'/>" +
    "<path d='M6.5 17V7.5l5.5 6 5.5-6V17' fill='none' stroke='var(--primary-fg)' stroke-width='2.2' " +
    "stroke-linecap='round' stroke-linejoin='round'/></svg>";
