/**
 * ⚡ Bun RAD Studio Demo 5: Dynamic Table Control & Data Grid Operations
 * 
 * Demonstrates:
 * - Table control (`table`) rendering with initial columns & datasets
 * - Dynamic Row Operations: Add Row, Remove Selected Row, Clear Table, Reset Sample Data
 * - Dynamic Column Operations: Add Column header & cells, Remove Column
 * - Real-Time Row Filtering & Searching
 * - Row Sorting by Column
 * - Interactive Row Selection & Highlight
 * - Real-time KPI Stats updates (Total Rows, Total Columns, Total Payroll)
 * - IPC Event logging for all table actions
 */

import { SizeHint, Webview } from "webview-bun";
import { generatePreviewHtml } from "../index.ts";

const formSpec = {
    title: "Demo 5 - Dynamic Table & Data Grid Control Studio",
    width: 980,
    height: 720,
    background_color: "#0f172a",
    font_color: "#e2e8f0",
    padding: 24,
    spacing: 14,
    controls: [
        // Header Title & Status
        { id: "lblTitle", type: "label", caption: "📊 Dynamic Table & Data Grid Control Studio", left: 24, top: 18, width: 550, height: 28, font_size: 18, font_weight: "700" },
        { id: "lblSub", type: "label", caption: "Interactive dynamic row & column manipulation with real-time state syncing", left: 24, top: 48, width: 550, height: 18, font_size: 11, font_color: "#38bdf8" },

        // KPI Summary Cards
        { id: "metRows", type: "metric_card", text: "Total Rows", value: "5", trend: "+2 this session", left: 590, top: 15, width: 110, height: 55, border_radius: 8 },
        { id: "metCols", type: "metric_card", text: "Total Cols", value: "6", trend: "Standard Schema", left: 710, top: 15, width: 110, height: 55, border_radius: 8 },
        { id: "metBudget", type: "metric_card", text: "Total Payroll", value: "$780k", trend: "Active Team", left: 830, top: 15, width: 120, height: 55, border_radius: 8 },

        // Left Control Panel (Row & Column Data Entry)
        { id: "grpInputs", type: "groupbox", title: "⚙️ Table Data Controls", left: 24, top: 80, width: 240, height: 440 },

        { id: "lblInputName", type: "label", caption: "Full Name:", left: 36, top: 110, width: 100, height: 16, font_size: 11, font_weight: "600" },
        { id: "txtName", type: "input", placeholder: "e.g. Alex Mercer", left: 36, top: 130, width: 216, height: 32 },

        { id: "lblInputRole", type: "label", caption: "Job Role:", left: 36, top: 170, width: 100, height: 16, font_size: 11, font_weight: "600" },
        { id: "txtRole", type: "input", placeholder: "e.g. Senior Architect", left: 36, top: 190, width: 216, height: 32 },

        { id: "lblInputDept", type: "label", caption: "Department:", left: 36, top: 230, width: 100, height: 16, font_size: 11, font_weight: "600" },
        { id: "txtDept", type: "input", placeholder: "e.g. Engineering", left: 36, top: 250, width: 216, height: 32 },

        { id: "lblInputSalary", type: "label", caption: "Salary ($):", left: 36, top: 290, width: 100, height: 16, font_size: 11, font_weight: "600" },
        { id: "txtSalary", type: "input", placeholder: "e.g. 150000", left: 36, top: 310, width: 216, height: 32 },

        { id: "btnAddRow", type: "button", caption: "➕ Add New Row", left: 36, top: 355, width: 216, height: 36, background_color: "#0284c7", font_weight: "700" },
        { id: "btnRemoveRow", type: "button", caption: "➖ Delete Selected Row", left: 36, top: 400, width: 216, height: 32, background_color: "#dc2626" },

        { id: "lblInputCol", type: "label", caption: "Custom Column Name:", left: 36, top: 440, width: 180, height: 16, font_size: 11, font_weight: "600" },
        { id: "txtColName", type: "input", placeholder: "e.g. Location", left: 36, top: 460, width: 130, height: 32 },
        { id: "btnAddCol", type: "button", caption: "📐 Add Col", left: 172, top: 460, width: 80, height: 32, background_color: "#059669", font_weight: "600" },

        { id: "btnRemoveCol", type: "button", caption: "❌ Remove Last Col", left: 36, top: 500, width: 216, height: 32, background_color: "#475569" },

        // Top Table Bar (Search & Table Level Actions)
        { id: "txtSearch", type: "search", placeholder: "🔍 Filter rows by name, role, dept...", left: 280, top: 80, width: 330, height: 36 },
        { id: "btnSort", type: "button", caption: "🔀 Sort (Name)", left: 620, top: 80, width: 105, height: 36, background_color: "#334155" },
        { id: "btnReset", type: "button", caption: "🔄 Reset Data", left: 735, top: 80, width: 105, height: 36, background_color: "#334155" },
        { id: "btnClear", type: "button", caption: "🧹 Clear All", left: 850, top: 80, width: 100, height: 36, background_color: "#991b1b" },

        // Dynamic Table Control
        {
            id: "tblMainGrid",
            type: "table",
            left: 280,
            top: 130,
            width: 670,
            height: 390,
            background_color: "#1e293b",
            border_radius: 8,
            columns: ["ID", "Name", "Role", "Department", "Salary", "Status"],
            rows: [
                ["101", "Alex Mercer", "Lead Architect", "Engineering", "$165,000", "Active"],
                ["102", "Elena Rostova", "Staff Designer", "Design", "$140,000", "Active"],
                ["103", "Marcus Vance", "Product Manager", "Product", "$155,000", "Active"],
                ["104", "Sophia Chen", "Data Scientist", "AI & ML", "$170,000", "Active"],
                ["105", "David Kim", "DevOps Engineer", "Infrastructure", "$150,000", "On Leave"]
            ]
        },

        // Bottom Action Log & Status Panel
        { id: "grpLog", type: "groupbox", title: "⚡ Live Table Control IPC & Event Log", left: 24, top: 535, width: 926, height: 130 },
        { id: "lblLog", type: "label", caption: "🚀 Dynamic Table Control loaded with 5 initial enterprise rows and 6 columns. Click any row or use the controls on the left to test dynamic row/column additions.", left: 40, top: 565, width: 890, height: 80, font_size: 12, font_color: "#38bdf8" }
    ]
};

