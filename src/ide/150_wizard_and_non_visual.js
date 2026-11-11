
		// MS Access Database CRUD Form Wizard (1-Click RAD Form Generator)
		function launchAccessCrudWizard() {
			saveHistoryState();
			formSpec = {
				title: "Customer Database CRUD Manager",
				width: 860,
				height: 580,
				background_color: "#0f172a",
				font_color: "#f8fafc",
				padding: 20,
				spacing: 12,
				controls: [
					{ id: "lbl_header", control_type: "label", x: 20, y: 16, width: 340, height: 28, text: "🗄️ Customer Accounts Repository", font_size: 16, font_color: "#38bdf8" },
					{ id: "db_nav_main", control_type: "db_navigator", x: 380, y: 14, width: 320, height: 32, text: "Dataset1" },
					{ id: "btn_new_rec", control_type: "button", x: 710, y: 14, width: 130, height: 32, text: "+ New Record", background_color: "#0284c7", font_color: "#ffffff" },
					
					{ id: "pnl_fields", control_type: "panel", x: 20, y: 56, width: 320, height: 360, text: "RECORD DETAILS (ACCESS FORM)" },
					{ id: "db_input_id", control_type: "db_input", x: 36, y: 92, width: 280, height: 44, text: "Customer ID", data_source: "Dataset1", data_field: "id" },
					{ id: "db_input_name", control_type: "db_input", x: 36, y: 144, width: 280, height: 44, text: "Company Name", data_source: "Dataset1", data_field: "company_name" },
					{ id: "db_input_email", control_type: "db_input", x: 36, y: 196, width: 280, height: 44, text: "Contact Email", data_source: "Dataset1", data_field: "email" },
					{ id: "db_lookup_status", control_type: "db_dropdown", x: 36, y: 248, width: 280, height: 44, text: "Account Status", data_source: "Dataset1", data_field: "status" },
					{ id: "db_input_balance", control_type: "db_input", x: 36, y: 300, width: 280, height: 44, text: "Current Balance ($)", data_source: "Dataset1", data_field: "balance" },
					{ id: "btn_save_rec", control_type: "button", x: 36, y: 356, width: 280, height: 36, text: "💾 Save Record Changes", background_color: "#10b981", font_color: "#ffffff", event_handlers: { onClick: "on_save_record_click" } },

					{ id: "db_grid_main", control_type: "db_grid", x: 356, y: 56, width: 484, height: 360, text: "Dataset1: Customer Database Grid", data_source: "Dataset1" },
					
					{ id: "alert_info", control_type: "alert_banner", x: 20, y: 430, width: 820, height: 40, text: "Connected to SQLite Database (customers.db) — 3 Active Records Loaded", alert_type: "info" }
				],
				non_visual_controls: [
					{ id: "dbConn1", control_type: "db_connection", text: "customers.db (SQLite)" },
					{ id: "timer1", control_type: "timer", interval: 5000, enabled: true, event_handlers: { onTimer: "on_db_sync_timer" } },
					{ id: "openDlg1", control_type: "open_dialog", text: "Import DB File" }
				]
			};
			selectedIndices = [];
			renderCanvas();
			renderNonVisualTray();
			renderCode();
			renderTree();
			populateInspector();
			showCopyToast("Generated MS Access style Database CRUD Form!");
		}

		// Non-Visual Components Tray System (Delphi TTimer / TOpenDialog Paradigm)
		function spawnNonVisualControl(type) {
			saveHistoryState();
			const cleanType = typeof type === "string" && /^[a-z0-9_]+$/i.test(type) ? type : "timer";
			formSpec.non_visual_controls = formSpec.non_visual_controls || [];
			const usedIds = new Set(
				[].concat(formSpec.controls || [], formSpec.non_visual_controls || []).map((c) => c && c.id)
			);
			let count = formSpec.non_visual_controls.length + 1;
			let id = cleanType + "_" + count;
			while (usedIds.has(id)) {
				count++;
				id = cleanType + "_" + count;
			}
			let icon = "⚙️";
			if (cleanType === "timer") icon = "⏱️";
			else if (cleanType === "open_dialog") icon = "📂";
			else if (cleanType === "save_dialog") icon = "💾";
			else if (cleanType === "db_connection") icon = "🔌";
			else if (cleanType === "http_client") icon = "🌐";
			else if (cleanType === "notification") icon = "🔔";

			let defaultTooltip = "";
			const allPaletteItems = document.querySelectorAll ? document.querySelectorAll(".palette-item") : [];
			allPaletteItems.forEach((el) => {
				const oc = el.getAttribute("onclick") || "";
				if (!defaultTooltip && oc.includes("'" + cleanType + "'")) {
					defaultTooltip = el.getAttribute("title") || "";
				}
			});

			const nvc = {
				id: id,
				control_type: cleanType,
				icon: icon,
				text: id,
				tooltip: defaultTooltip,
				interval: cleanType === "timer" ? 1000 : undefined,
				enabled: true,
				event_handlers: {}
			};
			formSpec.non_visual_controls.push(nvc);
			renderNonVisualTray();
			renderCode();
			showCopyToast("Added non-visual " + cleanType + " to component tray!");
		}

		function renderNonVisualTray() {
			const tray = document.getElementById("nonVisualTray");
			const countEl = document.getElementById("nonVisualCount");
			if (!tray) return;
			const nvcs = formSpec.non_visual_controls || [];
			if (countEl) countEl.textContent = nvcs.length + " non-visual item(s)";

			if (nvcs.length === 0) {
				tray.innerHTML = '<span style="color: var(--text-muted); font-size: 10px; font-style: italic;">No non-visual components added. Add Timers or DB Connections from Palette.</span>';
				return;
			}

			const esc = (v) => String(v === undefined || v === null ? "" : v).replace(/[&<>"']/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[ch]));
			tray.innerHTML = nvcs.map((c, i) => {
				let icon = "⚙️";
				if (c.control_type === "timer") icon = "⏱️";
				else if (c.control_type === "open_dialog") icon = "📂";
				else if (c.control_type === "save_dialog") icon = "💾";
				else if (c.control_type === "db_connection") icon = "🔌";
				else if (c.control_type === "http_client") icon = "🌐";
				else if (c.control_type === "notification") icon = "🔔";
				const safeId = esc(c.id);
				const safeType = esc(c.control_type);

				return `<div onclick="selectNonVisualControl(${i})" style="display:inline-flex; align-items:center; gap:6px; background:rgba(56,189,248,0.12); border:1px solid var(--accent); border-radius:14px; padding:3px 10px; cursor:pointer; color:var(--text-primary); font-weight:600; font-size:11px;" title="${safeId} (${safeType})"><span>${icon}</span><span>${safeId}</span><span onclick="event.stopPropagation(); deleteNonVisualControl(${i})" style="opacity:0.6; margin-left:4px; font-size:10px;" onmouseover="this.style.opacity='1'" onmouseout="this.style.opacity='0.6'">✕</span></div>`;
			}).join('');
		}

		function deleteNonVisualControl(idx) {
			if (!formSpec.non_visual_controls) return;
			saveHistoryState();
			formSpec.non_visual_controls.splice(idx, 1);
			renderNonVisualTray();
			renderCode();
		}

		function selectNonVisualControl(idx) {
			const c = formSpec.non_visual_controls[idx];
			if (!c) return;
			document.getElementById("statusMsg").textContent = "Inspecting Non-Visual Component: " + c.id;
		}

		// Delphi Anchors & Docking Controls
		function toggleAnchor(dir) {
			if (selectedIndices.length === 0) return;
			saveHistoryState();
			selectedIndices.forEach(idx => {
				const c = formSpec.controls[idx];
				c.anchors = c.anchors || { top: true, left: true, right: false, bottom: false };
				c.anchors[dir] = !c.anchors[dir];
			});
			populateInspector();
			renderCanvas();
			renderCode();
		}

		function updateSelectedControlDock(val) {
			if (selectedIndices.length === 0) return;
			saveHistoryState();
			selectedIndices.forEach(idx => {
				formSpec.controls[idx].dock = val;
			});
			populateInspector();
			renderCanvas();
			renderCode();
		}
