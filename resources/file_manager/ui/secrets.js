// The Secrets tab (Find & more → Secrets): a password manager and secure notes in one encrypted vault. This file owns the
// frame: which screen shows (create wizard, unlock, or the vault), the toolbar and the keyboard. The list, the detail,
// the editor, the dialogs and the status pill are in the secrets*.js modules and talk through events.
import { announce, h } from "./dom.js";
import { confirmBox } from "./dialogs.js";
import { call } from "./api.js";
import { showMenu, toast } from "./menus.js";
import { registerPowerTab } from "./power.js";
import { renderDetail } from "./secretsDetail.js";
import { auditDialog, changePasswordDialog, infoDialog, rekeyDialog, settingsDialog } from "./secretsDialogs.js";
import { renderEditor } from "./secretsEdit.js";
import { copyFromServer, newScope } from "./secretsFields.js";
import { healthDialog } from "./secretsHealth.js";
import { TYPE_NAMES, buildList } from "./secretsList.js";
import { deviceDialog, recoveryDialog } from "./secretsRecovery.js";
import { errorText, lockNow, refreshStatus, setStatus, sx, wipeAll } from "./secretsState.js";
import { noteActivity, startStatusWatch } from "./secretsStatus.js";
import { exportBackupDialog, exportCsvDialog, importDialog } from "./secretsTransfer.js";
import { renderUnlock } from "./secretsUnlock.js";
import { renderWizard } from "./secretsWizard.js";
import { emit, on, state } from "./state.js";
import { isModifier } from "./util.js";

const TYPE_ORDER = ["login", "note", "card", "identity", "api", "wifi", "ssh", "custom"];

