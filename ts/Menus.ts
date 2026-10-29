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
// Modified by Levantate Labs, 2026-10-27: Options > Show Dot Grid / Show Minimap / Show Tool Dock / Show Graphs / Show Side Panel; Add Grading Point; top-level menu references for exam mode; Dropbox import hidden. See CHANGES.md.
// Modified by Levantate Labs, 2026-10-29: the default circuit is the Maestro welcome on a first visit, a blank canvas after that; Add Dot Matrix Display. See CHANGES.md.
// Modified by Levantate Labs, 2026-10-30: menus rebuilt for students (Circuit, Edit, Parts, Graphs, View, Examples; rare options moved to a Settings dialog) inside the new app bar. See CHANGES.md.

// GWT conversion (c) 2015 by Iain Sharp

import { Exam } from "./levantate/exam/exam";
import { startCircuit as welcomeStartCircuit } from "./levantate/welcome";
import { CirSim } from "./CirSim";
import { Locale } from "./Locale";
import { CommandPaletteRegistry } from "./CommandPaletteRegistry";
import { moduleBaseURL } from "./ModuleBase";
import { AppBar } from "./levantate/chrome/appBar";

// ---- State classes used by UIManager ----

// A checkbox-style options menu item.  Maintains a boolean state and an
// optional command run whenever the item is toggled.
export class CheckItem {
    private _state: boolean;
    private _command: (() => void) | null = null;
    _li: HTMLLIElement | null = null;  // linked DOM element, set when added to a Menu

    constructor(state: boolean = false) { this._state = state; }

    getState(): boolean { return this._state; }

    setState(s: boolean): void {
        this._state = s;
        if (this._li) {
            const mark = this._li.querySelector('.checkMark') as HTMLElement | null;
            if (mark) mark.style.visibility = s ? 'visible' : 'hidden';
        }
    }

    setCommand(cmd: { execute(): void }): void { this._command = () => cmd.execute(); }
    setScheduledCommand(cmd: { execute(): void }): void { this._command = () => cmd.execute(); }

    // Toggle state then run command (called on click)
    toggle(): void {
        this.setState(!this._state);
        if (this._command) this._command();
    }

    execute(): void { if (this._command) this._command(); }
}

// A regular (non-checkbox) menu item — tracks enabled state and links to its DOM element.
export class MenuItem {
    private _enabled: boolean = true;
    private _command: (() => void) | null = null;
    _li: HTMLLIElement | null = null;

    setEnabled(b: boolean): void {
        this._enabled = b;
        if (this._li) this._li.classList.toggle('menuItemDisabled', !b);
    }

    isEnabled(): boolean { return this._enabled; }

    setScheduledCommand(cmd: { execute(): void }): void { this._command = () => cmd.execute(); }

    // GWT compatibility aliases used by scope popup menus
    setCommand(cmd: { execute(): void } | null): void { this._command = cmd ? () => cmd.execute() : null; }
    setSubMenu(_sub: any): void { /* scope submenu — not used in plain HTML menus */ }

    execute(): void { if (this._enabled && this._command) this._command(); }
}

// ---- Internal menu-building helpers ----

function closeAllMenus(): void {
    document.querySelectorAll('.gwt-MenuItem.open, .topMenuItem.open, li.hasSubmenu.open').forEach(el => el.classList.remove('open'));
}

function anyMenuOpen(): boolean {
    return document.querySelector('.gwt-MenuItem.open, .topMenuItem.open') !== null;
}

// Build "<i class='cirjsicon-X'></i>&nbsp;Label" HTML for icon menu items.
function iconHtml(icon: string, text: string): string {
    const ls = Locale.LS(text);
    return icon ? `<i class="cirjsicon-${icon}"></i>&nbsp;${ls}` : ls;
}

// Build the two-column "icon+text | shortcut" layout used by menuItemWithShortcut.
function shortcutHtml(icon: string, text: string, shortcut: string): string {
    const inner = iconHtml(icon, text);
    return `<div class="menuItemRow"><span>${inner}</span><span class="shortcutHint">${shortcut}</span></div>`;
}

// A vertical dropdown menu (equivalent to GWT MenuBar(true)).
class Menu {
    ul: HTMLUListElement;
    private app: CirSim;

    constructor(app: CirSim) {
        this.app = app;
        this.ul = document.createElement('ul');
        this.ul.className = 'menuDropdown';
    }

    // Add a simple command item, returns the <li> for optional post-setup.
    addCommand(html: string, menuName: string, cmdName: string): HTMLLIElement {
        const li = this.makeLi(html);
        // Without this, the tap's touchstart bubbles to the document-level "tap elsewhere
        // closes everything" listener (see init()) before this item's own click fires,
        // closing (and hiding) the menu out from under the tap -- which then suppresses
        // the synthetic click entirely, so the command never runs. See addSubmenu() for
        // the same fix applied there.
        li.addEventListener('touchstart', e => e.stopPropagation(), { passive: true });
        li.addEventListener('click', e => {
            if (li.classList.contains('menuItemDisabled')) return;
            e.stopPropagation();
            closeAllMenus();
            this.app.commands.menuPerformed(menuName, cmdName);
        });
        this.ul.appendChild(li);
        return li;
    }

    // Add a command item and wire it to a MenuItem state object.
    addMenuItem(item: MenuItem, html: string, menuName: string, cmdName: string): void {
        const li = this.addCommand(html, menuName, cmdName);
        item._li = li;
        item.setEnabled(item.isEnabled());
        item.setScheduledCommand({ execute: () => this.app.commands.menuPerformed(menuName, cmdName) });
    }