const html = generatePreviewHtml(formSpec);
const wv = new Webview();
wv.setHTML(html);
wv.title = "Bun RAD Studio - Demo 5: Dynamic Table Control Studio";
wv.size = { width: 980, height: 720, hint: SizeHint.NONE };

function execJS(code: string) {
    try { wv.eval(code); } catch (e) { console.error("JS Error:", e); }
}

let nextId = 106;

// Setup Client-Side Dynamic Table Helper JS Scripts
const setupTableJS = `
(function() {
    window.selectedRowElement = null;

    // Helper: update stats cards
    window.updateTableStats = function() {
        const table = document.querySelector("#tblMainGrid table");
        if (!table) return;
        const totalCols = table.querySelectorAll("thead th").length;
        const totalRows = table.querySelectorAll("tbody tr:not([style*='display: none'])").length;
        
        // Calculate total payroll
        let sum = 0;
        table.querySelectorAll("tbody tr").forEach(tr => {
            const tds = tr.querySelectorAll("td");
            if (tds.length >= 5) {
                const val = parseInt((tds[4].textContent || "").replace(/[^0-9]/g, "")) || 0;
                sum += val;
            }
        });

        const metRows = document.querySelector("#metRows div:nth-child(2)");
        if (metRows) metRows.textContent = totalRows;
        
        const metCols = document.querySelector("#metCols div:nth-child(2)");
        if (metCols) metCols.textContent = totalCols;

        const metBudget = document.querySelector("#metBudget div:nth-child(2)");
        if (metBudget) metBudget.textContent = "$" + Math.round(sum / 1000) + "k";
    };

    // Global row click handler callback
    window.onTableRowClick = function(tr) {
        if (!tr) return;
        const tbody = tr.closest("tbody");
        if (tbody) {
            tbody.querySelectorAll("tr").forEach(r => {
                r.classList.remove("selected-tr");
                r.style.background = "";
            });
        }
        window.selectedRowElement = tr;
        tr.classList.add("selected-tr");
        tr.style.background = "rgba(56, 189, 248, 0.25)";
        
        const cells = Array.from(tr.querySelectorAll("td")).map(td => td.textContent.trim());
        const logMsg = "👉 [Selected Row #" + (cells[0]||"") + "] " + (cells[1]||"") + " (" + (cells[2]||"") + " - " + (cells[3]||"") + " - " + (cells[4]||"") + ")";
        const logLabel = document.getElementById("lblLog");
        if (logLabel) logLabel.textContent = logMsg;
    };

    // Helper: attach click handlers to rows
    window.attachRowHandlers = function() {
        const table = document.querySelector("#tblMainGrid table");
        if (!table) return;
        table.querySelectorAll("tbody tr").forEach(tr => {
            tr.style.cursor = "pointer";
            tr.onclick = function() {
                window.onTableRowClick(this);
            };
            tr.onmouseover = function() {
                if (!this.classList.contains("selected-tr")) {
                    this.style.background = "rgba(255, 255, 255, 0.06)";
                }
            };
            tr.onmouseout = function() {
                if (!this.classList.contains("selected-tr")) {
                    this.style.background = "";
                }
            };
        });
    };

    window.attachRowHandlers();
    window.updateTableStats();
})();
`;

