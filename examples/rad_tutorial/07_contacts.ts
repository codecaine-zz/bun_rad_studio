// RAD tutorial 7: a small finished app (form, table, search, confirm dialog, SQLite).
// Run it with:  bun run examples/rad_tutorial/07_contacts.ts
import { newSimpleWindow, type SimpleWindow } from "../../src/simplegui";
import { rad } from "../../src/features/rad/index.ts";

export function createContacts(dbPath = ":memory:"): SimpleWindow {
  const db = rad.sqliteutils.openDb(dbPath);
  rad.sqliteutils.execSql(db, "CREATE TABLE IF NOT EXISTS contacts " +
    "(id INTEGER PRIMARY KEY, name TEXT, email TEXT)");
  if (!rad.sqliteutils.queryValue(db, "SELECT COUNT(*) FROM contacts")) {
    rad.sqliteutils.insertRow(db, "contacts", { name: "Ada Lovelace", email: "ada@example.com" });
    rad.sqliteutils.insertRow(db, "contacts", { name: "Alan Turing", email: "alan@example.com" });
  }

  const win = newSimpleWindow("Contacts", 940, 640, { theme: "apple_dark" });
  const show = (w: SimpleWindow) => {
    const like = `%${w.getText("txtFilter")}%`;
    const sql = "SELECT id, name, email FROM contacts WHERE name LIKE ? ORDER BY name";
    const rows = rad.sqliteutils.queryAll<any>(db, sql, [like]);
    w.setTableRows("tblContacts", rows.map((r) => [String(r.id), r.name, r.email]));
    w.setStatusBarText(`${rows.length} contacts`);
  };

  win.addHeading("📇 Contacts", "SQLite, a table and four handlers");
  win.addSearchInput("Filter by name...", (w) => show(w)).id("txtFilter").width(320);
  win.addTable("tblContacts", ["Id", "Name", "Email"], [], (w, id) => {
    w.setState("picked", String(id));
  });

  win.beginCard("Add a contact");
  win.addFormField("Name:", "txtName", "");
  win.addFormField("Email:", "txtEmail", "");
  win.beginRow();
  win.addButton("➕ Add", (w) => {
    const name = w.getText("txtName").trim();
    if (!name) return void w.warn("Name needed", "Type a name first.");
    rad.sqliteutils.insertRow(db, "contacts", { name, email: w.getText("txtEmail").trim() });
    w.setText("txtName", "");
    w.setText("txtEmail", "");
    show(w);
    w.toast(`Added ${name}`);
  }).bg("#0284c7").color("#ffffff");
  win.addButton("🗑 Delete the chosen row", async (w) => {
    const id = w.getStateOr("picked", "");
    if (!id) return void w.info("Nothing chosen", "Click a row in the table first.");
    if (await w.ask("Delete this contact?", "Confirm delete")) {
      rad.sqliteutils.execSql(db, "DELETE FROM contacts WHERE id = ?", [Number(id)]);
      w.removeState("picked");
      show(w);
    }
  }).bg("#dc2626").color("#ffffff");
  win.endRow();
  win.endCard();

  win.addStatusBar("Ready");
  show(win);
  return win;
}

if (import.meta.main) createContacts(`${process.env.HOME ?? "."}/contacts.db`).run();
