
		function syncControlDom(ctrl, div, dimBadge) {
			div.style.left = ctrl.x + "px";
			div.style.top = ctrl.y + "px";
			div.style.width = ctrl.width + "px";
			div.style.height = ctrl.height + "px";
			div.style.fontSize = (ctrl.font_size || 12) + "px";
			div.title = ctrl.tooltip ? ctrl.tooltip : (ctrl.id + " (" + ctrl.control_type + ")");
			const idx = parseInt(div.dataset.ctrlIndex, 10);
			const isSel = !isNaN(idx) && selectedIndices.includes(idx);

			const baseZ = isNaN(idx) ? 10 : (idx + 10);
			div.style.zIndex = baseZ;

			if (ctrl.cursor && ctrl.cursor !== "default") {
				const cursorCss = ctrl.cursor === "pointer" ? "pointer" : (ctrl.cursor === "crosshair" ? "crosshair" : (ctrl.cursor === "text" ? "text" : (ctrl.cursor === "not-allowed" ? "not-allowed" : (ctrl.cursor === "grab" ? "grab" : (ctrl.cursor === "zoom-in" ? "zoom-in" : (ctrl.cursor === "help" ? "help" : "pointer"))))));
				div.style.cursor = cursorCss;
			} else {
				div.style.cursor = isLiveHoverMode ? "pointer" : "move";
			}

			if (ctrl.border_radius !== undefined && ctrl.border_radius !== null && ctrl.border_radius !== "") {
				div.style.borderRadius = ctrl.border_radius + "px";
			} else {
				div.style.borderRadius = "";
			}
			if (ctrl.border_width !== undefined && ctrl.border_width !== null && ctrl.border_width !== "") {
				div.style.borderWidth = ctrl.border_width + "px";
			} else {
				div.style.borderWidth = "";
			}
			if (ctrl.border_color) div.style.borderColor = ctrl.border_color; else div.style.borderColor = "";
			if (ctrl.border_style) div.style.borderStyle = ctrl.border_style; else div.style.borderStyle = "";
			if (ctrl.box_shadow && ctrl.box_shadow !== "none") {
				const col = ctrl.border_color || ctrl.font_color || "#38bdf8";
				div.style.boxShadow = ctrl.box_shadow === "subtle" ? "0 2px 4px rgba(0,0,0,0.15)" :
				                     ctrl.box_shadow === "medium" ? "0 4px 12px rgba(0,0,0,0.3)" :
				                     ctrl.box_shadow === "deep" ? "0 10px 25px rgba(0,0,0,0.5)" :
				                     "0 0 15px " + col;
			} else {
				div.style.boxShadow = "";
			}
			if (ctrl.text_align) div.style.textAlign = ctrl.text_align; else div.style.textAlign = "";

			if (ctrl.opacity !== undefined && ctrl.opacity !== null && ctrl.opacity !== "") {
				div.style.opacity = (ctrl.opacity / 100);
			} else if (ctrl.enabled === false) {
				div.style.opacity = "0.55";
				div.style.filter = "grayscale(0.6)";
			} else {
				div.style.opacity = "1";
				div.style.filter = "";
			}
			if (ctrl.locked) div.classList.add("locked"); else div.classList.remove("locked");
			if (dimBadge) {
				dimBadge.textContent = ctrl.id + " (" + ctrl.width + "x" + ctrl.height + ")";
			}
		}

		function renderControlContent(ctrl, div) {
			div.innerHTML = "";
			const type = ctrl.control_type || "button";
			const text = ctrl.text || ctrl.id;

			if (type === "color") {
				const col = ctrl.font_color && ctrl.font_color !== "#ffffff" ? ctrl.font_color : (ctrl.background_color && ctrl.background_color !== "#1e293b" ? ctrl.background_color : "#38bdf8");
				div.style.backgroundColor = "transparent";
				div.style.border = "1px solid var(--border-color)";
				div.innerHTML = "<div class='ctrl-color-well'><div class='ctrl-color-swatch' style='background-color: " + col + "'></div><span>🎨 " + text + " (" + col + ")</span></div>";
			} else if (type === "slider") {
				const val = ctrl.value !== undefined ? ctrl.value : 50;
				div.style.backgroundColor = "transparent";
				const fill = document.createElement("div");
				fill.className = "ctrl-slider-fill";
				fill.style.width = val + "%";
				const thumb = document.createElement("div");
				thumb.className = "ctrl-slider-thumb";
				thumb.style.left = val + "%";
				const track = document.createElement("div");
				track.className = "ctrl-slider-track";
				track.appendChild(fill);
				track.appendChild(thumb);

				const label = document.createElement("div");
				label.style.fontSize = "10px";
				label.style.opacity = "0.8";
				label.style.width = "100%";
				label.style.display = "flex";
				label.style.justifyContent = "space-between";
				label.innerHTML = "<span>" + text + "</span><span>" + val + "%</span>";

				const wrap = document.createElement("div");
				wrap.style.display = "flex";
				wrap.style.flexDirection = "column";
				wrap.style.width = "100%";
				wrap.style.gap = "4px";
				wrap.style.alignItems = "center";
				wrap.appendChild(label);
				wrap.appendChild(track);
				div.appendChild(wrap);
			} else if (type === "progress") {
				const val = ctrl.value !== undefined ? ctrl.value : 60;
				const bg = ctrl.background_color || "#10b981";
				div.style.backgroundColor = "transparent";
				const fill = document.createElement("div");
				fill.className = "ctrl-progress-fill";
				fill.style.width = val + "%";
				fill.style.backgroundColor = bg;
				const txt = document.createElement("span");
				txt.className = "ctrl-progress-text";
				txt.textContent = text + ": " + val + "%";
				const track = document.createElement("div");
				track.className = "ctrl-progress-track";
				track.appendChild(fill);
				track.appendChild(txt);
				div.appendChild(track);
			} else if (type === "switch") {
				div.style.backgroundColor = "transparent";
				div.style.border = "none";
				div.style.justifyContent = "flex-start";
				div.style.gap = "8px";
				const onClass = ctrl.checked ? " on" : "";
				const fg = ctrl.font_color || "inherit";
				div.innerHTML = "<div class='ctrl-switch-pill" + onClass + "'><div class='ctrl-switch-thumb'></div></div><span style='color:" + fg + "'>" + text + "</span>";
			} else if (type === "checkbox") {
				div.style.backgroundColor = "transparent";
				div.style.justifyContent = "flex-start";
				div.style.gap = "8px";
				const chkMark = ctrl.checked ? "✓" : "";
				const fg = ctrl.font_color || "inherit";
				div.innerHTML = "<div class='ctrl-checkbox-box'>" + chkMark + "</div><span style='color:" + fg + "'>" + text + "</span>";
			} else if (type === "radio") {
				div.style.backgroundColor = "transparent";
				div.style.justifyContent = "flex-start";
				div.style.gap = "8px";
				const dotStyle = ctrl.checked ? "display:block;" : "display:none;";
				const fg = ctrl.font_color || "inherit";
				div.innerHTML = "<div class='ctrl-radio-circle'><div class='ctrl-radio-dot' style='" + dotStyle + "'></div></div><span style='color:" + fg + "'>" + text + "</span>";
			} else if (type === "badge") {
				div.style.backgroundColor = "transparent";
				div.style.border = "none";
				const bg = ctrl.background_color || "#059669";
				const fg = ctrl.font_color || "#ffffff";
				div.innerHTML = "<span class='ctrl-badge' style='background-color:" + bg + "; color:" + fg + "'>" + text + "</span>";
			} else if (type === "panel") {
				div.style.padding = "0";
				div.style.overflow = "hidden";
				const bg = ctrl.background_color || "#1e293b";
				div.innerHTML = "<div class='ctrl-panel-box' style='background-color:" + bg + "'><div class='ctrl-panel-header'>📦 " + text + "</div></div>";
			} else if (type === "table") {
				div.style.padding = "0";
				div.style.overflow = "hidden";
				div.innerHTML = "<table class='ctrl-mini-table'><thead><tr><th>ID</th><th>Name</th><th>Status</th></tr></thead><tbody><tr><td>101</td><td>Ada Lovelace</td><td>Active</td></tr><tr><td>102</td><td>Alan Turing</td><td>Verified</td></tr></tbody></table>";
			} else if (type === "divider") {
				div.style.backgroundColor = "transparent";
				div.style.border = "none";
				const hr = document.createElement("hr");
				hr.style.width = "100%";
				hr.style.border = "0";
				hr.style.borderTop = "1px solid rgba(255,255,255,0.3)";
				hr.style.margin = "0";
				div.appendChild(hr);
			} else if (type === "textarea") {
				div.style.backgroundColor = ctrl.background_color || "#1e293b";
				div.style.alignItems = "flex-start";
				div.style.padding = "6px";
				const fg = ctrl.font_color || "inherit";
				div.innerHTML = "<div style='opacity:0.7; font-size:11px; color:" + fg + "'>📝 " + text + "</div>";
			} else if (type === "number") {
				div.style.backgroundColor = ctrl.background_color || "#1e293b";
				const fg = ctrl.font_color || "inherit";
				const val = ctrl.value !== undefined ? ctrl.value : 0;
				div.innerHTML = "<div style='display:flex; justify-content:space-between; width:100%; align-items:center; padding:0 6px; color:" + fg + "'><span>🔢 " + text + "</span><span style='background:rgba(255,255,255,0.1); padding:2px 6px; border-radius:3px; font-weight:bold;'>" + val + "</span></div>";
			} else if (type === "date" || type === "date_picker") {
				div.style.backgroundColor = "transparent";
				const fg = ctrl.font_color || "inherit";
				div.innerHTML = "<div class='ctrl-input-box' style='height:28px; width:100%; display:flex; align-items:center; gap:6px; padding:0 8px; font-size:12px; color:" + fg + ";'><span>📅</span><span>" + text + "</span></div>";
			} else if (type === "search") {
				div.style.backgroundColor = ctrl.background_color || "#1e293b";
				const fg = ctrl.font_color || "inherit";
				div.innerHTML = "<div style='display:flex; align-items:center; gap:6px; width:100%; padding:0 6px; color:" + fg + "'><span>🔍</span><span>" + text + "</span></div>";
			} else if (type === "password") {
				div.style.backgroundColor = ctrl.background_color || "#1e293b";
				const fg = ctrl.font_color || "inherit";
				div.innerHTML = "<div style='display:flex; align-items:center; gap:6px; width:100%; padding:0 6px; color:" + fg + "'><span>🔒</span><span>••••••••</span></div>";
			} else if (type === "input") {
				div.style.backgroundColor = ctrl.background_color || "#1e293b";
				const fg = ctrl.font_color || "inherit";
				div.innerHTML = "<div style='display:flex; align-items:center; gap:6px; width:100%; padding:0 6px; color:" + fg + "'><span>✏️</span><span>" + text + "</span></div>";
			} else if (type === "image") {
				div.style.backgroundColor = ctrl.background_color || "#1e293b";
				const fg = ctrl.font_color || "inherit";
				div.innerHTML = "<div style='display:flex; align-items:center; justify-content:center; gap:6px; width:100%; opacity:0.8; color:" + fg + "'><span>🖼️</span><span>" + text + "</span></div>";
			} else if (type === "mode") {
				div.style.backgroundColor = ctrl.background_color || "#1e293b";
				div.innerHTML = "<div style='display:flex; align-items:center; justify-content:center; width:100%; gap:2px;'><span style='background:var(--accent); color:#000; padding:2px 6px; border-radius:3px; font-weight:bold;'>" + text + "</span></div>";

			// Labeled Form Controls
			} else if (type === "form_field") {
				div.style.backgroundColor = "transparent";
				div.style.border = "none";
				const fg = ctrl.font_color || "inherit";
				const inRad = ctrl.border_radius !== undefined && ctrl.border_radius !== null && ctrl.border_radius !== "" ? ctrl.border_radius + "px" : "4px";
				const inBdr = ctrl.border_width || ctrl.border_color || ctrl.border_style ? (ctrl.border_width || 1) + "px " + (ctrl.border_style || "solid") + " " + (ctrl.border_color || "var(--border-color)") : "1px solid var(--border-color)";
				div.innerHTML = "<div style='display:flex; flex-direction:column; width:100%; gap:2px;'><span style='font-size:10px; font-weight:bold; opacity:0.8; color:" + fg + "'>" + text + "</span><div style='background:" + (ctrl.background_color || "#1e293b") + "; border:" + inBdr + "; padding:4px 8px; border-radius:" + inRad + "; font-size:11px;'>Sample Input</div></div>";
			} else if (type === "form_textarea") {
				div.style.backgroundColor = "transparent";
				div.style.border = "none";
				const fg = ctrl.font_color || "inherit";
				const inRad = ctrl.border_radius !== undefined && ctrl.border_radius !== null && ctrl.border_radius !== "" ? ctrl.border_radius + "px" : "4px";
				const inBdr = ctrl.border_width || ctrl.border_color || ctrl.border_style ? (ctrl.border_width || 1) + "px " + (ctrl.border_style || "solid") + " " + (ctrl.border_color || "var(--border-color)") : "1px solid var(--border-color)";
				div.innerHTML = "<div style='display:flex; flex-direction:column; width:100%; height:100%; gap:2px;'><span style='font-size:10px; font-weight:bold; opacity:0.8; color:" + fg + "'>" + text + "</span><div style='flex:1; background:" + (ctrl.background_color || "#1e293b") + "; border:" + inBdr + "; padding:6px; border-radius:" + inRad + "; font-size:11px;'>Multi-line content...</div></div>";
			} else if (type === "form_password") {
				div.style.backgroundColor = "transparent";
				div.style.border = "none";
				const fg = ctrl.font_color || "inherit";
				const inRad = ctrl.border_radius !== undefined && ctrl.border_radius !== null && ctrl.border_radius !== "" ? ctrl.border_radius + "px" : "4px";
				const inBdr = ctrl.border_width || ctrl.border_color || ctrl.border_style ? (ctrl.border_width || 1) + "px " + (ctrl.border_style || "solid") + " " + (ctrl.border_color || "var(--border-color)") : "1px solid var(--border-color)";
				div.innerHTML = "<div style='display:flex; flex-direction:column; width:100%; gap:2px;'><span style='font-size:10px; font-weight:bold; opacity:0.8; color:" + fg + "'>" + text + "</span><div style='background:" + (ctrl.background_color || "#1e293b") + "; border:" + inBdr + "; padding:4px 8px; border-radius:" + inRad + "; font-size:11px;'>••••••••</div></div>";
			} else if (type === "form_number") {
				div.style.backgroundColor = "transparent";
				div.style.border = "none";
				const fg = ctrl.font_color || "inherit";
				const val = ctrl.value !== undefined ? ctrl.value : 0;
				const inRad = ctrl.border_radius !== undefined && ctrl.border_radius !== null && ctrl.border_radius !== "" ? ctrl.border_radius + "px" : "4px";
				const inBdr = ctrl.border_width || ctrl.border_color || ctrl.border_style ? (ctrl.border_width || 1) + "px " + (ctrl.border_style || "solid") + " " + (ctrl.border_color || "var(--border-color)") : "1px solid var(--border-color)";
				div.innerHTML = "<div style='display:flex; justify-content:space-between; align-items:center; width:100%; gap:8px;'><span style='font-size:11px; font-weight:bold; color:" + fg + "'>" + text + "</span><div style='background:" + (ctrl.background_color || "#1e293b") + "; border:" + inBdr + "; padding:2px 8px; border-radius:" + inRad + "; font-weight:bold;'>" + val + "</div></div>";
			} else if (type === "form_slider") {
				div.style.backgroundColor = "transparent";
				div.style.border = "none";
				const fg = ctrl.font_color || "inherit";
				const val = ctrl.value !== undefined ? ctrl.value : 50;
				div.innerHTML = "<div style='display:flex; flex-direction:column; width:100%; gap:2px;'><div style='display:flex; justify-content:space-between; font-size:10px; font-weight:bold; color:" + fg + "'><span>" + text + "</span><span>" + val + "%</span></div><div class='ctrl-slider-track'><div class='ctrl-slider-fill' style='width:" + val + "%'></div></div></div>";
			} else if (type === "form_dropdown") {
				div.style.backgroundColor = "transparent";
				div.style.border = "none";
				const fg = ctrl.font_color || "inherit";
				const inRad = ctrl.border_radius !== undefined && ctrl.border_radius !== null && ctrl.border_radius !== "" ? ctrl.border_radius + "px" : "4px";
				const inBdr = ctrl.border_width || ctrl.border_color || ctrl.border_style ? (ctrl.border_width || 1) + "px " + (ctrl.border_style || "solid") + " " + (ctrl.border_color || "var(--border-color)") : "1px solid var(--border-color)";
				div.innerHTML = "<div style='display:flex; flex-direction:column; width:100%; gap:2px;'><span style='font-size:10px; font-weight:bold; opacity:0.8; color:" + fg + "'>" + text + "</span><div style='display:flex; justify-content:space-between; background:" + (ctrl.background_color || "#1e293b") + "; border:" + inBdr + "; padding:4px 8px; border-radius:" + inRad + "; font-size:11px;'><span>Option 1</span><span>▼</span></div></div>";
			} else if (type === "form_date") {
				div.style.backgroundColor = "transparent";
				div.style.border = "none";
				const fg = ctrl.font_color || "inherit";
				const inRad = ctrl.border_radius !== undefined && ctrl.border_radius !== null && ctrl.border_radius !== "" ? ctrl.border_radius + "px" : "4px";
				const inBdr = ctrl.border_width || ctrl.border_color || ctrl.border_style ? (ctrl.border_width || 1) + "px " + (ctrl.border_style || "solid") + " " + (ctrl.border_color || "var(--border-color)") : "1px solid var(--border-color)";
				div.innerHTML = "<div style='display:flex; flex-direction:column; width:100%; gap:2px;'><span style='font-size:10px; font-weight:bold; opacity:0.8; color:" + fg + "'>" + text + "</span><div style='display:flex; align-items:center; gap:6px; background:" + (ctrl.background_color || "#1e293b") + "; border:" + inBdr + "; padding:4px 8px; border-radius:" + inRad + "; font-size:11px;'><span>📅</span><span>2026-07-22</span></div></div>";
			} else if (type === "form_progress") {
				div.style.backgroundColor = "transparent";
				div.style.border = "none";
				const fg = ctrl.font_color || "inherit";
				const val = ctrl.value !== undefined ? ctrl.value : 60;
				div.innerHTML = "<div style='display:flex; flex-direction:column; width:100%; gap:2px;'><div style='display:flex; justify-content:space-between; font-size:10px; font-weight:bold; color:" + fg + "'><span>" + text + "</span><span>" + val + "%</span></div><div class='ctrl-progress-track'><div class='ctrl-progress-fill' style='width:" + val + "%; background:#10b981;'></div></div></div>";
			} else if (type === "form_switch") {
				div.style.backgroundColor = "transparent";
				div.style.border = "none";
				const fg = ctrl.font_color || "inherit";
				const onClass = ctrl.checked ? " on" : "";
				div.innerHTML = "<div style='display:flex; justify-content:space-between; align-items:center; width:100%;'><span style='font-size:11px; font-weight:bold; color:" + fg + "'>" + text + "</span><div class='ctrl-switch-pill" + onClass + "'><div class='ctrl-switch-thumb'></div></div></div>";
			} else if (type === "form_link") {
				div.style.backgroundColor = "transparent";
				div.style.border = "none";
				const fg = ctrl.font_color || "inherit";
				div.innerHTML = "<div style='display:flex; justify-content:space-between; align-items:center; width:100%;'><span style='font-size:11px; opacity:0.8; color:" + fg + "'>" + text + "</span><span style='color:var(--accent); text-decoration:underline; font-size:11px; font-weight:bold;'>View Link 🔗</span></div>";

			// Gauges & Demo Widgets
			} else if (type === "rating") {
				div.style.backgroundColor = "transparent";
				div.style.border = "none";
				div.innerHTML = "<div style='display:flex; gap:4px; font-size:16px; color:#f59e0b;'>★ ★ ★ ★ ☆</div>";
			} else if (type === "stepper") {
				div.style.backgroundColor = ctrl.background_color || "#1e293b";
				const val = ctrl.value !== undefined ? ctrl.value : 5;
				div.innerHTML = "<div style='display:flex; justify-content:space-between; align-items:center; width:100%; padding:0 4px;'><span style='font-weight:bold;'>-</span><span style='font-weight:bold;'>" + val + "</span><span style='font-weight:bold;'>+</span></div>";
			} else if (type === "tag") {
				div.style.backgroundColor = ctrl.background_color || "#1e293b";
				div.innerHTML = "<div style='display:flex; gap:4px; align-items:center; width:100%; padding:0 4px; font-size:10px;'><span style='background:rgba(56,189,248,0.2); color:#38bdf8; padding:2px 6px; border-radius:10px;'>vlang</span><span style='background:rgba(56,189,248,0.2); color:#38bdf8; padding:2px 6px; border-radius:10px;'>gui</span></div>";
			} else if (type === "path") {
				div.style.backgroundColor = ctrl.background_color || "#1e293b";
				div.innerHTML = "<div style='display:flex; gap:4px; align-items:center; width:100%; padding:0 6px; font-size:10px; opacity:0.8;'><span>📁</span><span>Users</span><span>›</span><span>developer</span><span>›</span><span>project</span></div>";
			} else if (type === "drop_zone") {
				div.style.backgroundColor = "rgba(56, 189, 248, 0.05)";
				div.style.border = "2px dashed var(--accent)";
				div.innerHTML = "<div style='display:flex; flex-direction:column; align-items:center; justify-content:center; width:100%; height:100%; gap:2px; font-size:10px; opacity:0.9;'><span>📥 " + text + "</span></div>";
			} else if (type === "circular_progress") {
				div.style.backgroundColor = "transparent";
				div.style.border = "none";
				const val = ctrl.value !== undefined ? ctrl.value : 75;
				div.innerHTML = "<div style='display:flex; align-items:center; justify-content:center; width:100%; height:100%; background:radial-gradient(circle, #1e293b 60%, var(--accent) 60%); border-radius:50%; font-weight:bold; font-size:11px;'>" + val + "%</div>";
			} else if (type === "metric_meter") {
				div.style.backgroundColor = ctrl.background_color || "#1e293b";
				const val = ctrl.value !== undefined ? ctrl.value : 48;
				div.innerHTML = "<div style='display:flex; flex-direction:column; width:100%; padding:4px 8px; gap:2px;'><div style='display:flex; justify-content:space-between; font-size:10px;'><span>" + text + "</span><span>" + val + "%</span></div><div style='height:4px; background:rgba(255,255,255,0.1); border-radius:2px;'><div style='height:100%; width:" + val + "%; background:var(--accent); border-radius:2px;'></div></div></div>";
			} else if (type === "status_indicator") {
				div.style.backgroundColor = "transparent";
				div.style.border = "none";
				div.innerHTML = "<div style='display:flex; align-items:center; gap:6px; font-size:11px;'><span style='width:8px; height:8px; border-radius:50%; background:#10b981;'></span><span>" + text + ": Online</span></div>";
			} else if (type === "metric_card") {
				div.style.backgroundColor = ctrl.background_color || "#1e293b";
				div.style.flexDirection = "column";
				div.style.alignItems = "flex-start";
				div.style.padding = "6px 10px";
				div.innerHTML = "<div style='font-size:10px; opacity:0.7;'>" + text + "</div><div style='font-size:15px; font-weight:bold; color:var(--accent); margin:2px 0;'>$48,250</div><div style='font-size:9px; color:#10b981;'>▲ +12% this month</div>";
			} else if (type === "alert_banner") {
				div.style.backgroundColor = "rgba(56, 189, 248, 0.15)";
				div.style.borderLeft = "4px solid var(--accent)";
				div.innerHTML = "<div style='display:flex; align-items:center; gap:8px; padding:0 8px; font-size:11px;'><span>ℹ️</span><span><b>" + text + ":</b> System operating normally.</span></div>";
			} else if (type === "code_view") {
				div.style.backgroundColor = ctrl.background_color && ctrl.background_color !== "transparent" ? ctrl.background_color : "#0d1117";
				div.style.color = ctrl.font_color || "#7dd3fc";
				div.style.fontFamily = "'Fira Code', 'Courier New', monospace";
				div.style.fontSize = (ctrl.font_size || 11) + "px";
				div.style.padding = "8px";
				div.style.alignItems = "flex-start";
				div.style.whiteSpace = "pre-wrap";
				div.style.overflow = "hidden";
				const dispText = text || "// code here";
				div.innerHTML = "<div style='width:100%; height:100%; white-space:pre-wrap; word-break:break-all; font-family:monospace;'>" + dispText.replace(/</g, "&lt;").replace(/>/g, "&gt;") + "</div>";
			} else if (type === "segmented_control") {
				div.style.backgroundColor = ctrl.background_color || "rgba(255,255,255,0.06)";
				div.style.borderRadius = "8px";
				div.style.padding = "2px";
				const items = (text || "Overview, Analytics, Reports").split(",").map(s=>s.trim());
				div.innerHTML = "<div style='display:flex; width:100%; height:100%; gap:2px;'>" + items.map((it, idx) => `<div style='flex:1; height:100%; background:${idx===0?'var(--accent)':'transparent'}; color:${idx===0?'#fff':'inherit'}; border-radius:6px; display:flex; align-items:center; justify-content:center; font-size:10px; font-weight:600;'>${it}</div>`).join('') + "</div>";
			} else if (type === "tree_view") {
				div.style.backgroundColor = ctrl.background_color || "#1e293b";
				div.style.flexDirection = "column";
				div.style.alignItems = "flex-start";
				div.style.padding = "6px 8px";
				div.style.fontSize = "11px";
				const nodes = (text || "Project Root, 📂 src, 📄 index.ts, 📄 styles.css").split(",").map(s=>s.trim());
				div.innerHTML = nodes.map((n, i) => `<div style='padding-left:${i===0?0:12}px; display:flex; gap:4px; opacity:${i===0?1:0.8};'><span>${i===0?'▼ 📁':'├─'}</span><span>${n}</span></div>`).join('');
			} else if (type === "avatar_group") {
				div.style.backgroundColor = "transparent";
				div.style.border = "none";
				const avs = (text || "JD, AS, MK, +3").split(",").map(s=>s.trim());
				const avCols = ['#0284c7', '#7c3aed', '#059669', '#d97706', '#dc2626'];
				div.innerHTML = "<div style='display:flex; align-items:center;'>" + avs.map((av, i) => `<div style='width:28px; height:28px; border-radius:50%; background:${av.startsWith('+')?'rgba(255,255,255,0.2)':avCols[i%avCols.length]}; color:#fff; display:flex; align-items:center; justify-content:center; font-size:10px; font-weight:bold; border:2px solid #0f172a; margin-left:${i===0?0:-6}px;'>${av}</div>`).join('') + "</div>";
			} else if (type === "stat_chart") {
				div.style.backgroundColor = ctrl.background_color || "#1e293b";
				div.style.flexDirection = "column";
				div.style.alignItems = "flex-start";
				div.style.padding = "8px 10px";
				div.style.borderRadius = "10px";
				div.innerHTML = "<div style='display:flex; justify-content:space-between; width:100%; font-size:10px; opacity:0.7;'><span style='font-weight:bold; text-transform:uppercase;'>" + (text||'Revenue') + "</span><span style='color:#10b981; font-weight:bold;'>+18.4%</span></div><div style='font-size:18px; font-weight:800; color:var(--accent); margin:2px 0;'>$48,290</div><svg viewBox='0 0 100 20' style='width:100%; height:18px;'><path d='M0 16 L20 10 L40 14 L60 4 L80 8 L100 2' fill='none' stroke='var(--accent)' stroke-width='2'/></svg>";
			} else if (type === "accordion") {
				div.style.backgroundColor = ctrl.background_color || "#1e293b";
				div.style.flexDirection = "column";
				div.style.alignItems = "stretch";
				div.style.borderRadius = "8px";
				div.style.overflow = "hidden";
				div.innerHTML = "<div style='padding:6px 10px; background:rgba(255,255,255,0.06); font-weight:bold; font-size:11px; display:flex; justify-content:space-between;'><span>" + text + "</span><span>▼</span></div><div style='padding:6px 10px; font-size:10px; opacity:0.8;'>Accordion content panel details.</div>";
			} else if (type === "breadcrumb") {
				div.style.backgroundColor = "transparent";
				div.style.border = "none";
				const crumbs = (text || "Home, Projects, App Settings").split(",").map(s=>s.trim());
				div.innerHTML = "<div style='display:flex; align-items:center; gap:4px; font-size:11px;'>" + crumbs.map((cr, i) => `${i>0?'<span style="opacity:0.4;">›</span>':''}<span style='${i===crumbs.length-1?'font-weight:bold; color:var(--accent);':'opacity:0.7;'}'>${cr}</span>`).join('') + "</div>";
			} else if (type === "timeline") {
				div.style.backgroundColor = "transparent";
				div.style.border = "none";
				div.style.flexDirection = "column";
				div.style.alignItems = "flex-start";
				div.style.gap = "6px";
				const steps = (text || "Order Placed, Processing, In Transit, Delivered").split(",").map(s=>s.trim());
				div.innerHTML = steps.slice(0, 3).map((st, i) => `<div style='display:flex; align-items:center; gap:8px; font-size:10px;'><span style='width:8px; height:8px; border-radius:50%; background:${i<=1?'var(--accent)':'rgba(255,255,255,0.2)'};'></span><span style='font-weight:${i<=1?'bold':'normal'}; opacity:${i<=1?1:0.6};'>${st}</span></div>`).join('');
			} else if (type === "toast_card") {
				div.style.backgroundColor = ctrl.background_color || "#1e293b";
				div.style.borderLeft = "4px solid #10b981";
				div.style.borderRadius = "8px";
				div.style.padding = "6px 10px";
				div.style.justifyContent = "space-between";
				div.innerHTML = "<div style='display:flex; align-items:center; gap:8px; font-size:11px;'><span>✅</span><div style='display:flex; flex-direction:column;'><span style='font-weight:bold;'>" + text + "</span><span style='font-size:9px; opacity:0.7;'>Completed successfully</span></div></div><span style='opacity:0.5; font-size:12px;'>✕</span>";
			} else if (type === "time_picker") {
				div.style.backgroundColor = ctrl.background_color || "#1e293b";
				div.style.borderRadius = "6px";
				div.style.padding = "0 8px";
				div.style.justifyContent = "flex-start";
				div.style.gap = "8px";
				div.innerHTML = "<span style='font-size:14px; opacity:0.7;'>🕒</span><span style='font-size:12px;'>09:30 AM</span>";
			} else if (type === "rich_select") {
				div.style.backgroundColor = ctrl.background_color || "#1e293b";
				div.style.borderRadius = "6px";
				div.style.padding = "0 8px";
				div.style.justifyContent = "space-between";
				div.innerHTML = "<div style='display:flex; align-items:center; gap:6px; font-size:11px;'><span style='opacity:0.6;'>🔍</span><span>" + text + "</span></div><span style='font-size:10px; opacity:0.5;'>▼</span>";
			} else if (type === "property_grid") {
				div.style.backgroundColor = ctrl.background_color || "#1e293b";
				div.style.borderRadius = "8px";
				div.style.flexDirection = "column";
				div.style.alignItems = "stretch";
				div.style.overflow = "hidden";
				div.style.fontSize = "10px";
				const props = (text || "Theme: Dark, Font: 13px, AutoSave: True, Version: 1.4.0").split(",").map(s=>s.trim().split(":")).filter(arr=>arr.length===2);
				div.innerHTML = "<div style='padding:4px 8px; background:rgba(255,255,255,0.06); font-weight:bold; color:var(--accent); font-size:10px; border-bottom:1px solid var(--border-color);'>📋 Property Inspector</div><div style='display:flex; flex-direction:column;'>" + props.slice(0,3).map(p=>`<div style='display:flex; justify-content:space-between; padding:3px 8px; border-bottom:1px solid rgba(255,255,255,0.05);'><span style='font-weight:600; opacity:0.8;'>${p[0].trim()}</span><span style='font-family:monospace; color:var(--accent);'>${p[1].trim()}</span></div>`).join('') + "</div>";
			} else if (type === "popup_menu") {
				div.style.backgroundColor = ctrl.background_color || "#1e293b";
				div.style.borderRadius = "8px";
				div.style.boxShadow = "0 6px 16px rgba(0,0,0,0.4)";
				div.style.flexDirection = "column";
				div.style.alignItems = "stretch";
				div.style.padding = "4px";
				div.style.fontSize = "11px";
				const menuItems = (text || "✂️ Cut ⌘X, 📋 Copy ⌘C, ---, 🗑️ Delete ⌫").split(",").map(s=>s.trim());
				div.innerHTML = menuItems.slice(0,4).map(m=>m==='---'?'<div style="height:1px; background:var(--border-color); margin:2px 0;"></div>':`<div style='padding:4px 8px; border-radius:4px; display:flex; justify-content:space-between; font-size:10px;'><span>${m.split(' ')[0]} ${m.split(' ')[1]||''}</span><span style='opacity:0.5; font-family:monospace;'>${m.split(' ')[2]||''}</span></div>`).join('');
			} else if (type === "calendar_view") {
				div.style.backgroundColor = ctrl.background_color || "#1e293b";
				div.style.borderRadius = "10px";
				div.style.flexDirection = "column";
				div.style.alignItems = "stretch";
				div.style.padding = "6px 8px";
				div.style.fontSize = "10px";
				div.innerHTML = "<div style='display:flex; justify-content:space-between; align-items:center; font-weight:bold; padding-bottom:4px; border-bottom:1px solid var(--border-color);'><span>◄</span><span>July 2026</span><span>►</span></div><div style='display:grid; grid-template-columns:repeat(7,1fr); text-align:center; gap:2px; margin-top:4px; opacity:0.6; font-size:9px;'><span>Su</span><span>Mo</span><span>Tu</span><span>We</span><span>Th</span><span>Fr</span><span>Sa</span></div><div style='display:grid; grid-template-columns:repeat(7,1fr); text-align:center; gap:2px; margin-top:2px;'><span>28</span><span>29</span><span>30</span><span style='background:var(--accent); color:#fff; border-radius:50%; font-weight:bold;'>1</span><span>2</span><span>3</span><span>4</span></div>";
			} else if (type === "color_swatch") {
				div.style.backgroundColor = "transparent";
				div.style.border = "none";
				div.style.flexDirection = "column";
				div.style.alignItems = "flex-start";
				div.style.gap = "4px";
				const swCols = ["#0284c7", "#38bdf8", "#10b981", "#f59e0b", "#ef4444", "#7c3aed"];
				div.innerHTML = "<div style='font-size:10px; font-weight:bold; opacity:0.8;'>Color Swatch</div><div style='display:flex; gap:6px; align-items:center;'>" + swCols.map((col,i)=>`<div style='width:20px; height:20px; border-radius:50%; background:${col}; border:${i===0?'2px solid #ffffff':'none'}; box-shadow:0 2px 4px rgba(0,0,0,0.3);'></div>`).join('') + "</div>";
			} else if (type === "file_path_bar") {
				div.style.backgroundColor = ctrl.background_color || "#1e293b";
				div.style.borderRadius = "6px";
				div.style.padding = "0 8px";
				div.style.justifyContent = "space-between";
				div.innerHTML = "<div style='display:flex; align-items:center; gap:6px; font-size:11px; overflow:hidden;'><span style='opacity:0.7;'>📁</span><span style='font-family:monospace; opacity:0.9; white-space:nowrap;'>" + (text || "/Users/app/src") + "</span></div><button style='font-size:9px; font-weight:bold; background:var(--accent); color:#fff; border:none; border-radius:4px; padding:2px 6px; flex-shrink:0;'>Browse</button>";
			} else if (type === "kanban_board") {
				div.style.backgroundColor = ctrl.background_color || "#1e293b";
				div.style.borderRadius = "8px";
				div.style.padding = "6px";
				div.style.gap = "6px";
				div.style.alignItems = "stretch";
				const kbCols = ["To Do (3)", "In Progress (2)", "Done (4)"];
				div.innerHTML = kbCols.map((cName,i)=>`<div style='flex:1; background:rgba(255,255,255,0.05); border-radius:4px; padding:4px; font-size:9px; display:flex; flex-direction:column; gap:4px;'><div style='font-weight:bold; color:var(--accent); border-bottom:1px solid var(--border-color); pb-1;'>${cName}</div><div style='background:rgba(255,255,255,0.08); padding:3px 4px; border-radius:3px;'>● Task #${i+1}</div></div>`).join('');
			} else if (type === "shortcut_recorder") {
				div.style.backgroundColor = ctrl.background_color || "#1e293b";
				div.style.borderRadius = "6px";
				div.style.padding = "0 8px";
				div.style.justifyContent = "space-between";
				const keys = (text || "⌘ Shift P").split(/\s+|\+/);
				div.innerHTML = "<div style='display:flex; gap:4px; align-items:center;'>" + keys.map(k=>`<span style='background:rgba(255,255,255,0.12); padding:2px 5px; border-radius:3px; font-family:monospace; font-size:10px; font-weight:bold; color:var(--accent);'>${k}</span>`).join('') + "</div><span style='font-size:9px; opacity:0.6;'>⌨️ Edit</span>";
			} else if (type === "split_button") {
				div.style.backgroundColor = ctrl.background_color || "var(--accent)";
				div.style.borderRadius = "6px";
				div.style.padding = "0";
				div.style.overflow = "hidden";
				div.innerHTML = "<div style='flex:1; display:flex; align-items:center; justify-content:center; color:#fff; font-size:11px; font-weight:bold; padding:0 8px;'>" + (text || "Save File") + "</div><div style='width:1px; background:rgba(255,255,255,0.3);'></div><div style='padding:0 6px; color:#fff; font-size:10px; display:flex; align-items:center;'>▼</div>";
			} else if (type === "sparkline_table") {
				div.style.backgroundColor = ctrl.background_color || "#1e293b";
				div.style.borderRadius = "8px";
				div.style.padding = "6px 8px";
				div.style.flexDirection = "column";
				div.style.justifyContent = "space-around";
				div.style.fontSize = "10px";
				div.innerHTML = "<div style='display:flex; justify-content:space-between; border-bottom:1px solid rgba(255,255,255,0.08); padding:2px 0;'><span>Revenue</span><span style='color:#10b981; font-weight:bold; font-family:monospace;'>📈 $48.2k</span></div><div style='display:flex; justify-content:space-between; padding:2px 0;'><span>Active Users</span><span style='color:var(--accent); font-weight:bold; font-family:monospace;'>📊 1,420</span></div>";
			} else if (type === "metric_comparison") {
				div.style.backgroundColor = ctrl.background_color || "#1e293b";
				div.style.borderRadius = "8px";
				div.style.padding = "8px";
				div.style.flexDirection = "column";
				div.style.justifyContent = "space-between";
				div.innerHTML = "<div style='display:flex; justify-content:space-between; font-size:9px; font-weight:bold; opacity:0.8;'><span>" + (text || "Monthly Revenue") + "</span><span style='color:#10b981;'>▲ +14.2%</span></div><div style='font-size:16px; font-weight:extrabold; color:var(--accent);'>$84,250</div><div style='height:3px; background:rgba(255,255,255,0.1); border-radius:2px;'><div style='width:75%; height:100%; background:#10b981; border-radius:2px;'></div></div>";
			} else if (type === "activity_feed") {
				div.style.backgroundColor = ctrl.background_color || "#1e293b";
				div.style.borderRadius = "8px";
				div.style.padding = "6px 8px";
				div.style.flexDirection = "column";
				div.style.gap = "4px";
				div.style.fontSize = "10px";
				div.innerHTML = "<div style='font-weight:bold; color:var(--accent); border-bottom:1px solid rgba(255,255,255,0.08); padding-bottom:2px;'>⚡ Activity Stream</div><div style='display:flex; align-items:center; gap:6px;'><span style='background:var(--accent); color:#fff; border-radius:50%; width:14px; height:14px; display:inline-flex; align-items:center; justify-content:center; font-size:8px;'>A</span><span>Alice deployed v1.4 (2m ago)</span></div>";
			} else if (type === "file_tree_tabs") {
				div.style.backgroundColor = ctrl.background_color || "rgba(0,0,0,0.2)";
				div.style.borderRadius = "6px";
				div.style.padding = "2px 4px";
				div.style.gap = "4px";
				div.style.alignItems = "center";
				div.innerHTML = "<div style='background:var(--accent); color:#fff; padding:2px 6px; border-radius:4px; font-size:10px; font-weight:bold; display:flex; gap:4px; align-items:center;'><span>⚡ index.ts*</span><span>✕</span></div><div style='opacity:0.7; font-size:10px; padding:2px 6px;'>📄 API.md</div>";
			} else if (type === "form_checkbox") {
				div.style.backgroundColor = "transparent";
				div.style.border = "none";
				const fg = ctrl.font_color || "inherit";
				div.innerHTML = "<div style='display:flex; flex-direction:column; width:100%; gap:2px;'><span style='font-size:10px; font-weight:bold; opacity:0.8; color:" + fg + "'>" + text + "</span><div style='display:flex; align-items:center; gap:6px; font-size:11px;'><input type='checkbox' checked style='accent-color:var(--accent);'><span>" + (ctrl.placeholder || "Enable Option") + "</span></div></div>";
			} else if (type === "form_radio") {
				div.style.backgroundColor = "transparent";
				div.style.border = "none";
				const fg = ctrl.font_color || "inherit";
				div.innerHTML = "<div style='display:flex; flex-direction:column; width:100%; gap:2px;'><span style='font-size:10px; font-weight:bold; opacity:0.8; color:" + fg + "'>" + text + "</span><div style='display:flex; align-items:center; gap:6px; font-size:11px;'><input type='radio' checked style='accent-color:var(--accent);'><span>" + (ctrl.placeholder || "Select Option") + "</span></div></div>";
			} else if (type === "form_search") {
				div.style.backgroundColor = "transparent";
				div.style.border = "none";
				const fg = ctrl.font_color || "inherit";
				div.innerHTML = "<div style='display:flex; flex-direction:column; width:100%; gap:2px;'><span style='font-size:10px; font-weight:bold; opacity:0.8; color:" + fg + "'>" + text + "</span><div style='display:flex; align-items:center; gap:6px; background:" + (ctrl.background_color || "#1e293b") + "; border:1px solid var(--border-color); border-radius:4px; padding:4px 8px; font-size:11px;'><span>🔍</span><span>Search records...</span></div></div>";
			} else if (type === "form_color") {
				div.style.backgroundColor = "transparent";
				div.style.border = "none";
				const fg = ctrl.font_color || "inherit";
				const hexVal = ctrl.value || "#38bdf8";
				div.innerHTML = "<div style='display:flex; flex-direction:column; width:100%; gap:2px;'><span style='font-size:10px; font-weight:bold; opacity:0.8; color:" + fg + "'>" + text + "</span><div style='display:flex; align-items:center; gap:8px;'><div style='width:24px; height:24px; background:" + hexVal + "; border-radius:4px; border:1px solid var(--border-color);'></div><span style='font-family:monospace; font-size:11px;'>" + hexVal + "</span></div></div>";
			} else if (type === "form_time") {
				div.style.backgroundColor = "transparent";
				div.style.border = "none";
				const fg = ctrl.font_color || "inherit";
				div.innerHTML = "<div style='display:flex; flex-direction:column; width:100%; gap:2px;'><span style='font-size:10px; font-weight:bold; opacity:0.8; color:" + fg + "'>" + text + "</span><div style='display:flex; align-items:center; gap:6px; background:" + (ctrl.background_color || "#1e293b") + "; border:1px solid var(--border-color); border-radius:4px; padding:4px 8px; font-size:11px;'><span>🕒</span><span>09:30 AM</span></div></div>";
			} else if (type === "form_stepper") {
				div.style.backgroundColor = "transparent";
				div.style.border = "none";
				const fg = ctrl.font_color || "inherit";
				const val = ctrl.value !== undefined ? ctrl.value : 5;
				div.innerHTML = "<div style='display:flex; justify-content:space-between; align-items:center; width:100%; gap:8px;'><span style='font-size:11px; font-weight:bold; color:" + fg + "'>" + text + "</span><div style='display:flex; justify-content:space-between; align-items:center; width:100px; background:" + (ctrl.background_color || "#1e293b") + "; border:1px solid var(--border-color); border-radius:4px; padding:2px 6px; font-weight:bold;'><span style='width:20px; height:20px; display:inline-flex; align-items:center; justify-content:center; background:rgba(56,189,248,0.15); color:var(--accent); border-radius:3px;'>−</span><span>" + val + "</span><span style='width:20px; height:20px; display:inline-flex; align-items:center; justify-content:center; background:rgba(56,189,248,0.15); color:var(--accent); border-radius:3px;'>+</span></div></div>";
			} else if (type === "form_code") {
				div.style.backgroundColor = "transparent";
				div.style.border = "none";
				const fg = ctrl.font_color || "inherit";
				div.innerHTML = "<div style='display:flex; flex-direction:column; width:100%; height:100%; gap:2px;'><span style='font-size:10px; font-weight:bold; opacity:0.8; color:" + fg + "'>" + text + "</span><div style='flex:1; background:#0d1117; color:#7dd3fc; border:1px solid var(--border-color); border-radius:6px; padding:6px; font-family:monospace; font-size:11px; overflow:hidden;'>// Code Editor View...</div></div>";
			} else if (type === "form_drop_zone") {
				div.style.backgroundColor = "transparent";
				div.style.border = "none";
				const fg = ctrl.font_color || "inherit";
				div.innerHTML = "<div style='display:flex; flex-direction:column; width:100%; height:100%; gap:2px;'><span style='font-size:10px; font-weight:bold; opacity:0.8; color:" + fg + "'>" + text + "</span><div style='flex:1; border:2px dashed var(--accent); border-radius:6px; display:flex; flex-direction:column; align-items:center; justify-content:center; gap:2px; font-size:10px; opacity:0.85;'><span>📥</span><span>Drop files here</span></div></div>";
			} else if (type === "tabs") {
				div.style.backgroundColor = "transparent";
				div.style.border = "none";
				const tabs = (text || "General, Security, Advanced").split(",").map(s=>s.trim());
				div.innerHTML = "<div style='display:flex; align-items:center; gap:2px; border-bottom:2px solid var(--border-color); width:100%; padding-bottom:2px;'>" + tabs.map((tb, i) => `<span style='padding:2px 10px; font-size:11px; ${i===0?'font-weight:bold; color:var(--accent); border-bottom:2px solid var(--accent);':'opacity:0.7;'}'>${tb}</span>`).join('') + "</div>";
			} else if (type === "tool_bar") {
				div.style.backgroundColor = ctrl.background_color || "#1e293b";
				div.style.borderRadius = "6px";
				div.style.padding = "0 6px";
				const items = (text || "📄 New, 📂 Open, 💾 Save, ⚙️ Settings").split(",").map(s=>s.trim());
				div.innerHTML = "<div style='display:flex; align-items:center; gap:6px; font-size:11px; width:100%;'>" + items.map(it => `<span style='background:rgba(255,255,255,0.08); padding:2px 8px; border-radius:4px; font-weight:600;'>${it}</span>`).join('') + "</div>";
			} else if (type === "status_bar") {
				div.style.backgroundColor = ctrl.background_color || "#090d16";
				div.style.borderTop = "1px solid var(--border-color)";
				div.style.padding = "0 10px";
				div.style.justifyContent = "space-between";
				div.innerHTML = "<div style='display:flex; align-items:center; gap:6px; font-size:10px;'><span style='color:#10b981; font-weight:bold;'>🟢 Ready</span><span>|</span><span>" + (text || "UTF-8 | Line 1, Col 1") + "</span></div><span style='font-size:10px; opacity:0.7;'>100%</span>";
			} else if (type === "split_pane") {
				div.style.backgroundColor = ctrl.background_color || "#0f172a";
				div.style.borderRadius = "6px";
				div.style.border = "1px solid var(--border-color)";
				div.style.overflow = "hidden";
				div.innerHTML = "<div style='flex:1; padding:6px; font-size:10px; background:rgba(255,255,255,0.03);'><div style='font-weight:bold; color:var(--accent);'>Sidebar</div></div><div style='width:3px; background:var(--accent);'></div><div style='flex:2; padding:6px; font-size:10px;'><div style='font-weight:bold; color:var(--accent);'>Main Content</div></div>";
			} else if (type === "pagination") {
				div.style.backgroundColor = "transparent";
				div.style.border = "none";
				div.style.justifyContent = "center";
				div.innerHTML = "<div style='display:flex; align-items:center; gap:4px; font-size:11px;'><span style='padding:2px 6px; background:rgba(255,255,255,0.06); border-radius:3px;'>«</span><span style='padding:2px 8px; background:var(--accent); color:#fff; border-radius:3px; font-weight:bold;'>1</span><span style='padding:2px 8px; background:rgba(255,255,255,0.06); border-radius:3px;'>2</span><span style='padding:2px 8px; background:rgba(255,255,255,0.06); border-radius:3px;'>3</span><span style='padding:2px 6px; background:rgba(255,255,255,0.06); border-radius:3px;'>»</span></div>";
			} else if (type === "command_palette") {
				div.style.backgroundColor = ctrl.background_color || "#1e293b";
				div.style.border = "1px solid var(--accent)";
				div.style.borderRadius = "6px";
				div.style.padding = "0 10px";
				div.style.justifyContent = "space-between";
				div.innerHTML = "<div style='display:flex; align-items:center; gap:6px; font-size:11px;'><span style='color:var(--accent); font-weight:bold;'>⌘</span><span>" + (text || "Type a command...") + "</span></div><span style='font-size:9px; background:rgba(255,255,255,0.1); padding:1px 4px; border-radius:3px;'>ESC</span>";
			} else if (type === "toggle_button") {
				const isChecked = ctrl.checked;
				div.style.backgroundColor = isChecked ? "var(--accent)" : (ctrl.background_color || "rgba(255,255,255,0.08)");
				div.style.color = isChecked ? "#ffffff" : "inherit";
				div.style.borderRadius = "6px";
				div.style.justifyContent = "center";
				div.style.fontWeight = "bold";
				div.style.fontSize = "11px";
				div.innerHTML = isChecked ? "🔒 Locked" : (text || "🔓 Unlocked");
			} else if (type === "sidebar" || type === "w3_sidebar") {
				div.style.backgroundColor = ctrl.background_color || "#1e293b";
				div.style.borderRadius = "8px";
				div.style.flexDirection = "column";
				div.style.alignItems = "stretch";
				div.style.overflow = "hidden";
				div.style.boxShadow = "0 6px 16px rgba(0,0,0,0.3)";
				const items = ["🏠 Dashboard", "📁 Projects", "⚙️ Settings", "❓ Help"];
				div.innerHTML = "<div style='padding:6px 10px; background:rgba(255,255,255,0.06); font-weight:bold; color:var(--accent); font-size:11px; border-bottom:1px solid var(--border-color); display:flex; justify-content:space-between;'><span>" + (text || "Navigation") + "</span><span style='opacity:0.6;'>&times;</span></div><div style='display:flex; flex-direction:column; padding:4px 0;'>" + items.map((it, idx) => `<div style='padding:5px 10px; font-size:10px; ${idx===0 ? 'background:rgba(56,189,248,0.15); color:var(--accent); font-weight:bold;' : 'opacity:0.85;'}'>${it}</div>`).join('') + "</div>";
			} else if (type === "modal" || type === "modal_dialog" || type === "w3_modal") {
				div.style.backgroundColor = ctrl.background_color || "#1e293b";
				div.style.borderRadius = "8px";
				div.style.flexDirection = "column";
				div.style.alignItems = "stretch";
				div.style.overflow = "hidden";
				div.style.boxShadow = "0 8px 24px rgba(0,0,0,0.4)";
				div.innerHTML = "<div style='padding:6px 10px; background:rgba(56,189,248,0.15); font-weight:bold; color:var(--accent); font-size:11px; border-bottom:1px solid var(--border-color); display:flex; justify-content:space-between;'><span>" + (text || "Modal Dialog") + "</span><span style='opacity:0.7;'>&times;</span></div><div style='padding:8px 10px; font-size:10px; opacity:0.85; flex:1;'>Dialog content with clean modal styling.</div><div style='padding:4px 8px; background:rgba(0,0,0,0.2); border-top:1px solid var(--border-color); display:flex; justify-content:flex-end; gap:4px;'><button style='font-size:9px; padding:2px 6px; background:transparent; border:1px solid var(--border-color); color:inherit; border-radius:3px;'>Cancel</button><button style='font-size:9px; padding:2px 8px; background:var(--accent); color:#fff; border:none; border-radius:3px; font-weight:bold;'>OK</button></div>";
			} else if (type === "dropdown_menu" || type === "w3_dropdown") {
				div.style.backgroundColor = "transparent";
				div.style.flexDirection = "column";
				div.style.alignItems = "stretch";
				div.style.overflow = "visible";
				div.innerHTML = "<button style='width:100%; height:100%; background:var(--accent); color:#fff; border:none; border-radius:6px; padding:0 10px; font-size:11px; font-weight:bold; display:flex; align-items:center; justify-content:space-between; box-shadow:0 2px 6px rgba(0,0,0,0.2);'><span>" + (text || "Dropdown Menu") + "</span><span>▼</span></button>";
			} else if (type === "list_group" || type === "w3_list") {
				div.style.backgroundColor = ctrl.background_color || "#1e293b";
				div.style.borderRadius = "8px";
				div.style.flexDirection = "column";
				div.style.alignItems = "stretch";
				div.style.overflow = "hidden";
				const lItems = [["📄 Specifications", "v1.4", "var(--accent)"], ["🗄️ Database", "Online", "#10b981"], ["⚙️ Settings", "Ready", "#f59e0b"]];
				div.innerHTML = lItems.map(it => `<div style='padding:6px 10px; border-bottom:1px solid rgba(255,255,255,0.06); display:flex; justify-content:space-between; align-items:center; font-size:10px;'><span>${it[0]}</span><span style='background:${it[2]}22; color:${it[2]}; padding:1px 6px; border-radius:3px; font-size:9px; font-weight:bold;'>${it[1]}</span></div>`).join('');
			} else if (type === "content_card" || type === "card" || type === "w3_card") {
				div.style.backgroundColor = ctrl.background_color || "#1e293b";
				div.style.borderRadius = "8px";
				div.style.flexDirection = "column";
				div.style.alignItems = "stretch";
				div.style.overflow = "hidden";
				div.style.boxShadow = "0 6px 16px rgba(0,0,0,0.3)";
				div.innerHTML = "<div style='padding:6px 10px; background:rgba(56,189,248,0.15); font-weight:bold; color:var(--accent); font-size:11px; border-bottom:1px solid var(--border-color);'>" + (text || "Content Card") + "</div><div style='height:50px; background:rgba(0,0,0,0.2); display:flex; align-items:center; justify-content:center; font-size:11px; opacity:0.8;'>🖼️ Media Preview</div><div style='padding:8px 10px; font-size:10px; opacity:0.85; flex:1;'>Card description content paragraph.</div><div style='padding:4px 8px; border-top:1px solid var(--border-color); display:flex; justify-content:flex-end;'><button style='padding:2px 8px; font-size:9px; background:var(--accent); color:#fff; border:none; border-radius:3px; font-weight:bold;'>Action</button></div>";
			} else if (type === "callout_panel" || type === "note_panel" || type === "w3_panel") {
				div.style.backgroundColor = "rgba(56,189,248,0.12)";
				div.style.borderLeft = "4px solid var(--accent)";
				div.style.borderRadius = "0 6px 6px 0";
				div.style.padding = "6px 10px";
				div.style.flexDirection = "column";
				div.style.alignItems = "flex-start";
				div.style.justifyContent = "center";
				div.innerHTML = "<div style='font-weight:bold; font-size:11px; color:var(--accent);'>" + (text || "Important Note") + "</div><div style='font-size:10px; opacity:0.85;'>Highlighted callout message with colored accent bar.</div>";
			} else if (type === "tooltip_box" || type === "w3_tooltip") {
				div.style.backgroundColor = "transparent";
				div.style.justifyContent = "center";
				div.style.overflow = "visible";
				div.innerHTML = "<button style='padding:4px 10px; background:rgba(255,255,255,0.08); border:1px solid var(--border-color); border-radius:6px; color:inherit; font-size:11px; font-weight:600;'>Hover Me ℹ️</button>";
			} else if (type === "animated_input" || type === "w3_animated_input") {
				div.style.backgroundColor = "transparent";
				div.style.border = "none";
				div.style.justifyContent = "flex-start";
				div.innerHTML = "<div style='width:130px; height:100%; background:" + (ctrl.background_color || "#1e293b") + "; border:1px solid var(--border-color); border-radius:6px; padding:0 8px; display:flex; align-items:center; gap:6px; font-size:11px;'><span style='opacity:0.6;'>🔍</span><span style='opacity:0.6;'>Expandable...</span></div>";
			} else if (type === "hero_display" || type === "display_container" || type === "w3_display") {
				div.style.backgroundColor = ctrl.background_color || "rgba(15,23,42,0.8)";
				div.style.borderRadius = "8px";
				div.style.border = "1px solid var(--border-color)";
				div.style.overflow = "hidden";
				div.style.boxShadow = "0 4px 12px rgba(0,0,0,0.3)";
				div.innerHTML = "<div style='position:absolute; top:4px; left:6px; background:rgba(0,0,0,0.6); color:#fff; font-size:8px; padding:1px 5px; border-radius:3px; font-weight:bold;'>Top Left</div><div style='position:absolute; top:4px; right:6px; background:var(--accent); color:#fff; font-size:8px; padding:1px 5px; border-radius:3px; font-weight:bold;'>Top Right</div><div style='display:flex; flex-direction:column; align-items:center; justify-content:center; width:100%; height:100%;'><span style='font-weight:bold; font-size:12px; color:var(--accent);'>" + (text || "Hero Display") + "</span><span style='font-size:9px; opacity:0.7;'>Overlays & Position Pins</span></div>";
			} else if (type === "code_snippet" || type === "code_block" || type === "w3_code") {
				div.style.backgroundColor = "#0d1117";
				div.style.borderLeft = "4px solid #10b981";
				div.style.borderRadius = "6px";
				div.style.padding = "6px 8px";
				div.style.flexDirection = "column";
				div.style.alignItems = "stretch";
				div.style.overflow = "hidden";
				div.innerHTML = "<div style='display:flex; justify-content:space-between; font-size:9px; color:#a7f3d0; opacity:0.7;'><span>Code Snippet</span><span>📋 Copy</span></div><div style='font-family:monospace; font-size:10px; color:#a7f3d0; margin-top:2px;'>const app = new StudioApp();</div>";
			} else if (type === "count_badge" || type === "circular_badge" || type === "w3_badge") {
				div.style.backgroundColor = "transparent";
				div.style.border = "none";
				div.style.justifyContent = "center";
				const bCol = ctrl.background_color || "#ef4444";
				div.innerHTML = "<div style='width:28px; height:28px; border-radius:50%; background:" + bCol + "; color:#fff; display:flex; align-items:center; justify-content:center; font-weight:bold; font-size:11px; box-shadow:0 2px 6px rgba(0,0,0,0.3);'>" + (text || "8") + "</div>";
			} else if (type === "button_group" || type === "button_bar" || type === "w3_button_group") {
				div.style.backgroundColor = "transparent";
				div.style.border = "none";
				div.style.justifyContent = "center";
				div.innerHTML = "<div style='display:flex; width:100%; height:100%; border-radius:6px; overflow:hidden; border:1px solid var(--border-color);'><button style='flex:1; background:var(--accent); color:#fff; border:none; border-right:1px solid rgba(255,255,255,0.2); font-size:10px; font-weight:bold;'>Left</button><button style='flex:1; background:rgba(255,255,255,0.06); color:inherit; border:none; border-right:1px solid rgba(255,255,255,0.2); font-size:10px; font-weight:bold;'>Middle</button><button style='flex:1; background:rgba(255,255,255,0.06); color:inherit; border:none; font-size:10px; font-weight:bold;'>Right</button></div>";
			} else if (type === "slideshow" || type === "carousel" || type === "w3_slideshow") {
				div.style.backgroundColor = ctrl.background_color || "#1e293b";
				div.style.borderRadius = "8px";
				div.style.border = "1px solid var(--border-color)";
				div.style.flexDirection = "column";
				div.style.alignItems = "stretch";
				div.style.overflow = "hidden";
				div.innerHTML = "<div style='flex:1; display:flex; align-items:center; justify-content:space-between; padding:0 8px;'><span style='font-size:12px; cursor:pointer;'>❮</span><div style='text-align:center;'><span style='font-weight:bold; font-size:11px; color:var(--accent);'>" + (text || "Slide 1") + "</span><div style='font-size:9px; opacity:0.7;'>Carousel View</div></div><span style='font-size:12px; cursor:pointer;'>❯</span></div><div style='padding:2px 8px; background:rgba(0,0,0,0.2); display:flex; justify-content:space-between; font-size:9px; opacity:0.8;'><span>1 / 3</span><span>● ○ ○</span></div>";
			} else {
				if (ctrl.background_color) div.style.backgroundColor = ctrl.background_color;
				const fg = ctrl.font_color || "#ffffff";
				div.innerHTML = "<span class='control-caption' style='color:" + fg + "'>" + text + "</span>";
			}
		}

		function deselectControl(e) {
			if (wasMarqueeSelecting) {
				wasMarqueeSelecting = false;
				return;
			}
			if (e.shiftKey || e.metaKey || e.ctrlKey) return;
			if (e.target.id === "formCanvas" || e.target.id === "windowFrame" || e.target.id === "canvasViewport") {
				selectedIndices = [];
				renderCanvasSelectionOnly();
				renderTree();
				populateInspector();
			}
		}

		function setupMarqueeSelection() {
			const viewport = document.getElementById("canvasViewport");
			const canvas = document.getElementById("formCanvas");
			const marquee = document.getElementById("marqueeBox");
			let startX = 0, startY = 0, isSelecting = false, marqueeMoved = false;
			let initialSelectedAtMarqueeStart = [];

			viewport.addEventListener("mousedown", (e) => {
				if (e.target.classList.contains("designer-control") || e.target.closest(".designer-control") || e.target.closest(".inspector-sidebar") || e.target.closest(".palette-sidebar") || e.target.closest(".app-header") || e.target.closest(".canvas-toolbar")) return;
				if (e.button !== 0) return;
				isSelecting = true;
				marqueeMoved = false;
				const isToggle = e.shiftKey || e.metaKey || e.ctrlKey;
				initialSelectedAtMarqueeStart = isToggle ? [...selectedIndices] : [];

				const rect = canvas.getBoundingClientRect();
				const scrollL = canvas.scrollLeft || 0;
				const scrollT = canvas.scrollTop || 0;
				startX = (e.clientX - rect.left + scrollL) / canvasScale;
				startY = (e.clientY - rect.top + scrollT) / canvasScale;

				marquee.style.left = startX + "px";
				marquee.style.top = startY + "px";
				marquee.style.width = "0px";
				marquee.style.height = "0px";
				marquee.style.display = "block";

				const onMouseMove = (me) => {
					if (!isSelecting) return;
					const scrollL = canvas.scrollLeft || 0;
					const scrollT = canvas.scrollTop || 0;
					const curX = (me.clientX - rect.left + scrollL) / canvasScale;
					const curY = (me.clientY - rect.top + scrollT) / canvasScale;
					if (Math.abs(curX - startX) > 3 || Math.abs(curY - startY) > 3) {
						marqueeMoved = true;
						wasMarqueeSelecting = true;
					}

					const left = Math.min(startX, curX);
					const top = Math.min(startY, curY);
					const width = Math.abs(curX - startX);
					const height = Math.abs(curY - startY);

					marquee.style.left = left + "px";
					marquee.style.top = top + "px";
					marquee.style.width = width + "px";
					marquee.style.height = height + "px";

					let newSelected = [];
					formSpec.controls.forEach((c, idx) => {
						// panels included
						if (c.x < left + width && c.x + c.width > left &&
							c.y < top + height && c.y + c.height > top) {
							newSelected.push(idx);
						}
					});
					selectedIndices = Array.from(new Set([...initialSelectedAtMarqueeStart, ...newSelected]));
					renderCanvasSelectionOnly();
				};

				const onMouseUp = () => {
					isSelecting = false;
					marquee.style.display = "none";
					window.removeEventListener("mousemove", onMouseMove);
					window.removeEventListener("mouseup", onMouseUp);
					renderTree();
					populateInspector();
				};

				window.addEventListener("mousemove", onMouseMove);
				window.addEventListener("mouseup", onMouseUp);
			});
		}

		function renderCanvasSelectionOnly() {
			document.querySelectorAll(".designer-control").forEach((div) => {
				const idx = parseInt(div.dataset.ctrlIndex, 10);
				if (selectedIndices.includes(idx)) {
					div.classList.add("selected");
				} else {
					div.classList.remove("selected");
				}
			});
			const canvasStats = document.getElementById("canvasStats");
			if (canvasStats) {
				canvasStats.textContent = "Form: " + formSpec.width + "x" + formSpec.height + " | Controls: " + formSpec.controls.length + (selectedIndices.length > 0 ? " (Selected: " + selectedIndices.length + ")" : "");
			}
		}

		function renderCanvas() {
			// Update empty state visibility
			const emptyState = document.getElementById('canvasEmptyState');
			if (emptyState) emptyState.style.display = (formSpec.controls && formSpec.controls.length > 0) ? 'none' : 'flex';
			// Update control count in status bar
			const countEl = document.getElementById('statusCount');
			if (countEl) countEl.textContent = (formSpec.controls ? formSpec.controls.length : 0) + ' control' + (formSpec.controls && formSpec.controls.length !== 1 ? 's' : '');

			const canvas = document.getElementById("formCanvas");
			canvas.querySelectorAll(".designer-control").forEach(el => el.remove());
			canvas.style.backgroundColor = formSpec.background_color || "#0f172a";
			canvas.style.color = formSpec.font_color || "#f8fafc";

			const winHeaderEl = document.getElementById("winTitleHeader");
			if (winHeaderEl) winHeaderEl.textContent = formSpec.title || "Delphi/VB RAD Form Studio";

			const statsEl = document.getElementById("canvasStats");
			if (statsEl) statsEl.textContent = "Form: " + formSpec.width + "x" + formSpec.height + " | Controls: " + formSpec.controls.length + (selectedIndices.length > 0 ? " (Selected: " + selectedIndices.length + ")" : "");

			formSpec.controls.forEach((ctrl, idx) => {
				const div = document.createElement("div");
				div.className = "designer-control" + (selectedIndices.includes(idx) ? " selected" : "");
				div.setAttribute("draggable", "false");
				div.dataset.ctrlIndex = String(idx);
				syncControlDom(ctrl, div, null);
				renderControlContent(ctrl, div);

				const dimBadge = document.createElement("span");
				dimBadge.className = "dim-badge";
				dimBadge.textContent = ctrl.id + " (" + ctrl.width + "x" + ctrl.height + ")";
				div.appendChild(dimBadge);

				if (isTabOrderMode) {
					const tabBadge = document.createElement("div");
					tabBadge.className = "tab-order-badge";
					const tVal = (ctrl.tab_order !== undefined && ctrl.tab_order !== null && ctrl.tab_order >= 0) ? ctrl.tab_order : idx;
					tabBadge.textContent = String(tVal);
					div.appendChild(tabBadge);
				}

				div.onmouseenter = () => {
					if (isLiveHoverMode) {
						if (ctrl.hover_color) {
							div.style.backgroundColor = ctrl.hover_color;
						} else {
							div.style.filter = "brightness(1.25)";
							div.style.boxShadow = "0 0 12px rgba(56, 189, 248, 0.4)";
						}
						if (ctrl.hover_text_color) div.style.color = ctrl.hover_text_color;
						const statusMsg = document.getElementById("statusMsg");
						const clickEvt = ctrl.event_handlers ? ctrl.event_handlers["onClick"] : null;
						if (statusMsg) statusMsg.textContent = "⚡ Live Hover Enter: " + ctrl.id + (clickEvt ? " [Click Handler Ready]" : "");
					}
				};

				div.onmouseleave = () => {
					if (isLiveHoverMode) {
						div.style.filter = "";
						div.style.boxShadow = "";
						syncControlDom(ctrl, div, dimBadge);
						renderControlContent(ctrl, div);
						const statusMsg = document.getElementById("statusMsg");
						if (statusMsg) statusMsg.textContent = "Live Hover Exit: " + ctrl.id;
					}
				};

				div.ondblclick = (e) => {
					selectControl(idx, e);
					if (ctrl.control_type === "radio") {
						formSpec.controls.forEach(c => {
							if (c.control_type === "radio") c.checked = false;
						});
						ctrl.checked = true;
						renderCanvas();
						renderCode();
						populateInspector();
						syncSpecToV();
						const statusMsg = document.getElementById("statusMsg");
						if (statusMsg) statusMsg.textContent = "Radio option selected: " + ctrl.text;
						return;
					} else if (ctrl.control_type === "checkbox" || ctrl.control_type === "switch" || ctrl.control_type === "form_switch") {
						ctrl.checked = !ctrl.checked;
						renderCanvas();
						renderCode();
						populateInspector();
						syncSpecToV();
						const statusMsg = document.getElementById("statusMsg");
						if (statusMsg) statusMsg.textContent = "Toggled " + ctrl.id + ": " + ctrl.checked;
						return;
					}
					switchTab("tabEvents");
					autoGenerateEvents();
				};

				let isDragging = false;
				let startX, startY, origX, origY;
				let initialPositions = [];
				let hasMoved = false;

				div.onmousedown = (e) => {
					if (e.button !== 0) return;
					if (e.target.classList.contains("resize-handle")) return;
					if (isTabOrderMode) {
						e.preventDefault();
						e.stopPropagation();
						ctrl.tab_order = nextTabSeq++;
						renderCanvas();
						renderCode();
						populateInspector();
						const statusMsg = document.getElementById("statusMsg");
						if (statusMsg) statusMsg.textContent = "Assigned Tab Order [" + ctrl.tab_order + "] to " + ctrl.id;
						return;
					}
					if (isLiveHoverMode) {
						e.preventDefault();
						e.stopPropagation();
						// Button press animation
						div.style.transform = "scale(0.96)";
						setTimeout(() => { div.style.transform = ""; }, 150);

						if (ctrl.control_type === "radio") {
							formSpec.controls.forEach(c => {
								if (c.control_type === "radio") c.checked = false;
							});
							ctrl.checked = true;
							renderCanvas();
							renderCode();
							populateInspector();
							syncSpecToV();
						} else if (ctrl.control_type === "checkbox" || ctrl.control_type === "switch" || ctrl.control_type === "form_switch") {
							ctrl.checked = !ctrl.checked;
							renderCanvas();
							renderCode();
							populateInspector();
							syncSpecToV();
						}
						const statusMsg = document.getElementById("statusMsg");
						const clickEvt = ctrl.event_handlers ? ctrl.event_handlers["onClick"] : null;
						if (clickEvt) {
							try {
								eval(clickEvt);
								if (statusMsg) statusMsg.textContent = "⚡ Live Click Executed on " + ctrl.id + " -> Evaluated onClick code successfully!";
							} catch(err) {
								if (statusMsg) statusMsg.textContent = "⚡ Live Click on " + ctrl.id + " -> Handler: " + clickEvt;
							}
						} else {
							if (statusMsg) statusMsg.textContent = "⚡ Live Click Executed on " + ctrl.id + " (checked: " + (ctrl.checked !== undefined ? ctrl.checked : 'N/A') + ")";
						}
						return;
					}
					if (ctrl.locked) return;

					e.preventDefault();
					e.stopPropagation();

					const isShift = e.shiftKey;
					const isCtrl = e.metaKey || e.ctrlKey;

					if (isShift && !isCtrl) {
						if (lastAnchorIdx === null || lastAnchorIdx === undefined || lastAnchorIdx < 0 || lastAnchorIdx >= formSpec.controls.length) {
							lastAnchorIdx = idx;
							selectedIndices = [idx];
						} else {
							selectedIndices = getControlsInRange(lastAnchorIdx, idx);
						}
						renderCanvasSelectionOnly();
						renderTree();
						populateInspector();
						const statusMsg = document.getElementById("statusMsg");
						if (statusMsg) {
							const anchorName = formSpec.controls[lastAnchorIdx] ? formSpec.controls[lastAnchorIdx].id : "start";
							const targetName = formSpec.controls[idx] ? formSpec.controls[idx].id : "end";
							statusMsg.textContent = "Selected range of " + selectedIndices.length + " control(s) from " + anchorName + " to " + targetName + " (MS Access Shift-Click).";
						}
					} else if (isShift && isCtrl) {
						if (lastAnchorIdx === null || lastAnchorIdx === undefined || lastAnchorIdx < 0 || lastAnchorIdx >= formSpec.controls.length) {
							lastAnchorIdx = idx;
							if (!selectedIndices.includes(idx)) selectedIndices.push(idx);
						} else {
							const range = getControlsInRange(lastAnchorIdx, idx);
							selectedIndices = Array.from(new Set([...selectedIndices, ...range]));
						}
						renderCanvasSelectionOnly();
						renderTree();
						populateInspector();
					} else if (isCtrl) {
						const existingIndex = selectedIndices.indexOf(idx);
						if (existingIndex >= 0) {
							selectedIndices.splice(existingIndex, 1);
						} else {
							selectedIndices.push(idx);
						}
						lastAnchorIdx = idx;
						renderCanvasSelectionOnly();
						renderTree();
						populateInspector();
					} else {
						if (ctrl.control_type === "panel") {
							const children = getChildControlIndicesOfPanel(idx);
							selectedIndices = [idx, ...children];
							renderCanvasSelectionOnly();
							renderTree();
							populateInspector();
						} else if (!selectedIndices.includes(idx)) {
							// Not in current selection — collapse to this control
							selectedIndices = [idx];
							renderCanvasSelectionOnly();
							renderTree();
							populateInspector();
						}
						// NOTE: if idx IS already in selectedIndices, keep multi-selection intact
						// so dragging moves all selected controls. Collapse to single happens
						// only on mouseup if no drag occurred (see onMouseUp below).
						lastAnchorIdx = idx;
					}

					isDragging = false;
					hasMoved = false;
					startX = e.clientX;
					startY = e.clientY;
					origX = ctrl.x;
					origY = ctrl.y;

					const onMouseMove = (me) => {
						let dx = (me.clientX - startX) / canvasScale;
						let dy = (me.clientY - startY) / canvasScale;

						if (!hasMoved && (Math.abs(dx) > 2 || Math.abs(dy) > 2)) {
							hasMoved = true;
							isDragging = true;
							saveHistoryState();
							let allToMove = new Set(selectedIndices);
							selectedIndices.forEach(i => {
								if (formSpec.controls[i] && formSpec.controls[i].control_type === "panel") {
									const children = getChildControlIndicesOfPanel(i);
									children.forEach(cIdx => allToMove.add(cIdx));
								}
							});
							initialPositions = Array.from(allToMove).map(i => ({ idx: i, x: formSpec.controls[i].x, y: formSpec.controls[i].y }));
						}

						if (!hasMoved) return;
						me.preventDefault();

						if (selectedIndices.length === 1) {
							checkSmartSnapGuides(ctrl, origX + dx, origY + dy);
						}

						initialPositions.forEach(pos => {
							let newX = pos.x + dx;
							let newY = pos.y + dy;

							if (snapToGrid) {
								newX = Math.round(newX / 8) * 8;
								newY = Math.round(newY / 8) * 8;
							}

							let targetCtrl = formSpec.controls[pos.idx];
							if (!targetCtrl.locked) {
								targetCtrl.x = Math.max(0, Math.round(newX));
								targetCtrl.y = Math.max(0, Math.round(newY));

								let domEl = canvas.querySelector('.designer-control[data-ctrl-index="'+ pos.idx + '"]');
								if (domEl) {
									domEl.style.left = targetCtrl.x + "px";
									domEl.style.top = targetCtrl.y + "px";
								}
							}
						});

						if (selectedIndices.length === 1) {
							const propXEl = document.getElementById("propX");
							if (propXEl) propXEl.value = ctrl.x;
							const propYEl = document.getElementById("propY");
							if (propYEl) propYEl.value = ctrl.y;
							document.getElementById("statusMsg").textContent = "Moving " + ctrl.id + " to (" + ctrl.x + ", " + ctrl.y + ")";
						} else {
							document.getElementById("statusMsg").textContent = "Moving " + selectedIndices.length + " controls";
						}
					};

					const onMouseUp = () => {
						hideSmartSnapGuides();
						window.removeEventListener("mousemove", onMouseMove);
						window.removeEventListener("mouseup", onMouseUp);

						if (!hasMoved) {
							if (!isShift && !isCtrl && selectedIndices.length > 1 && selectedIndices.includes(idx)) {
								selectedIndices = [idx];
								lastAnchorIdx = idx;
								renderCanvasSelectionOnly();
								renderTree();
								populateInspector();
							}
						} else {
							renderCanvas();
							renderCode();
							renderTree();
							populateInspector();
							syncSpecToV();
						}
					};

					window.addEventListener("mousemove", onMouseMove);
					window.addEventListener("mouseup", onMouseUp);
				};

				// Resize Handles
				if (!ctrl.locked) {
					["nw", "n", "ne", "e", "se", "s", "sw", "w"].forEach(handlePos => {
						const handle = document.createElement("div");
						handle.className = "resize-handle handle-" + handlePos;
						handle.setAttribute("draggable", "false");
						handle.title = "Drag to resize | Double-click edge: Size to Widest/Tallest (MS Access style)";

						handle.ondblclick = (dbe) => {
							dbe.preventDefault();
							dbe.stopPropagation();
							if (selectedIndices.length > 1) {
								if (handlePos === "e" || handlePos === "w") {
									equalizeSize("width", "widest");
									document.getElementById("statusMsg").textContent = "⚡ MS Access Double-Click: Resized " + selectedIndices.length + " controls to Widest.";
								} else if (handlePos === "n" || handlePos === "s") {
									equalizeSize("height", "tallest");
									document.getElementById("statusMsg").textContent = "⚡ MS Access Double-Click: Resized " + selectedIndices.length + " controls to Tallest.";
								} else {
									equalizeSize("width", "widest");
									equalizeSize("height", "tallest");
									document.getElementById("statusMsg").textContent = "⚡ MS Access Double-Click: Resized " + selectedIndices.length + " controls to Widest & Tallest.";
								}
							} else {
								fitControlToContent();
							}
						};

						handle.onmousedown = (he) => {
							if (he.button !== 0) return;
							he.preventDefault();
							he.stopPropagation();

							saveHistoryState();
							let rStartX = he.clientX;
							let rStartY = he.clientY;

							const targetIndices = selectedIndices.includes(idx) ? selectedIndices : [idx];
							const initialGeometries = targetIndices.map(i => ({
								idx: i,
								ctrl: formSpec.controls[i],
								x: formSpec.controls[i].x,
								y: formSpec.controls[i].y,
								w: formSpec.controls[i].width,
								h: formSpec.controls[i].height
							}));

							const onResizeMove = (rme) => {
								rme.preventDefault();
								let rdx = (rme.clientX - rStartX) / canvasScale;
								let rdy = (rme.clientY - rStartY) / canvasScale;

								initialGeometries.forEach(geo => {
									let tCtrl = geo.ctrl;
									if (tCtrl.locked) return;

									if (handlePos.includes("e")) {
										tCtrl.width = Math.max(20, Math.round(geo.w + rdx));
									}
									if (handlePos.includes("w")) {
										let nw = Math.max(20, Math.round(geo.w - rdx));
										tCtrl.x = Math.round(geo.x + (geo.w - nw));
										tCtrl.width = nw;
									}
									if (handlePos.includes("s")) {
										tCtrl.height = Math.max(4, Math.round(geo.h + rdy));
									}
									if (handlePos.includes("n")) {
										let nh = Math.max(4, Math.round(geo.h - rdy));
										tCtrl.y = Math.round(geo.y + (geo.h - nh));
										tCtrl.height = nh;
									}

									const targetDom = canvas.querySelector('.designer-control[data-ctrl-index="' + geo.idx + '"]');
									if (targetDom) {
										const badgeEl = targetDom.querySelector('.dim-badge');
										syncControlDom(tCtrl, targetDom, badgeEl);
									}
								});

								if (selectedIndices.length === 1) {
									const propXEl = document.getElementById("propX");
									if (propXEl) propXEl.value = ctrl.x;
									const propYEl = document.getElementById("propY");
									if (propYEl) propYEl.value = ctrl.y;
									const propWEl = document.getElementById("propWidth");
									if (propWEl) propWEl.value = ctrl.width;
									const propHEl = document.getElementById("propHeight");
									if (propHEl) propHEl.value = ctrl.height;
									document.getElementById("statusMsg").textContent = "Resizing " + ctrl.id + " to " + ctrl.width + "x" + ctrl.height;
								} else {
									document.getElementById("statusMsg").textContent = "Resizing " + initialGeometries.length + " selected controls simultaneously.";
								}
							};

							const onResizeUp = () => {
								window.removeEventListener("mousemove", onResizeMove);
								window.removeEventListener("mouseup", onResizeUp);
								renderCanvas();
								renderCode();
								renderTree();
								populateInspector();
								syncSpecToV();
							};

							window.addEventListener("mousemove", onResizeMove);
							window.addEventListener("mouseup", onResizeUp);
						};
						div.appendChild(handle);
					});
				}

				canvas.appendChild(div);
			});
		}

		function checkSmartSnapGuides(ctrl, newX, newY) {
			const lineH = document.getElementById("snapLineH");
			const lineV = document.getElementById("snapLineV");
			const gapBadge = document.getElementById("gapBadge");
			if (!lineH || !lineV) return;
			let showH = false, showV = false;

			formSpec.controls.forEach((other) => {
				if (other.id === ctrl.id) return;
				if (Math.abs(newY - other.y) < 6) { showH = true; lineH.style.top = other.y + "px"; }
				if (Math.abs((newY + ctrl.height) - (other.y + other.height)) < 6) { showH = true; lineH.style.top = (other.y + other.height) + "px"; }
				if (Math.abs(newX - other.x) < 6) { showV = true; lineV.style.left = other.x + "px"; }
				if (Math.abs((newX + ctrl.width) - (other.x + other.width)) < 6) { showV = true; lineV.style.left = (other.x + other.width) + "px"; }

				const gapX = Math.abs(newX - (other.x + other.width));
				if (gapX < 30 && Math.abs(newY - other.y) < 20) {
					gapBadge.style.left = (other.x + other.width + gapX / 2) + "px";
					gapBadge.style.top = (newY + 4) + "px";
					gapBadge.textContent = Math.round(gapX) + "px";
					gapBadge.style.display = "block";
				}
			});

			lineH.style.display = showH ? "block" : "none";
			lineV.style.display = showV ? "block" : "none";
		}

		function hideSmartSnapGuides() {
			const lineH = document.getElementById("snapLineH");
			const lineV = document.getElementById("snapLineV");
			const gapBadge = document.getElementById("gapBadge");
			if (lineH) lineH.style.display = "none";
			if (lineV) lineV.style.display = "none";
			if (gapBadge) gapBadge.style.display = "none";
		}