// Inject setup JS after HTML is rendered
setTimeout(() => {
    execJS(setupTableJS);
}, 200);

// 1. Add Row Handler
wv.bind("on_btnAddRow_click", () => {
    console.log("⚡ [IPC] on_btnAddRow_click");
    execJS(`
        (function() {
            const table = document.querySelector("#tblMainGrid table tbody");
            if (!table) return;
            
            const name = (document.getElementById("txtName").value || "").trim() || "New Member " + (${nextId});
            const role = (document.getElementById("txtRole").value || "").trim() || "Software Engineer";
            const dept = (document.getElementById("txtDept").value || "").trim() || "Engineering";
            let rawSal = (document.getElementById("txtSalary").value || "").trim();
            if (rawSal && !rawSal.startsWith("$")) rawSal = "$" + parseInt(rawSal).toLocaleString();
            const salary = rawSal || "$135,000";
            const status = "Active";
            const rowId = String(${nextId++});

            const colCount = document.querySelectorAll("#tblMainGrid table thead th").length;
            let trHtml = "<tr style='border-bottom:1px solid rgba(255,255,255,0.12);cursor:pointer;transition:background 0.12s;'>";
            
            const values = [rowId, name, role, dept, salary, status];
            for (let i = 0; i < colCount; i++) {
                const val = values[i] !== undefined ? values[i] : "—";
                trHtml += "<td style='padding:8px 12px;'>" + val + "</td>";
            }
            trHtml += "</tr>";

            table.insertAdjacentHTML("beforeend", trHtml);
            window.attachRowHandlers();
            window.updateTableStats();

            // Clear inputs
            document.getElementById("txtName").value = "";
            document.getElementById("txtRole").value = "";
            document.getElementById("txtDept").value = "";
            document.getElementById("txtSalary").value = "";

            const log = "✅ [Added Row #" + rowId + "] " + name + " (" + role + ", " + dept + " - " + salary + ")";
            document.getElementById("lblLog").textContent = log;
        })();
    `);
});

// 2. Remove Selected Row Handler
wv.bind("on_btnRemoveRow_click", () => {
    console.log("⚡ [IPC] on_btnRemoveRow_click");
    execJS(`
        (function() {
            const tbody = document.querySelector("#tblMainGrid table tbody");
            if (!tbody) return;

            let trToDelete = tbody.querySelector("tr.selected-tr") 
                          || (window.selectedRowElement && window.selectedRowElement.parentNode === tbody ? window.selectedRowElement : null);

            if (!trToDelete) {
                const trs = tbody.querySelectorAll("tr");
                if (trs.length > 0) trToDelete = trs[trs.length - 1];
            }

            if (trToDelete) {
                const cells = trToDelete.querySelectorAll("td");
                const rowId = cells.length > 0 ? cells[0].textContent : "";
                const name = cells.length > 1 ? cells[1].textContent : "Row";
                trToDelete.remove();
                window.selectedRowElement = null;
                window.updateTableStats();

                document.getElementById("lblLog").textContent = "🗑️ [Removed Row #" + rowId + "] Deleted " + name + " from table.";
            } else {
                document.getElementById("lblLog").textContent = "⚠️ [Table Empty] No rows available to remove.";
            }
        })();
    `);
});