    // Add a CheckItem (toggles on click, shows checkmark).
    addCheckItem(item: CheckItem, label: string): void {
        const li = this.makeLi('');
        li.innerHTML = `<span class="checkMark">&#10003;</span> ${Locale.LS(label)}`;
        const mark = li.querySelector('.checkMark') as HTMLElement;
        mark.style.visibility = item.getState() ? 'visible' : 'hidden';
        item._li = li;
        li.addEventListener('touchstart', e => e.stopPropagation(), { passive: true });
        li.addEventListener('click', e => {
            e.stopPropagation();
            closeAllMenus();
            item.toggle();
        });
        this.ul.appendChild(li);
    }

    // Add a CheckboxMenuItem from UIManager.getClassCheckItem (element-placement mode).
    // The item has getLabel(), getShortcut(), execute(), and a _li property.
    addCheckboxItem(item: any): void {
        const li = this.makeLi('');
        const label = item.getLabel ? item.getLabel() : String(item);
        const sc = item.getShortcut ? item.getShortcut() : '';
        li.innerHTML = `<span class="checkMark">&#10003;</span> <span class="itemLabel">${Locale.LS(label)}</span>` +
            (sc ? `<span class="shortcutHint">${sc}</span>` : '');
        item._li = li;
        item.setState(item.getState());
        li.addEventListener('touchstart', e => e.stopPropagation(), { passive: true });
        li.addEventListener('click', e => {
            e.stopPropagation();
            closeAllMenus();
            item.execute();
        });
        this.ul.appendChild(li);
    }

    // Add a submenu entry (hover opens the child menu on desktop). Touch devices have no
    // real hover, so relying on CSS :hover alone (as this used to) is unreliable there: a
    // tap can register as hover without a click ever firing, or leave the hover state stuck
    // since there's no mouseout when the finger lifts. Track visibility explicitly instead.
    addSubmenu(html: string, sub: Menu): HTMLLIElement {
        const li = this.makeLi(html + '<span class="submenuArrow">&#9658;</span>');
        li.classList.add('hasSubmenu');
        li.appendChild(sub.ul);
        this.ul.appendChild(li);

        const openThis = () => {
            for (const sib of Array.from(this.ul.children))
                if (sib !== li) sib.classList.remove('open');
            li.classList.add('open');
        };
        li.addEventListener('mouseover', e => { e.stopPropagation(); openThis(); });
        // stopPropagation here (and on the click below) keeps the document-level "tap
        // elsewhere closes everything" handler from firing on the very tap that opened
        // this submenu -- it should only close on a *later* tap outside the menu.
        li.addEventListener('touchstart', e => { e.stopPropagation(); openThis(); }, { passive: true });
        li.addEventListener('click', e => e.stopPropagation());
        return li;
    }

    addSeparator(): void {
        const sep = document.createElement('li');
        sep.className = 'menuSeparator';
        this.ul.appendChild(sep);
    }

    // Clear all items — used when rebuilding the dynamic Subcircuits submenu.
    clearItems(): void { this.ul.innerHTML = ''; }

    private makeLi(html: string): HTMLLIElement {
        const li = document.createElement('li');
        li.className = 'menuItem';
        li.innerHTML = html;
        return li;
    }
}

// Prefix HTML for submenu headings — mirrors CheckboxMenuItem.checkBoxHtml in the Java.
// A hidden checkmark placeholder keeps heading text aligned with regular items.
// (No &nbsp; after it: .menuItem is a flex container, so the plain space after the
// checkmark in check items collapses away, and a non-breaking space here would indent.)
const subheadHtml = '<span class="checkMark" style="visibility:hidden">&#10003;</span>';

// ---- Main Menus class ----

export class Menus {

    aboutItem                = new MenuItem();
    importFromLocalFileItem  = new MenuItem();
    importFromTextItem       = new MenuItem();
    exportAsUrlItem          = new MenuItem();
    exportAsLocalFileItem    = new MenuItem();
    exportAsTextItem         = new MenuItem();
    printItem                = new MenuItem();
    recoverItem              = new MenuItem();
    saveFileItem             = new MenuItem();
    importFromDropboxItem    = new MenuItem();
    undoItem                 = new MenuItem();
    redoItem                 = new MenuItem();
    cutItem                  = new MenuItem();
    copyItem                 = new MenuItem();
    pasteItem                = new MenuItem();
    selectAllItem            = new MenuItem();
    optionsItem              = new MenuItem();
    rotateCCWItem             = new MenuItem();
    rotateCWItem              = new MenuItem();
    mirrorXItem               = new MenuItem();
    mirrorYItem               = new MenuItem();
    stackAllItem             = new MenuItem();
    unstackAllItem           = new MenuItem();
    combineAllItem           = new MenuItem();
    separateAllItem          = new MenuItem();
    elmEditMenuItem          = new MenuItem();
    elmCutMenuItem           = new MenuItem();
    elmCopyMenuItem          = new MenuItem();
    elmDeleteMenuItem        = new MenuItem();
    elmScopeMenuItem         = new MenuItem();
    elmFloatScopeMenuItem    = new MenuItem();
    elmAddScopeMenuItem      = new MenuItem();
    elmSplitMenuItem         = new MenuItem();
    elmSliderMenuItem        = new MenuItem();
    elmRotateCCWMenuItem     = new MenuItem();
    elmRotateCWMenuItem      = new MenuItem();
    elmMirrorXMenuItem       = new MenuItem();
    elmMirrorYMenuItem       = new MenuItem();
    elmSwapMenuItem          = new MenuItem();
    scopeRemovePlotMenuItem  = new MenuItem();
    scopeSelectYMenuItem     = new MenuItem();