registerPowerTab({
  id: "secrets", label: "Secrets", icon: "🗝️", group: "security", tip: "Passwords and secure notes in one encrypted vault",
  mount(root) {
    root.classList.add("secrets-pane");
    root.setAttribute("data-copy", "off");
    const screen = h("div", { class: "sx-screen" });
    root.append(screen);
    let shown = "";
    let cleanup = null;
    let scope = newScope();
    let editing = null;
    let current = null;
    let list = null;
    let detailHost = null;
    let banner = null;
    let emptyTrash = null;
    let shownVia = "";

    async function showDetail(id) {
      scope.dispose();
      scope = newScope();
      editing = null;
      current = null;
      if (!detailHost) return;
      if (!id) {
        detailHost.replaceChildren(h("p", { class: "sx-empty" }, "Select an item on the left, or press “New item”."));
        return;
      }
      current = await renderDetail(detailHost, id, scope);
    }

    async function startEdit(options) {
      scope.dispose();
      scope = newScope();
      current = null;
      editing = options.id ?? "new";
      await renderEditor(detailHost, {
        ...options, scope,
        onDone: (id) => {
          const back = id ?? options.id ?? null;
          editing = null;
          if (id) {
            sx.selectedId = id;
            emit("secrets-items");
          }
          showDetail(back);
        },
      });
    }

    function newItemMenu(anchor) {
      showMenu(TYPE_ORDER.map((t) => ({ label: TYPE_NAMES[t], action: () => startEdit({ type: t }) })), { anchor, label: "New item" });
    }

    async function askEmptyTrash() {
      if (!(await confirmBox({ title: "Empty the Trash?", message: "Everything in the Trash is deleted for good. This can't be undone.", confirmLabel: "Empty the Trash", danger: true }))) return;
      try {
        const res = await call("secrets/empty-trash", { confirm: true });
        toast(`Deleted ${res.removed} item${res.removed === 1 ? "" : "s"} for good.`);
        emit("secrets-items");
      } catch (err) {
        toast(errorText(err), { kind: "error" });
      }
    }

    function moreMenu(anchor) {
      showMenu([
        { label: "Export an encrypted backup…", action: exportBackupDialog },
        { label: "Export as plain text (CSV)…", danger: true, action: exportCsvDialog },
        { separator: true },
        { label: "Change master password…", action: changePasswordDialog },
        { label: "Re-key (strength)…", action: rekeyDialog },
        { label: "Recovery key…", action: recoveryDialog },
        { label: "Unlock with this computer…", action: deviceDialog },
        { separator: true },
        { label: "Empty the Trash…", action: askEmptyTrash },
        { label: "Activity log", action: auditDialog },
        { label: "Vault info", action: infoDialog },
      ], { anchor, label: "More vault actions" });
    }

    const btn = (label, tip, fn, cls = "btn") => h("button", { type: "button", class: cls, title: tip, onclick: (e) => fn(e.currentTarget) }, label);

    function paintBanner() {
      if (!banner) return;
      const s = sx.status;
      banner.replaceChildren();
      banner.hidden = true;
      if (s?.conflict) {
        banner.hidden = false;
        banner.append(h("p", { role: "alert" }, "The vault file was changed on disk by something else (another copy of this program, or a sync tool). Nothing was overwritten."),
          h("div", { class: "sx-row" },
            btn("Keep my open copy", "Save what is open here over the file on disk. The file on disk is kept as backup .1.", async () => { try { setStatus((await call("secrets/resolve", { action: "keep" })).status); toast("Saved over the changed file. The other version is kept as backup .1."); } catch (err) { toast(errorText(err), { kind: "error" }); } }),
            btn("Reload from disk", "Lock the vault and drop what has not been saved, then unlock again to read the file on disk", async () => { sx.userLock = true; try { setStatus((await call("secrets/resolve", { action: "discard" })).status); } catch (err) { sx.userLock = false; toast(errorText(err), { kind: "error" }); } })));
      } else if (s?.via === "recovery") {
        banner.hidden = false;
        banner.append(h("p", { role: "status" }, "You opened the vault with the recovery key. Choose a new master password now."), btn("Change master password…", "Set a new master password", changePasswordDialog, "btn primary"));
      } else if (s?.params?.belowStandard) {
        banner.hidden = false;
        banner.append(h("p", { role: "status" }, "This vault uses lighter key settings than Standard."), btn("Re-key…", "Make guessing the password more expensive", rekeyDialog));
      }
    }

    function renderMain() {
      list = buildList();
      detailHost = h("div", { class: "sx-detail", "aria-live": "off", "data-copy": "off" });
      banner = h("div", { class: "sx-banner", hidden: true });
      emptyTrash = btn("Empty the Trash…", "Delete everything in the Trash for good", askEmptyTrash, "btn danger");
      emptyTrash.hidden = true;
      const toolbar = h("div", { class: "sx-toolbar", role: "toolbar", "aria-label": "Vault actions" },
        btn("New item ▾", "Add a login, note, card or other item", newItemMenu, "btn primary"),
        btn("🔒 Lock now", "Lock the vault right now and forget everything shown (Ctrl+L)", () => lockNow("Vault locked."), "btn sx-lock"),
        btn("Health report", "See weak, reused and old passwords", healthDialog),
        btn("Import…", "Bring in passwords from another program, or restore a backup", () => importDialog()),
        btn("Settings", "Auto-lock, clipboard clearing and more", settingsDialog),
        btn("More ▾", "Backups, master password, recovery key and more", moreMenu),
        emptyTrash);
      screen.replaceChildren(h("div", { class: "sx-main" }, toolbar, banner, h("div", { class: "sx-split" }, list.el, detailHost)));
      paintBanner();
      showDetail(null);
      list.load({ keep: false });
      return () => {
        scope.dispose();
        list.reset();
        detailHost = null;
        list = null;
      };
    }

    async function render() {
      const s = sx.status ?? (await refreshStatus());
      if (!s) {
        screen.replaceChildren(h("p", { class: "sx-empty", role: "alert" }, "Can't reach the File Manager. Close this window and open it again."));
        return;
      }
      const key = !s.exists ? "new" : s.locked ? `locked-${s.valid}-${s.device}-${s.keyFile}-${s.recovery}` : "open";
      if (key === shown) {
        paintBanner();
        return;
      }
      cleanup?.();
      cleanup = null;
      shown = key;
      wipeAll();
      if (!s.exists) renderWizard(screen);
      else if (s.locked) cleanup = renderUnlock(screen, s);
      else cleanup = renderMain();
      screen.querySelector(".sx-title")?.focus?.();
    }

    on("secrets-status", () => {
      if (!root.isConnected) return;
      render();
      if (sx.status?.via !== shownVia && sx.status?.via === "recovery") announce("You opened the vault with the recovery key. Choose a new master password.");
      shownVia = sx.status?.via ?? "";
    });
    on("secrets-select", (id) => {
      if (!detailHost) return;
      if (editing) {
        sx.selectedId = editing === "new" ? null : editing;
        toast("Finish or cancel what you are editing first.");
        return;
      }
      showDetail(id);
    });
    on("secrets-open", () => detailHost?.querySelector("h2")?.focus());
    on("secrets-edit", ({ id }) => startEdit({ id }));
    on("secrets-pick", async (id) => {
      if (!list) return;
      editing = null;
      sx.selectedId = id;
      await list.showAll();
      list.select(id);
    });
    on("secrets-listed", ({ total, trash }) => {
      if (emptyTrash) emptyTrash.hidden = !(trash && total > 0);
    });

    root.addEventListener("keydown", (e) => {
      noteActivity();
      if (sx.status?.locked !== false) return;
      const typing = e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement || e.target instanceof HTMLSelectElement;
      const mod = isModifier(e, state.platform);
      const key = e.key.length === 1 ? e.key.toLowerCase() : e.key;
      if (mod && !e.shiftKey && key === "l") {
        e.preventDefault();
        lockNow("Vault locked.");
      } else if (mod && e.shiftKey && key === "c") {
        e.preventDefault();
        if (current?.type === "login" && current.present.password) copyFromServer(current.id, "password", "Password", null);
        else toast("Select a login with a password first.");
      } else if (e.key === "/" && !typing && !mod) {
        e.preventDefault();
        list?.focusSearch();
      }
    });
    root.addEventListener("pointerdown", noteActivity);
    root.addEventListener("input", noteActivity);

    startStatusWatch();
    return {
      show(opts) {
        refreshStatus().then(() => {
          render();
          if (opts?.restorePath) importDialog({ backupOnly: sx.status?.locked !== false, mode: "backup", path: opts.restorePath });
        });
      },
      hide() {
        wipeAll();
      },
    };
  },
});

// The status pill must be there even before the tab is first opened.
startStatusWatch();