// 3. Add Column Handler
wv.bind("on_btnAddCol_click", () => {
    console.log("⚡ [IPC] on_btnAddCol_click");
    execJS(`
        (function() {
            const colInput = document.getElementById("txtColName");
            const colName = (colInput.value || "").trim() || "Location";
            
            const headerRow = document.querySelector("#tblMainGrid table thead tr");
            if (!headerRow) return;

            // Add Header
            const th = document.createElement("th");
            th.style.cssText = "padding:8px 12px;text-align:left;font-weight:700;color:#38bdf8;border-bottom:1px solid rgba(255,255,255,0.12);";
            th.textContent = colName;
            headerRow.appendChild(th);

            // Add Cell to each body row
            const bodyRows = document.querySelectorAll("#tblMainGrid table tbody tr");
            const defaultVals = ["San Francisco", "New York", "Austin", "Remote", "Seattle", "London"];
            bodyRows.forEach((tr, idx) => {
                const td = document.createElement("td");
                td.style.cssText = "padding:8px 12px;";
                td.textContent = defaultVals[idx % defaultVals.length];
                tr.appendChild(td);
            });

            colInput.value = "";
            window.updateTableStats();
            document.getElementById("lblLog").textContent = "📐 [Added Column] Appended dynamic column '" + colName + "' to table header and all rows.";
        })();
    `);
});

// 4. Remove Column Handler
wv.bind("on_btnRemoveCol_click", () => {
    console.log("⚡ [IPC] on_btnRemoveCol_click");
    execJS(`
        (function() {
            const headers = document.querySelectorAll("#tblMainGrid table thead th");
            if (headers.length <= 1) {
                document.getElementById("lblLog").textContent = "⚠️ Cannot remove primary ID column.";
                return;
            }

            const lastColIdx = headers.length - 1;
            const removedTitle = headers[lastColIdx].textContent;
            headers[lastColIdx].remove();

            const bodyRows = document.querySelectorAll("#tblMainGrid table tbody tr");
            bodyRows.forEach(tr => {
                const tds = tr.querySelectorAll("td");
                if (tds[lastColIdx]) tds[lastColIdx].remove();
            });

            window.updateTableStats();
            document.getElementById("lblLog").textContent = "❌ [Removed Column] Dropped column '" + removedTitle + "' from table schema.";
        })();
    `);
});

// 5. Filter Search Bar Handler
wv.bind("on_txtSearch_change", (val: any) => {
    console.log("⚡ [IPC] on_txtSearch_change:", val);
    execJS(`
        (function() {
            const query = (document.getElementById("txtSearch").value || "").toLowerCase();
            const bodyRows = document.querySelectorAll("#tblMainGrid table tbody tr");
            let matchCount = 0;

            bodyRows.forEach(tr => {
                const text = tr.textContent.toLowerCase();
                if (text.includes(query)) {
                    tr.style.display = "";
                    matchCount++;
                } else {
                    tr.style.display = "none";
                }
            });

            window.updateTableStats();
            document.getElementById("lblLog").textContent = "🔍 [Filter Result] Displaying " + matchCount + " of " + bodyRows.length + " rows for query '" + query + "'";
        })();
    `);
});

// 6. Sort Table Handler
wv.bind("on_btnSort_click", () => {
    console.log("⚡ [IPC] on_btnSort_click");
    execJS(`
        (function() {
            const tbody = document.querySelector("#tblMainGrid table tbody");
            if (!tbody) return;

            const rows = Array.from(tbody.querySelectorAll("tr"));
            rows.sort((a, b) => {
                const nameA = (a.querySelectorAll("td")[1]?.textContent || "").toLowerCase();
                const nameB = (b.querySelectorAll("td")[1]?.textContent || "").toLowerCase();
                return nameA.localeCompare(nameB);
            });

            rows.forEach(r => tbody.appendChild(r));
            window.attachRowHandlers();
            document.getElementById("lblLog").textContent = "🔀 [Sorted] Table rows sorted alphabetically by Name column.";
        })();
    `);
});