    dotsCheckItem            = new CheckItem(true);
    voltsCheckItem           = new CheckItem(true);
    powerCheckItem           = new CheckItem();
    smallGridCheckItem       = new CheckItem();
    crossHairCheckItem       = new CheckItem();
    dotGridCheckItem         = new CheckItem();   // Levantate Labs: canvas dot grid
    minimapCheckItem         = new CheckItem();   // Levantate Labs: canvas minimap
    dockCheckItem            = new CheckItem();   // Levantate Labs: floating tool dock
    graphsCheckItem          = new CheckItem();   // Levantate Labs: show the scope strip
    sidePanelCheckItem       = new CheckItem();   // Levantate Labs: show the side panel
    showValuesCheckItem      = new CheckItem(true);
    conductanceCheckItem     = new CheckItem();
    euroResistorCheckItem    = new CheckItem();
    showOhmCheckItem         = new CheckItem();
    euroGatesCheckItem       = new CheckItem();
    printableCheckItem       = new CheckItem();
    conventionCheckItem      = new CheckItem(true);
    noEditCheckItem          = new CheckItem();
    mouseWheelEditCheckItem  = new CheckItem(true);
    toolbarCheckItem         = new CheckItem(true);

    menuBar: HTMLElement = document.createElement('nav');
    // right-click context popup — same Draw menu content, built separately
    mainMenuBar: HTMLElement = document.createElement('ul');
    elmMenuBar: HTMLElement = document.createElement('ul');
    subcircuitMenuBar: Menu[] | null = null;

    hideMenu: boolean = false;
    isMac: boolean = false;
    ctrlMetaKey: string = "Ctrl-";

    private app: CirSim;

    constructor(app?: CirSim) {
        this.app = app as CirSim;
    }

    private menuBarRow: HTMLTableRowElement = document.createElement('tr');
    // top-level menu cells by key ("circuit", "edit", ..., "examples"), for exam mode
    topItems: Map<string, HTMLElement> = new Map();
    // Levantate Labs: the app bar the menus sit in (levantate/chrome/appBar.ts)
    appBar: AppBar | null = null;