// 7. Reset Sample Data Handler
wv.bind("on_btnReset_click", () => {
    console.log("⚡ [IPC] on_btnReset_click");
    execJS(`
        (function() {
            const tableContainer = document.getElementById("tblMainGrid");
            if (!tableContainer) return;

            tableContainer.innerHTML = \`
                <table style="width:100%;border-collapse:collapse;font-size:12px;color:#e2e8f0;">
                    <thead>
                        <tr style="background:rgba(255,255,255,0.06);">
                            <th style="padding:8px 12px;text-align:left;font-weight:700;color:#38bdf8;border-bottom:1px solid rgba(255,255,255,0.12);">ID</th>
                            <th style="padding:8px 12px;text-align:left;font-weight:700;color:#38bdf8;border-bottom:1px solid rgba(255,255,255,0.12);">Name</th>
                            <th style="padding:8px 12px;text-align:left;font-weight:700;color:#38bdf8;border-bottom:1px solid rgba(255,255,255,0.12);">Role</th>
                            <th style="padding:8px 12px;text-align:left;font-weight:700;color:#38bdf8;border-bottom:1px solid rgba(255,255,255,0.12);">Department</th>
                            <th style="padding:8px 12px;text-align:left;font-weight:700;color:#38bdf8;border-bottom:1px solid rgba(255,255,255,0.12);">Salary</th>
                            <th style="padding:8px 12px;text-align:left;font-weight:700;color:#38bdf8;border-bottom:1px solid rgba(255,255,255,0.12);">Status</th>
                        </tr>
                    </thead>
                    <tbody>
                        <tr style="border-bottom:1px solid rgba(255,255,255,0.12);"><td style="padding:8px 12px;">101</td><td style="padding:8px 12px;">Alex Mercer</td><td style="padding:8px 12px;">Lead Architect</td><td style="padding:8px 12px;">Engineering</td><td style="padding:8px 12px;">$165,000</td><td style="padding:8px 12px;">Active</td></tr>
                        <tr style="border-bottom:1px solid rgba(255,255,255,0.12);"><td style="padding:8px 12px;">102</td><td style="padding:8px 12px;">Elena Rostova</td><td style="padding:8px 12px;">Staff Designer</td><td style="padding:8px 12px;">Design</td><td style="padding:8px 12px;">$140,000</td><td style="padding:8px 12px;">Active</td></tr>
                        <tr style="border-bottom:1px solid rgba(255,255,255,0.12);"><td style="padding:8px 12px;">103</td><td style="padding:8px 12px;">Marcus Vance</td><td style="padding:8px 12px;">Product Manager</td><td style="padding:8px 12px;">Product</td><td style="padding:8px 12px;">$155,000</td><td style="padding:8px 12px;">Active</td></tr>
                        <tr style="border-bottom:1px solid rgba(255,255,255,0.12);"><td style="padding:8px 12px;">104</td><td style="padding:8px 12px;">Sophia Chen</td><td style="padding:8px 12px;">Data Scientist</td><td style="padding:8px 12px;">AI & ML</td><td style="padding:8px 12px;">$170,000</td><td style="padding:8px 12px;">Active</td></tr>
                        <tr style="border-bottom:1px solid rgba(255,255,255,0.12);"><td style="padding:8px 12px;">105</td><td style="padding:8px 12px;">David Kim</td><td style="padding:8px 12px;">DevOps Engineer</td><td style="padding:8px 12px;">Infrastructure</td><td style="padding:8px 12px;">$150,000</td><td style="padding:8px 12px;">On Leave</td></tr>
                    </tbody>
                </table>
            \`;

            window.attachRowHandlers();
            window.updateTableStats();
            document.getElementById("lblLog").textContent = "🔄 [Reset] Restored default 5 enterprise sample team members and standard 6 columns.";
        })();
    `);
});

// 8. Clear All Rows Handler
wv.bind("on_btnClear_click", () => {
    console.log("⚡ [IPC] on_btnClear_click");
    execJS(`
        (function() {
            const tbody = document.querySelector("#tblMainGrid table tbody");
            if (tbody) tbody.innerHTML = "";
            window.selectedRowElement = null;
            window.updateTableStats();
            document.getElementById("lblLog").textContent = "🧹 [Cleared] All table rows deleted.";
        })();
    `);
});

console.log("🚀 Running Bun RAD Studio Demo 5: Dynamic Table & Data Grid Control Studio...");
wv.run();