    init(): void {
        const os = navigator.platform;
        this.isMac = os.toLowerCase().includes("mac");
        this.ctrlMetaKey = this.isMac ? Locale.LS("Cmd-") : Locale.LS("Ctrl-");

        // Wrapper: sized by UIManager (height + flexShrink), holds the abs-positioned bar
        const wrapper = document.createElement('div');
        wrapper.style.position = 'relative';
        this.menuBar = wrapper;

        // Inner bar matches the Java gwt-MenuBar structure
        const bar = document.createElement('div');
        bar.setAttribute('tabindex', '0');
        bar.className = 'gwt-MenuBar gwt-MenuBar-horizontal';
        bar.style.cssText = 'outline: 0; position: absolute; inset: 0;';
        bar.setAttribute('role', 'banner');

        const table = document.createElement('table');
        table.setAttribute('role', 'menubar');
        table.addEventListener('click', () => closeAllMenus());
        const tbody = document.createElement('tbody');
        this.menuBarRow = document.createElement('tr');
        tbody.appendChild(this.menuBarRow);
        table.appendChild(tbody);
        bar.appendChild(table);

        // Hidden focus-trap input (matches Java)
        const focusTrap = document.createElement('input');
        focusTrap.type = 'text';
        focusTrap.tabIndex = -1;
        focusTrap.setAttribute('aria-hidden', 'true');
        focusTrap.style.cssText = 'opacity:0;height:1px;width:1px;z-index:-1;overflow:hidden;position:absolute;';
        bar.appendChild(focusTrap);

        wrapper.appendChild(bar);

        const ck = this.ctrlMetaKey;

        // ---- Circuit menu (upstream's File) ----
        const fileMenu = new Menu(this.app);
        if (this.isElectron())
            fileMenu.addCommand(shortcutHtml("window", "New window", Locale.LS(ck + "N")), "file", "newwindow");

        fileMenu.addCommand(iconHtml("doc-new", "New blank circuit"), "file", "newblankcircuit");

        fileMenu.addMenuItem(this.importFromLocalFileItem,
            shortcutHtml("folder", "Open file…", Locale.LS(ck + "O")), "file", "importfromlocalfile");
        this.importFromLocalFileItem.setEnabled(typeof FileReader !== 'undefined');

        fileMenu.addMenuItem(this.importFromTextItem,
            iconHtml("doc-text", "Open from text…"), "file", "importfromtext");

        if (this.isElectron()) {
            fileMenu.addMenuItem(this.saveFileItem,
                shortcutHtml("floppy", "Save", Locale.LS(ck + "S")), "file", "save");
            fileMenu.addCommand(iconHtml("floppy", "Save as…"), "file", "saveas");
        } else {
            fileMenu.addMenuItem(this.exportAsLocalFileItem,
                shortcutHtml("floppy", "Save to this device…", Locale.LS(ck + "S")), "file", "exportaslocalfile");
            this.exportAsLocalFileItem.setEnabled("download" in document.createElement("a"));
        }

        const exportMenu = new Menu(this.app);
        exportMenu.addCommand(iconHtml("image", "Image (PNG)…"),               "file", "exportasimage");
        exportMenu.addCommand(iconHtml("image", "Copy image to clipboard"),    "file", "copypng");
        exportMenu.addCommand(iconHtml("image", "Vector image (SVG)…"),        "file", "exportassvg");
        exportMenu.addMenuItem(this.exportAsTextItem,
            iconHtml("export", "Circuit as text…"), "file", "exportastext");
        exportMenu.addMenuItem(this.exportAsUrlItem,
            iconHtml("export", "Link to this circuit…"), "file", "exportasurl");
        fileMenu.addSubmenu(subheadHtml + Locale.LS("Export"), exportMenu);
        fileMenu.addSeparator();
        fileMenu.addCommand(iconHtml("magic", "Solve DC operating point"),            "file", "dcanalysis");
        fileMenu.addMenuItem(this.recoverItem,
            iconHtml("back-in-time", "Restore last session"), "file", "recover");
        fileMenu.addSeparator();
        fileMenu.addCommand(iconHtml("resize-full-alt", "Full screen"), "view", "fullscreen");
        fileMenu.addMenuItem(this.aboutItem, iconHtml("info-circled", "About and licence"), "file", "about");
        // (Print, Dropbox and Create Subcircuit leave this menu: printing is in
        // the browser, there's no Dropbox in this fork, subcircuits are in Parts)

        // ---- Edit menu ----
        const editMenu = new Menu(this.app);
        editMenu.addMenuItem(this.undoItem,      shortcutHtml("reply",      "Undo",       Locale.LS(ck + "Z")), "edit", "undo");
        editMenu.addMenuItem(this.redoItem,      shortcutHtml("forward",    "Redo",       Locale.LS(ck + "Y")), "edit", "redo");
        editMenu.addSeparator();
        editMenu.addMenuItem(this.cutItem,       shortcutHtml("scissors",   "Cut",        Locale.LS(ck + "X")), "edit", "cut");
        editMenu.addMenuItem(this.copyItem,      shortcutHtml("copy",       "Copy",       Locale.LS(ck + "C")), "edit", "copy");
        editMenu.addMenuItem(this.pasteItem,     shortcutHtml("paste",      "Paste",      Locale.LS(ck + "V")), "edit", "paste");
        editMenu.addCommand( shortcutHtml("clone",      "Duplicate",   Locale.LS(ck + "D")), "edit", "duplicate");
        editMenu.addCommand( shortcutHtml("none", "Delete",     Locale.LS("Del")),   "edit", "delete");
        editMenu.addMenuItem(this.selectAllItem, shortcutHtml("select-all", "Select all", Locale.LS(ck + "A")), "edit", "selectAll");
        editMenu.addSeparator();
        editMenu.addMenuItem(this.rotateCCWItem,  iconHtml("ccw",    "Rotate left"),        "edit", "rotateCCW");
        editMenu.addMenuItem(this.rotateCWItem,   iconHtml("cw",     "Rotate right"),       "edit", "rotateCW");
        editMenu.addMenuItem(this.mirrorXItem,    iconHtml("flip-x", "Flip horizontally"),  "edit", "mirrorX");
        editMenu.addMenuItem(this.mirrorYItem,    iconHtml("flip-y", "Flip vertically"),    "edit", "mirrorY");
        editMenu.addSeparator();
        editMenu.addCommand(shortcutHtml("search", "Search parts and commands…", "/"),  "edit", "search");
        editMenu.addCommand(iconHtml("target", Locale.weAreInUS(false) ? "Center the circuit" : "Centre the circuit"), "edit", "centercircuit");
        editMenu.addCommand(iconHtml("none", "Convert wires to routed wires"), "tools", "convertWires");

        // ---- Parts menu (upstream's Draw) + right-click popup (same content, built twice) ----
        const drawMenu = new Menu(this.app);
        const popupMenu = new Menu(this.app);
        this.subcircuitMenuBar = [new Menu(this.app), new Menu(this.app)];
        this.composeMainMenu(popupMenu, 0);
        this.composeMainMenu(drawMenu,  1);
        this.mainMenuBar = popupMenu.ul;

        // ---- Graphs menu (upstream's Scopes) ----
        const scopesMenu = new Menu(this.app);
        scopesMenu.addMenuItem(this.stackAllItem,    iconHtml("lines",          "Stack all graphs"),    "scopes", "stackAll");
        scopesMenu.addMenuItem(this.unstackAllItem,  iconHtml("columns",        "Unstack graphs"),      "scopes", "unstackAll");
        scopesMenu.addMenuItem(this.combineAllItem,  iconHtml("object-group",   "Overlay all graphs"),  "scopes", "combineAll");
        scopesMenu.addMenuItem(this.separateAllItem, iconHtml("object-ungroup", "Separate graphs"),     "scopes", "separateAll");

        // ---- View menu (the everyday half of upstream's Options) ----
        // The other options keep their state objects and commands (set here and in
        // UIManager) and are toggled from View › Settings (levantate/chrome/settings.ts).
        const optMenu = new Menu(this.app);
        optMenu.addCheckItem(this.dotsCheckItem, "Current dots");
        optMenu.addCheckItem(this.voltsCheckItem, "Voltage colours");
        this.voltsCheckItem.setCommand({ execute: () => {
            if (this.voltsCheckItem.getState()) this.powerCheckItem.setState(false);
            this.app.setPowerBarEnable();
        }});
        optMenu.addCheckItem(this.powerCheckItem, "Power view");
        this.powerCheckItem.setCommand({ execute: () => {
            if (this.powerCheckItem.getState()) this.voltsCheckItem.setState(false);
            this.app.setPowerBarEnable();
        }});
        optMenu.addCheckItem(this.showValuesCheckItem, "Values on parts");
        //optMenu.addCheckItem(this.conductanceCheckItem, "Show Conductance");
        optMenu.addSeparator();
        optMenu.addCheckItem(this.dotGridCheckItem, "Dot grid");
        this.dotGridCheckItem.setCommand({ execute: () => {
            this.app.ui?.setOptionInStorage("dotGrid", this.dotGridCheckItem.getState());
            this.app.repaint();
        } });
        optMenu.addCheckItem(this.graphsCheckItem, "Graphs");
        this.graphsCheckItem.setCommand({ execute: () => this.app.ui?.setGraphsShown(this.graphsCheckItem.getState()) });
        optMenu.addCheckItem(this.sidePanelCheckItem, "Inspector");
        this.sidePanelCheckItem.setCommand({ execute: () => this.app.ui?.setSidePanelShown(this.sidePanelCheckItem.getState()) });
        optMenu.addCheckItem(this.toolbarCheckItem, "Action bar");
        this.toolbarCheckItem.setCommand({ execute: () => this.app.ui?.setToolbar() });
        optMenu.addCheckItem(this.dockCheckItem, "Tool dock");
        this.dockCheckItem.setCommand({ execute: () => {
            this.app.ui?.setOptionInStorage("dock", this.dockCheckItem.getState());
            this.app.repaint();
        } });
        optMenu.addCheckItem(this.minimapCheckItem, "Minimap");
        this.minimapCheckItem.setCommand({ execute: () => {
            this.app.ui?.setOptionInStorage("minimap", this.minimapCheckItem.getState());
            this.app.repaint();
        } });
        optMenu.addSeparator();
        optMenu.addCheckItem(this.printableCheckItem, "Light theme");
        optMenu.addSeparator();
        optMenu.addCommand(subheadHtml + Locale.LS("Settings…"), "options", "settings");
        optMenu.addCommand(subheadHtml + Locale.LS("Keyboard shortcuts…"), "options", "shortcuts");
        if (this.isElectron())
            optMenu.addCommand(subheadHtml + Locale.LS("Developer tools"), "options", "devtools");
        this.smallGridCheckItem.setCommand({ execute: () => this.app.setGrid() });
        this.crossHairCheckItem.setCommand({ execute: () =>
            this.app.ui?.setOptionInStorage("crossHair", this.crossHairCheckItem.getState()) });
        this.mouseWheelEditCheckItem.setCommand({ execute: () =>
            this.app.ui?.setOptionInStorage("mouseWheelEdit", this.mouseWheelEditCheckItem.getState()) });

        // ---- Assemble the menus ----
        this.topItems.set("circuit", this.addTopItem(this.menuBarRow, Locale.LS("Circuit"), fileMenu));
        this.topItems.set("edit",    this.addTopItem(this.menuBarRow, Locale.LS("Edit"),    editMenu));
        this.topItems.set("parts",   this.addTopItem(this.menuBarRow, Locale.LS("Parts"),   drawMenu));
        this.topItems.set("graphs",  this.addTopItem(this.menuBarRow, Locale.LS("Graphs"),  scopesMenu));
        this.topItems.set("view",    this.addTopItem(this.menuBarRow, Locale.LS("View"),    optMenu));
        // (Examples is added when the list loads: processSetupList)

        // ---- The app bar around them ----
        this.appBar = new AppBar({
            search: () => this.app.commands.menuPerformed("edit", "search"),
            toggleTheme: () => { this.printableCheckItem.toggle(); this.app.repaint(); },
            isDark: () => !this.printableCheckItem.getState(),
        }, bar, table);

        // ---- Element right-click context menu ----
        this.buildElmMenuBar();

        // Close any open dropdown when clicking outside the menu bar. Also listen for
        // touchstart: the canvas's own touchstart handler calls preventDefault() (needed
        // for its drag/pinch gestures), which suppresses the browser's synthetic click for
        // that tap -- so on touch devices, tapping the canvas to dismiss an open menu would
        // otherwise never reach this listener via 'click' at all. touchstart still bubbles
        // here fine since preventDefault() doesn't stop propagation; menu items that open
        // something on their own touchstart (e.g. addSubmenu) call stopPropagation() so
        // that doesn't also trigger this and immediately close what it just opened.
        document.addEventListener('click', () => closeAllMenus());
        document.addEventListener('touchstart', () => closeAllMenus(), { passive: true });
    }

    // this is called twice, once for the Draw menu, once for the right mouse popup menu
    composeMainMenu(menu: Menu, num: number): void {
        this.makeClassCheckItems(menu, [
            "Add Wire",         "WireElm",
            "Add Routed Wire",  "RoutedWireElm",
            "Add Resistor",     "ResistorElm",
        ]);

        const passMenu = new Menu(this.app);
        this.makeClassCheckItems(passMenu, [
            "Add Capacitor",                "CapacitorElm",
            "Add Capacitor (polarized)",    "PolarCapacitorElm",
            "Add Inductor",                 "InductorElm",
            "Add Switch",                   "SwitchElm",
            "Add Push Switch",              "PushSwitchElm",
            "Add SPDT Switch",              "Switch2Elm",
            "Add DPDT Switch",              "DPDTSwitchElm",
            "Add Make-Before-Break Switch", "MBBSwitchElm",
            "Add Potentiometer",            "PotElm",
            "Add Transformer",              "TransformerElm",
            "Add Tapped Transformer",       "TappedTransformerElm",
            "Add Custom Transformer",       "CustomTransformerElm",
            "Add Transmission Line",        "TransLineElm",
            "Add Relay",                    "RelayElm",
            "Add Relay Coil",               "RelayCoilElm",
            "Add Relay Contact",            "RelayContactElm",
            "Add Photoresistor",            "LDRElm",
            "Add Thermistor",               "ThermistorNTCElm",
            "Add Memristor",               "MemristorElm",
            "Add Spark Gap",               "SparkGapElm",
            "Add Fuse",                    "FuseElm",
            "Add Crystal",                 "CrystalElm",
            "Add Cross Switch",            "CrossSwitchElm",
            "Add Gyrator",                 "GyratorElm",
        ]);
        menu.addSubmenu(subheadHtml + Locale.LS("Passive parts and switches"), passMenu);

        const inputMenu = new Menu(this.app);
        this.makeClassCheckItems(inputMenu, [
            "Add Ground",                           "GroundElm",
            "Add Voltage Source (2-terminal)",      "DCVoltageElm",
            "Add Battery",                          "BatteryElm",
            "Add A/C Voltage Source (2-terminal)",  "ACVoltageElm",
            "Add Voltage Source (1-terminal)",      "RailElm",
            "Add A/C Voltage Source (1-terminal)",  "ACRailElm",
            "Add Square Wave Source (1-terminal)",  "SquareRailElm",
            "Add Clock",                            "ClockElm",
            "Add A/C Sweep",                        "SweepElm",
            "Add Variable Voltage",                 "VarRailElm",
            "Add Antenna",                          "AntennaElm",
            "Add AM Source",                        "AMElm",
            "Add FM Source",                        "FMElm",
            "Add Current Source",                   "CurrentElm",
            "Add Noise Generator",                  "NoiseElm",
            "Add Audio Input",                      "AudioInputElm",
            "Add Data Input",                       "DataInputElm",
            "Add External Voltage (JavaScript)",    "ExtVoltageElm",
        ]);
        menu.addSubmenu(subheadHtml + Locale.LS("Sources"), inputMenu);

        const outputMenu = new Menu(this.app);
        this.makeClassCheckItems(outputMenu, [
            "Add Analog Output",              "OutputElm",
            "Add LED",                        "LEDElm",
            "Add Lamp",                       "LampElm",
            "Add Text",                       "TextElm",
            "Add Box",                        "BoxElm",
            "Add Line",                       "LineElm",
            "Add Labeled Node",               "LabeledNodeElm",
            "Add Voltmeter/Scope Probe",      "ProbeElm",
            "Add Ohmmeter",                   "OhmMeterElm",
            "Add Ammeter",                    "AmmeterElm",
            "Add Wattmeter",                  "WattmeterTrueElm",
            "Add Test Point",                 "TestPointElm",
            "Add Grading Point",              "GradePointElm",
            "Add Decimal Display",            "DecimalDisplayElm",
            "Add Instruction Display",        "InstructionDisplayElm",
            "Add LED Array",                  "LEDArrayElm",
            "Add Dot Matrix Display",         "DotMatrixElm",
            "Add Data Export",                "DataRecorderElm",
            "Add Audio Output",               "AudioOutputElm",
            "Add Stop Trigger",               "StopTriggerElm",
            "Add DC Motor",                   "DCMotorElm",
            "Add 3-Phase Motor",              "ThreePhaseMotorElm",
            "Add Wattmeter (old)",            "WattmeterElm",
        ]);
        menu.addSubmenu(subheadHtml + Locale.LS("Meters, displays and labels"), outputMenu);

        // need these registered before unijunction element setup
        this.app.register("CCVSElm", this.app.constructElement("CCVSElm", 0, 0));
        this.app.register("VCCSElm", this.app.constructElement("VCCSElm", 0, 0));

        const activeMenu = new Menu(this.app);
        this.makeClassCheckItems(activeMenu, [
            "Add Diode",                          "DiodeElm",
            "Add Zener Diode",                    "ZenerElm",
            "Add Transistor (bipolar, NPN)",      "NTransistorElm",
            "Add Transistor (bipolar, PNP)",      "PTransistorElm",
            "Add MOSFET (N-Channel)",             "NMosfetElm",
            "Add MOSFET (P-Channel)",             "PMosfetElm",
            "Add JFET (N-Channel)",               "NJfetElm",
            "Add JFET (P-Channel)",               "PJfetElm",
            "Add SCR",                            "SCRElm",
            "Add DIAC",                           "DiacElm",
            "Add TRIAC",                          "TriacElm",
            "Add Darlington Pair (NPN)",          "NDarlingtonElm",
            "Add Darlington Pair (PNP)",          "PDarlingtonElm",
            "Add Varactor/Varicap",               "VaractorElm",
            "Add Tunnel Diode",                   "TunnelDiodeElm",
            "Add Triode",                         "TriodeElm",
            "Add Unijunction Transistor",         "UnijunctionElm",
        ]);
        menu.addSubmenu(subheadHtml + Locale.LS("Semiconductors"), activeMenu);

        // do these later so all the other elements are added to the map first
        const activeBlocMenu = new Menu(this.app);
        this.makeClassCheckItems(activeBlocMenu, [
            "Add Op Amp (ideal, - on top)",                   "OpAmpElm",
            "Add Op Amp (ideal, + on top)",                   "OpAmpSwapElm",
            "Add Op Amp (real)",                              "OpAmpRealElm",
            "Add Analog Switch (SPST)",                       "AnalogSwitchElm",
            "Add Analog Switch (SPDT)",                       "AnalogSwitch2Elm",
            "Add Analog Multiplexer",                         "AnalogMuxElm",
            "Add Tristate Buffer",                            "TriStateElm",
            "Add Schmitt Trigger",                            "SchmittElm",
            "Add Schmitt Trigger (Inverting)",                "InvertingSchmittElm",
            "Add Delay Buffer",                               "DelayBufferElm",
            "Add CCII+",                                      "CC2Elm",
            "Add CCII-",                                      "CC2NegElm",
            "Add Comparator (Hi-Z/GND output)",               "ComparatorElm",
            "Add OTA (LM13700 style)",                        "OTAElm",
            "Add Norton Amp (LM3900)",                        "NortonAmpElm",
            "Add Controlled Voltage Source (2-terminal)",                  "ControlledVoltageElm",
            "Add Controlled Current Source (2-terminal)",                  "ControlledCurrentElm",
            "Add Voltage-Controlled Voltage Source (VCVS)",  "VCVSElm",
            "Add Voltage-Controlled Current Source (VCCS)",  "VCCSElm",
            "Add Current-Controlled Voltage Source (CCVS)",  "CCVSElm",
            "Add Current-Controlled Current Source (CCCS)",  "CCCSElm",
            "Add Optocoupler",                                "OptocouplerElm",
            "Add Time Delay Relay",                           "TimeDelayRelayElm",
            "Add LM317",                                      "SubcircuitElm:~LM317-v2",
            "Add TL431",                                      "SubcircuitElm:~TL431",
            "Add Motor Protection Switch",                    "MotorProtectionSwitchElm",
            "Add Subcircuit Instance",                        "SubcircuitElm",
        ]);
        menu.addSubmenu(subheadHtml + Locale.LS("Op amps and building blocks"), activeBlocMenu);

        const gateMenu = new Menu(this.app);
        this.makeClassCheckItems(gateMenu, [
            "Add Logic Input",  "LogicInputElm",
            "Add Logic Output", "LogicOutputElm",
            "Add Bus Input",    "BusLogicInputElm",
            "Add Inverter",     "InverterElm",
            "Add NAND Gate",    "NandGateElm",
            "Add NOR Gate",     "NorGateElm",
            "Add AND Gate",     "AndGateElm",
            "Add OR Gate",      "OrGateElm",
            "Add XOR Gate",     "XorGateElm",
            "Add XNOR Gate",    "XnorGateElm",
        ]);
        menu.addSubmenu(subheadHtml + Locale.LS("Logic gates"), gateMenu);

        const chipMenu = new Menu(this.app);
        this.makeClassCheckItems(chipMenu, [
            "Add D Flip-Flop",          "DFlipFlopElm",
            "Add JK Flip-Flop",         "JKFlipFlopElm",
            "Add T Flip-Flop",          "TFlipFlopElm",
            "Add 7 Segment LED",        "SevenSegElm",
            "Add 7 Segment Decoder",    "SevenSegDecoderElm",
            "Add Multiplexer",          "MultiplexerElm",
            "Add Demultiplexer",        "DeMultiplexerElm",
            "Add SIPO shift register",  "SipoShiftElm",
            "Add PISO shift register",  "PisoShiftElm",
            "Add Counter",              "CounterElm",
            "Add Counter w/ Load",      "Counter2Elm",
            "Add Ring Counter",         "DecadeElm",
            "Add Latch/Register",       "LatchElm",
            "Add Sequence generator",   "SeqGenElm",
            "Add Adder",                "FullAdderElm",
            "Add Half Adder",           "HalfAdderElm",
            "Add Custom Logic",         "UserDefinedLogicElm",  // don't change this, it will break people's saved shortcuts
            "Add Static RAM",           "SRAMElm",
            "Add ROM",                  "ROMElm",
            "Add Bus Transceiver",      "BusTransceiverElm",
            "Add Bus Splitter",         "BusSplitterElm",
        ]);
        menu.addSubmenu(subheadHtml + Locale.LS("Digital chips and memory"), chipMenu);

        const achipMenu = new Menu(this.app);
        this.makeClassCheckItems(achipMenu, [
            "Add 555 Timer",        "TimerElm",
            "Add Phase Comparator", "PhaseCompElm",
            "Add DAC",              "DACElm",
            "Add ADC",              "ADCElm",
            "Add VCO",              "VCOElm",
            "Add Monostable",       "MonostableElm",
        ]);
        menu.addSubmenu(subheadHtml + Locale.LS("Mixed-signal chips"), achipMenu);

        menu.addSubmenu(subheadHtml + Locale.LS("Subcircuits"), this.subcircuitMenuBar![num]);
        if (num === 1) {
            menu.addCommand(subheadHtml + Locale.LS("Create a subcircuit…"), "file", "createsubcircuit");
            menu.addCommand(subheadHtml + Locale.LS("Manage subcircuits…"), "tools", "subcircuits");
        }

        // tools (Drag Row, Column and Post stay on their keyboard modifiers)
        menu.addSeparator();
        let mi: any;
        mi = this.getClassCheckItem(Locale.LS("Select"), "Select");
        mi.setShortcut(Locale.LS("Esc"));
        menu.addCheckboxItem(mi);
        mi = this.getClassCheckItem(Locale.LS("Pan the view"), "DragAll");
        mi.setShortcut(Locale.LS("Space-drag"));
        menu.addCheckboxItem(mi);
        mi = this.getClassCheckItem(Locale.LS("Move the selection"), "DragSelected");
        menu.addCheckboxItem(mi);
    }

    makeClassCheckItems(menu: Menu, items: string[]): void {
        for (let i = 0; i < items.length; i += 2)
            menu.addCheckboxItem(this.getClassCheckItem(Locale.LS(items[i]), items[i + 1]));
    }

    getClassCheckItem(s: string, t: string): any {
        return this.app.ui.getClassCheckItem(s, t);
    }

    isElectron(): boolean { return (CirSim as any).isElectron?.() ?? false; }

    // Load the built-in circuits list from the server and build the Circuits menu.
    // Uses fetch() instead of GWT's RequestBuilder.
    getSetupList(openDefault: boolean): void {
        const url = moduleBaseURL + 'setuplist.txt';
        fetch(url)
            .then(r => {
                if (!r.ok) {
                    CirSim.console("Can't load circuit list!");
                    return null;
                }
                return r.text();
            })
            .then(text => { if (text) this.processSetupList(text, openDefault); })
            .catch(() => { CirSim.console("Can't load circuit list!"); });
    }

    processSetupList(text: string, openDefault: boolean): void {
        const lines = text.split(/\r?\n/);
        const stack: Menu[] = [];
        const submenuStack: string[] = [""]; // submenu titles for palette circuit hints
        let currentMenu = new Menu(this.app);
        const circuitsTop = this.addTopItem(this.menuBarRow, Locale.LS("Examples"), currentMenu);
        this.topItems.set("examples", circuitsTop);
        // (the examples list loads after startup, possibly after an exam began)
        if (Exam.active)
            circuitsTop.classList.add("lvHidden");
        stack.push(currentMenu);

        for (const line of lines) {
            if (!line || line[0] === '#') continue;
            if (line[0] === '+') {
                const sub = new Menu(this.app);
                currentMenu.addSubmenu(Locale.LS(line.substring(1)), sub);
                currentMenu = sub;
                stack.push(currentMenu);
                submenuStack.push(line.substring(1));
            } else if (line[0] === '-') {
                stack.pop();
                currentMenu = stack[stack.length - 1];
                submenuStack.pop();
            } else {
                const sp = line.indexOf(' ');
                if (sp > 0) {
                    const first = line[0] === '>';
                    const file  = line.substring(first ? 1 : 0, sp);
                    const title = Locale.LS(line.substring(sp + 1));
                    currentMenu.addCommand(title, "circuits", "setup " + file + " " + title);
                    // Also searchable from the command palette (query length >= 2).
                    CommandPaletteRegistry.registerCircuit(file, title, submenuStack[submenuStack.length - 1]);

                    const app = this.app as any;
                    if (file === app.startCircuit && app.startLabel == null) {
                        app.startLabel = title;
                        this.app.setCircuitTitle(title);
                    }
                    if (first && app.startCircuit == null) {
                        const opening = openDefault && this.app.stopMessage == null;
                        const start = welcomeStartCircuit(file, title, opening);
                        app.startCircuit = start.file;
                        app.startLabel   = Locale.LS(start.title);
                        if (opening)
                            this.readSetupFile(app.startCircuit, app.startLabel);
                    }
                }
            }
        }
    }

    readSetupFile(str: string, title: string | null): void {
        console.log(str);
        (this.app as any).resetEditingContext?.();
        // don't avoid caching here, it's unnecessary and makes offline PWA's not work
        const url = moduleBaseURL + 'circuits/' + str;
        (this.app as any).loader?.loadFileFromURL(url);
        if (title != null)
            this.app.setCircuitTitle(title);
        this.app.unsavedChanges = false;
        this.app.savedFlag = true;
    }

    // ---- Private helpers ----

    // Add a top-level item to the horizontal menu bar (clicking toggles the dropdown).
    private addTopItem(row: HTMLTableRowElement, label: string, menu: Menu): HTMLElement {
        const td = document.createElement('td');
        td.className = 'gwt-MenuItem';
        td.setAttribute('role', 'menuitem');
        td.setAttribute('aria-haspopup', 'true');
        td.textContent = label;

        td.addEventListener('click', e => {
            e.stopPropagation();
            const wasOpen = td.classList.contains('open');
            closeAllMenus();
            if (!wasOpen) td.classList.add('open');
        });

        td.addEventListener('mouseover', e => {
            if (anyMenuOpen()) {
                closeAllMenus();
                td.classList.add('open');
            }
        });

        td.appendChild(menu.ul);
        row.appendChild(td);
        return td;
    }

    // Build the element right-click context menu.
    private buildElmMenuBar(): void {
        const ul = document.createElement('ul');
        ul.className = 'menuDropdown elmContextMenu';
        this.elmMenuBar = ul;

        const m = new Menu(this.app);
        m.ul = ul;

        m.addMenuItem(this.elmEditMenuItem,       Locale.LS("Edit..."),                  "elm", "edit");
        m.addMenuItem(this.elmScopeMenuItem,      Locale.LS("View in New Scope"),        "elm", "viewInScope");
        m.addMenuItem(this.elmFloatScopeMenuItem, Locale.LS("View in New Undocked Scope"), "elm", "viewInFloatScope");
        m.addMenuItem(this.elmAddScopeMenuItem,   Locale.LS("Add to Existing Scope"),    "elm", "addToScope0");
        m.addMenuItem(this.elmCutMenuItem,        Locale.LS("Cut"),                      "elm", "cut");
        m.addMenuItem(this.elmCopyMenuItem,       Locale.LS("Copy"),                     "elm", "copy");
        m.addMenuItem(this.elmDeleteMenuItem,     Locale.LS("Delete"),                   "elm", "delete");
        m.addCommand(                             Locale.LS("Duplicate"),                "elm", "duplicate");
        m.addMenuItem(this.elmSwapMenuItem,       Locale.LS("Swap Terminals"),           "elm", "flip");
        m.addMenuItem(this.elmMirrorXMenuItem,    Locale.LS("Mirror X"),                 "elm", "mirrorX");
        m.addMenuItem(this.elmMirrorYMenuItem,    Locale.LS("Mirror Y"),                 "elm", "mirrorY");
        m.addMenuItem(this.elmRotateCCWMenuItem,  Locale.LS("Rotate CCW"),               "elm", "rotateCCW");
        m.addMenuItem(this.elmRotateCWMenuItem,   Locale.LS("Rotate CW"),                "elm", "rotateCW");
        m.addMenuItem(this.elmSplitMenuItem,      shortcutHtml("", "Split Wire Manually", Locale.LS(this.ctrlMetaKey + "click")), "elm", "split");
        m.addMenuItem(this.elmSliderMenuItem,     Locale.LS("Sliders..."),               "elm", "sliders");
    }
}
