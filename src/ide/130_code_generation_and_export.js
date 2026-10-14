
		function syncSpecToV() {
			const payload = JSON.stringify(formSpec);
			if (window.syncState) window.syncState(payload);
		}

		function renderCode() {
			scheduleDraftSave();
			const jsonStr = JSON.stringify(formSpec, null, 2);
			const jsonEl = document.getElementById("jsonPreviewText");
			if (jsonEl) jsonEl.value = jsonStr;

			let vcode = "module main\n\nimport simplegui\n\nfn main() {\n";
			vcode += "  mut win := simplegui.new_simple_window('" + formSpec.title.replace(/'/g, "\\'") + "', " + formSpec.width + ", " + formSpec.height + ")\n";
			vcode += "  win.set_background_color('" + formSpec.background_color + "')\n";
			vcode += "    .set_font_color('" + formSpec.font_color + "')\n";
			vcode += "    .set_padding(" + (formSpec.padding || 20) + ")\n";
			vcode += "    .set_spacing(" + (formSpec.spacing || 12) + ")\n\n";

			let sorted = [...formSpec.controls].filter(c => c.visible !== false);
			sorted.sort((a, b) => {
				if (Math.abs(a.y - b.y) > 25) return a.y - b.y;
				return a.x - b.x;
			});

			let rows = [];
			let currentRow = [];
			let currentY = -1000;

			sorted.forEach(c => {
				if (currentRow.length === 0) {
					currentRow.push(c);
					currentY = c.y;
				} else if (Math.abs(c.y - currentY) <= 25) {
					currentRow.push(c);
				} else {
					rows.push(currentRow);
					currentRow = [c];
					currentY = c.y;
				}
			});
			if (currentRow.length > 0) rows.push(currentRow);

			rows.forEach((row, rIdx) => {
				let isMulti = row.length > 1;
				if (isMulti) vcode += "  win.begin_row('row_" + (rIdx + 1) + "')\n";
				row.forEach(c => {
					const cleanText = c.text ? c.text.replace(/'/g, "\\'") : c.id;
					vcode += "  win.add_" + (c.control_type || "button") + "('" + c.id + "', '" + cleanText + "')\n";
					if (c.width) vcode += "  win.set_control_width('" + c.id + "', " + c.width + ")\n";
					if (c.height) vcode += "  win.set_control_height('" + c.id + "', " + c.height + ")\n";
					if (c.font_color && c.font_color !== "#ffffff") vcode += "  win.set_control_font_color('" + c.id + "', '" + c.font_color + "')\n";
					if (c.background_color) vcode += "  win.set_control_background_color('" + c.id + "', '" + c.background_color + "')\n";
				});
				if (isMulti) vcode += "  win.end_row()\n";
			});

			vcode += "\n  // RAD Event Bindings\n";
			let handlers = [];
			formSpec.controls.forEach(c => {
				if (c.cursor && c.cursor !== "default") {
					vcode += "  win.set_control_cursor('" + c.id + "', '" + c.cursor + "')\n";
				}
				if (c.event_handlers) {
					for (let evt in c.event_handlers) {
						let fname = c.event_handlers[evt];
						if (fname && fname.trim()) {
							let h_clean = fname.trim();
							if (evt === "onClick") {
								vcode += "  win.on_click('" + c.id + "', " + h_clean + ")\n";
							} else if (evt === "onChange") {
								vcode += "  win.on_change('" + c.id + "', " + h_clean + ")\n";
							} else if (evt === "onHover" || evt === "onMouseEnter") {
								vcode += "  win.on_hover('" + c.id + "', " + h_clean + ")\n";
							} else if (evt === "onHoverExit" || evt === "onMouseLeave") {
								vcode += "  win.on_hover_exit('" + c.id + "', " + h_clean + ")\n";
							} else if (evt === "onDoubleClick") {
								vcode += "  win.add_context_menu_item('" + c.id + "', 'Double Click', " + h_clean + ")\n";
							} else if (evt === "onFocus") {
								vcode += "  // win.on_focus('" + c.id + "', " + h_clean + ")\n";
							} else if (evt === "onBlur") {
								vcode += "  // win.on_blur('" + c.id + "', " + h_clean + ")\n";
							} else if (evt === "onKeyDown") {
								vcode += "  // win.on_key_down('" + c.id + "', " + h_clean + ")\n";
							} else if (evt === "onKeyUp") {
								vcode += "  // win.on_key_up('" + c.id + "', " + h_clean + ")\n";
							} else if (evt === "onMouseDown") {
								vcode += "  // win.on_mouse_down('" + c.id + "', " + h_clean + ")\n";
							} else if (evt === "onMouseUp") {
								vcode += "  // win.on_mouse_up('" + c.id + "', " + h_clean + ")\n";
							}
							handlers.push({ name: h_clean, id: c.id, evt: evt });
						}
					}
				}
			});

			vcode += "\n  win.run()\n}\n\n";
			vcode += "// RAD Event Callback Placeholders\n";
			handlers.forEach(h => {
				if (h.evt === "onChange") {
					vcode += "fn " + h.name + "(mut win simplegui.SimpleWindow, value string) {\n";
					vcode += "  win.set_status('Event triggered: " + h.name + " on " + h.id + " (Value: ' + value + ')')\n";
					vcode += "  // TODO: Implement custom RAD logic\n}\n\n";
				} else {
					vcode += "fn " + h.name + "(mut win simplegui.SimpleWindow) {\n";
					vcode += "  win.set_status('Event triggered: " + h.name + " on " + h.id + "')\n";
					vcode += "  // TODO: Implement custom RAD logic\n}\n\n";
				}
			});

			const codeEl = document.getElementById("codePreviewText");
			if (codeEl) codeEl.value = vcode;

			const htmlStr = generateHTMLCode();
			const htmlEl = document.getElementById("htmlPreviewText");
			if (htmlEl) htmlEl.value = htmlStr;

			const bunTsEl = document.getElementById("bunTsPreviewText");
			if (bunTsEl) bunTsEl.value = generateBunTSCode();

			syncSpecToV();
		}

		function generateHTMLCode() {
			const bg = formSpec.background_color || "#0f172a";
			const fg = formSpec.font_color || "#f8fafc";
			let html = "<!DOCTYPE html>\n<html lang=\"en\">\n<head>\n";
			html += "  <meta charset=\"utf-8\">\n";
			html += "  <meta name=\"viewport\" content=\"width=device-width, initial-scale=1.0\">\n";
			html += "  <title>" + (formSpec.title || "Form").replace(/</g, "&lt;") + "</title>\n";
			html += "  <style>\n";
			html += "    * { box-sizing: border-box; margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; }\n";
			html += "    body { background-color: " + bg + "; color: " + fg + "; display: flex; justify-content: center; align-items: center; min-height: 100vh; padding: 20px; }\n";
			html += "    .form-window { position: relative; width: " + (formSpec.width || 840) + "px; min-height: " + (formSpec.height || 560) + "px; background-color: " + bg + "; border: 1px solid rgba(255, 255, 255, 0.1); border-radius: 12px; box-shadow: 0 20px 40px rgba(0,0,0,0.5); padding: " + (formSpec.padding || 20) + "px; overflow: hidden; }\n";
			html += "    .form-title { font-size: 20px; font-weight: 700; margin-bottom: 16px; color: " + fg + "; border-bottom: 1px solid rgba(255, 255, 255, 0.08); padding-bottom: 10px; }\n";
			html += "    .control-item { position: absolute; box-sizing: border-box; display: flex; align-items: center; transition: all 0.15s ease; }\n";
			html += "    .control-item.panel-ctrl { align-items: flex-start; justify-content: flex-start; }\n";
			html += "    .btn-ctrl { display: inline-flex; align-items: center; justify-content: center; font-weight: 600; border-radius: 6px; border: 1px solid rgba(255, 255, 255, 0.15); cursor: pointer; text-decoration: none; }\n";
			html += "    .btn-ctrl:hover { filter: brightness(1.15); transform: translateY(-1px); }\n";
			html += "    .input-ctrl { background: rgba(255, 255, 255, 0.05); border: 1px solid rgba(255, 255, 255, 0.15); border-radius: 6px; color: inherit; padding: 6px 12px; outline: none; width: 100%; height: 100%; }\n";
			html += "    .input-ctrl:focus { border-color: #38bdf8; box-shadow: 0 0 0 2px rgba(56, 189, 248, 0.25); }\n";
			html += "    .panel-ctrl { border: 1px solid rgba(255, 255, 255, 0.1); border-radius: 8px; background: rgba(255, 255, 255, 0.03); padding: 10px 14px; font-size: 14px; font-weight: 700; align-items: flex-start; justify-content: flex-start; }\n";
			html += "    .badge-ctrl { display: inline-flex; align-items: center; justify-content: center; padding: 4px 10px; border-radius: 9999px; font-size: 11px; font-weight: 700; }\n";
			html += "    /* Studio Extended Controls Modern Styles */\n";
			html += "    .rad-card { box-shadow: 0 4px 14px rgba(0,0,0,0.25); border: 1px solid rgba(255,255,255,0.1); border-radius: 8px; overflow: hidden; }\n";
			html += "    .rad-elevation-2 { box-shadow: 0 16px 36px rgba(0,0,0,0.35); }\n";
			html += "    .rad-dropdown-menu { display: none; position: absolute; top: calc(100% + 4px); left: 0; min-width: 160px; background: #1e293b; border: 1px solid rgba(255,255,255,0.15); border-radius: 6px; z-index: 999; box-shadow: 0 10px 24px rgba(0,0,0,0.3); overflow: hidden; }\n";
			html += "    .rad-tooltip-container { position: relative; display: inline-flex; }\n";
			html += "    .rad-tooltip-bubble { display: none; position: absolute; bottom: calc(100% + 8px); left: 50%; transform: translateX(-50%); background: #0f172a; color: #fff; padding: 6px 12px; border-radius: 6px; font-size: 11px; white-space: nowrap; box-shadow: 0 6px 16px rgba(0,0,0,0.4); border: 1px solid rgba(255,255,255,0.2); z-index: 99; pointer-events: none; }\n";
			html += "    .rad-tooltip-container:hover .rad-tooltip-bubble { display: inline-block !important; }\n";
			html += "    .rad-anim-input { transition: width 0.3s ease-in-out; }\n";
			html += "    .rad-anim-input:focus { width: 100% !important; border-color: #38bdf8 !important; box-shadow: 0 0 0 3px rgba(56,189,248,0.25) !important; }\n";
			html += "  </style>\n</head>\n<body>\n\n";

			html += "<main class=\"form-window\">\n";
			html += "  <h1 class=\"form-title\">" + (formSpec.title || "Form").replace(/</g, "&lt;") + "</h1>\n";

			(formSpec.controls || []).forEach(c => {
				if (c.visible === false) return;
				const c_bg = c.background_color || "transparent";
				const c_fg = c.font_color || fg;
				const c_fs = c.font_size || 13;
				const text = (c.text || c.id || "").replace(/</g, "&lt;").replace(/>/g, "&gt;");
				const disStyle = c.enabled === false ? " opacity: 0.55; pointer-events: none;" : "";
				const disAttr = c.enabled === false ? " disabled" : "";
				const posStyle = "left: " + c.x + "px; top: " + (c.y + 40) + "px; width: " + c.width + "px; height: " + c.height + "px; color: " + c_fg + "; font-size: " + c_fs + "px;" + disStyle;

				if (c.control_type === "button") {
					html += "  <div class=\"control-item\" style=\"" + posStyle + "\">\n";
					html += "    <button class=\"btn-ctrl\"" + disAttr + " style=\"width:100%; height:100%; background-color:" + c_bg + "; color:" + c_fg + "; font-size:" + c_fs + "px;\" id=\"" + c.id + "\">" + text + "</button>\n";
					html += "  </div>\n";
				} else if (c.control_type === "label") {
					html += "  <div class=\"control-item\" style=\"" + posStyle + " font-weight: 600;\">\n";
					html += "    <span id=\"" + c.id + "\" style=\"color:" + c_fg + ";\">" + text + "</span>\n";
					html += "  </div>\n";
				} else if (c.control_type === "input") {
					html += "  <div class=\"control-item\" style=\"" + posStyle + "\">\n";
					html += "    <input autocapitalize='none' autocorrect='off' spellcheck='false' autocomplete='off'" + disAttr + " type=\"text\" class=\"input-ctrl\" style=\"background-color:" + (c.background_color && c.background_color !== 'transparent' ? c.background_color : 'rgba(255,255,255,0.05)') + "; color:" + c_fg + ";\" id=\"" + c.id + "\" value=\"" + text + "\" placeholder=\"" + (c.placeholder || "") + "\">\n";
					html += "  </div>\n";
				} else if (c.control_type === "search") {
					html += "  <div class=\"control-item\" style=\"" + posStyle + "\">\n";
					html += "    <input autocapitalize='none' autocorrect='off' spellcheck='false' autocomplete='off'" + disAttr + " type=\"search\" class=\"input-ctrl\" style=\"background-color:" + (c.background_color && c.background_color !== 'transparent' ? c.background_color : 'rgba(255,255,255,0.05)') + "; color:" + c_fg + ";\" id=\"" + c.id + "\" value=\"" + text + "\" placeholder=\"" + (c.placeholder || "Search...") + "\">\n";
					html += "  </div>\n";
				} else if (c.control_type === "password") {
					html += "  <div class=\"control-item\" style=\"" + posStyle + "\">\n";
					html += "    <input autocapitalize='none' autocorrect='off' spellcheck='false' autocomplete='off'" + disAttr + " type=\"password\" class=\"input-ctrl\" style=\"background-color:" + (c.background_color && c.background_color !== 'transparent' ? c.background_color : 'rgba(255,255,255,0.05)') + "; color:" + c_fg + ";\" id=\"" + c.id + "\" value=\"" + text + "\" placeholder=\"" + (c.placeholder || "") + "\">\n";
					html += "  </div>\n";
				} else if (c.control_type === "textarea") {
					html += "  <div class=\"control-item\" style=\"" + posStyle + "\">\n";
					html += "    <textarea autocapitalize='none' autocorrect='off' spellcheck='false' autocomplete='off'" + disAttr + " class=\"input-ctrl\" style=\"background-color:" + (c.background_color && c.background_color !== 'transparent' ? c.background_color : 'rgba(255,255,255,0.05)') + "; color:" + c_fg + "; resize:none;\" id=\"" + c.id + "\" placeholder=\"" + (c.placeholder || "") + "\">" + text + "</textarea>\n";
					html += "  </div>\n";
				} else if (c.control_type === "checkbox") {
					const chk = c.checked ? "checked" : "";
					html += "  <div class=\"control-item\" style=\"" + posStyle + " gap:8px;\">\n";
					html += "    <input autocapitalize='none' autocorrect='off' spellcheck='false' autocomplete='off' type=\"checkbox\" id=\"" + c.id + "\" " + chk + ">\n";
					html += "    <label for=\"" + c.id + "\" style=\"color:" + c_fg + ";\">" + text + "</label>\n";
					html += "  </div>\n";
				} else if (c.control_type === "radio") {
					const chk = c.checked ? "checked" : "";
					html += "  <div class=\"control-item\" style=\"" + posStyle + " gap:8px;\">\n";
					html += "    <input autocapitalize='none' autocorrect='off' spellcheck='false' autocomplete='off' type=\"radio\" name=\"form_radios\" id=\"" + c.id + "\" " + chk + ">\n";
					html += "    <label for=\"" + c.id + "\" style=\"color:" + c_fg + ";\">" + text + "</label>\n";
					html += "  </div>\n";
				} else if (c.control_type === "number" || c.control_type === "form_number") {
					const val = c.value !== undefined ? c.value : 0;
					html += "  <div class=\"control-item\" style=\"" + posStyle + "\">\n";
					html += "    <input autocapitalize='none' autocorrect='off' spellcheck='false' autocomplete='off'" + disAttr + " type=\"number\" class=\"input-ctrl\" style=\"background-color:" + (c.background_color && c.background_color !== 'transparent' ? c.background_color : 'rgba(255,255,255,0.05)') + "; color:" + c_fg + ";\" id=\"" + c.id + "\" value=\"" + val + "\" placeholder=\"" + (c.placeholder || "") + "\">\n";
					html += "  </div>\n";
				} else if (c.control_type === "date" || c.control_type === "date_picker" || c.control_type === "form_date") {
					html += "  <div class=\"control-item\" style=\"" + posStyle + "\">\n";
					html += "    <input autocapitalize='none' autocorrect='off' spellcheck='false' autocomplete='off'" + disAttr + " type=\"date\" class=\"input-ctrl\" style=\"background-color:" + (c.background_color && c.background_color !== 'transparent' ? c.background_color : 'rgba(255,255,255,0.05)') + "; color:" + c_fg + ";\" id=\"" + c.id + "\">\n";
					html += "  </div>\n";
				} else if (c.control_type === "time_picker") {
					const val = c.value || "09:30";
					html += "  <div class=\"control-item\" style=\"" + posStyle + "\">\n";
					html += "    <input autocapitalize='none' autocorrect='off' spellcheck='false' autocomplete='off'" + disAttr + " type=\"time\" class=\"input-ctrl\" style=\"background-color:" + (c.background_color && c.background_color !== 'transparent' ? c.background_color : 'rgba(255,255,255,0.05)') + "; color:" + c_fg + ";\" id=\"" + c.id + "\" value=\"" + val + "\">\n";
					html += "  </div>\n";
				} else if (c.control_type === "color") {
					const val = c.value || "#38bdf8";
					html += "  <div class=\"control-item\" style=\"" + posStyle + "\">\n";
					html += "    <input autocapitalize='none' autocorrect='off' spellcheck='false' autocomplete='off'" + disAttr + " type=\"color\" class=\"input-ctrl\" style=\"padding:2px; cursor:pointer; background-color:" + (c.background_color && c.background_color !== 'transparent' ? c.background_color : 'transparent') + "; color:" + c_fg + ";\" id=\"" + c.id + "\" value=\"" + val + "\">\n";
					html += "  </div>\n";
				} else if (c.control_type === "slider" || c.control_type === "form_slider") {
					const val = c.value !== undefined ? c.value : 50;
					html += "  <div class=\"control-item\" style=\"" + posStyle + "\">\n";
					html += "    <input type=\"range\" id=\"" + c.id + "\" value=\"" + val + "\" min=\"0\" max=\"100\" style=\"width:100%; accent-color:#38bdf8;\">\n";
					html += "  </div>\n";
				} else if (c.control_type === "switch" || c.control_type === "form_switch") {
					const chk = c.checked ? "checked" : "";
					html += "  <div class=\"control-item\" style=\"" + posStyle + " gap:8px;\">\n";
					html += "    <input type=\"checkbox\" role=\"switch\" id=\"" + c.id + "\" " + chk + " style=\"width:36px; height:20px; cursor:pointer;\">\n";
					html += "    <label for=\"" + c.id + "\" style=\"color:" + c_fg + ";\">" + text + "</label>\n";
					html += "  </div>\n";
				} else if (c.control_type === "progress" || c.control_type === "form_progress") {
					const val = c.value !== undefined ? c.value : 60;
					html += "  <div class=\"control-item\" style=\"" + posStyle + "\">\n";
					html += "    <progress id=\"" + c.id + "\" value=\"" + val + "\" max=\"100\" style=\"width:100%; height:100%; accent-color:#38bdf8;\">" + val + "%</progress>\n";
					html += "  </div>\n";
				} else if (c.control_type === "divider") {
					html += "  <div class=\"control-item\" style=\"" + posStyle + "\">\n";
					html += "    <hr id=\"" + c.id + "\" style=\"width:100%; border:none; border-top:1px solid rgba(255,255,255,0.2); margin:0;\">\n";
					html += "  </div>\n";
				} else if (c.control_type === "form_field" || c.control_type === "db_input") {
					html += "  <div class=\"control-item\" style=\"" + posStyle + "\">\n";
					html += "    <div style=\"display:flex; flex-direction:column; width:100%; gap:4px;\"><label style=\"font-size:10px; font-weight:700; opacity:0.8;\">" + text + "</label><input autocapitalize='none' autocorrect='off' spellcheck='false' autocomplete='off'" + disAttr + " type=\"text\" class=\"input-ctrl\" id=\"" + c.id + "\" placeholder=\"" + (c.placeholder || "") + "\"></div>\n";
					html += "  </div>\n";
				} else if (c.control_type === "form_checkbox") {
					const chk = c.checked ? "checked" : "";
					html += "  <div class=\"control-item\" style=\"" + posStyle + "\">\n";
					html += "    <div style=\"display:flex; flex-direction:column; width:100%; gap:4px;\"><label style=\"font-size:10px; font-weight:700; opacity:0.8;\">" + text + "</label><label style=\"display:flex; align-items:center; gap:8px;\"><input type=\"checkbox\" id=\"" + c.id + "\" " + chk + "><span style=\"font-size:12px;\">" + (c.placeholder || "Enable Option") + "</span></label></div>\n";
					html += "  </div>\n";
				} else if (c.control_type === "form_radio") {
					const chk = c.checked ? "checked" : "";
					html += "  <div class=\"control-item\" style=\"" + posStyle + "\">\n";
					html += "    <div style=\"display:flex; flex-direction:column; width:100%; gap:4px;\"><label style=\"font-size:10px; font-weight:700; opacity:0.8;\">" + text + "</label><label style=\"display:flex; align-items:center; gap:8px;\"><input type=\"radio\" id=\"" + c.id + "\" " + chk + "><span style=\"font-size:12px;\">" + (c.placeholder || "Select Option") + "</span></label></div>\n";
					html += "  </div>\n";
				} else if (c.control_type === "form_search") {
					html += "  <div class=\"control-item\" style=\"" + posStyle + "\">\n";
					html += "    <div style=\"display:flex; flex-direction:column; width:100%; gap:4px;\"><label style=\"font-size:10px; font-weight:700; opacity:0.8;\">" + text + "</label><div style=\"display:flex; align-items:center; gap:6px; background:rgba(255,255,255,0.05); border:1px solid rgba(255,255,255,0.1); border-radius:4px; padding:0 8px;\"><span>🔍</span><input autocapitalize='none' autocorrect='off' spellcheck='false' autocomplete='off'" + disAttr + " type=\"search\" class=\"input-ctrl\" id=\"" + c.id + "\" placeholder=\"" + (c.placeholder || "Search...") + "\" style=\"border:none;\"></div></div>\n";
					html += "  </div>\n";
				} else if (c.control_type === "form_color") {
					const val = c.value || "#38bdf8";
					html += "  <div class=\"control-item\" style=\"" + posStyle + "\">\n";
					html += "    <div style=\"display:flex; flex-direction:column; width:100%; gap:4px;\"><label style=\"font-size:10px; font-weight:700; opacity:0.8;\">" + text + "</label><input autocapitalize='none' autocorrect='off' spellcheck='false' autocomplete='off'" + disAttr + " type=\"color\" id=\"" + c.id + "\" value=\"" + val + "\" style=\"width:40px; height:28px; padding:2px; border-radius:4px;\"></div>\n";
					html += "  </div>\n";
				} else if (c.control_type === "form_time") {
					const val = c.value || "09:30";
					html += "  <div class=\"control-item\" style=\"" + posStyle + "\">\n";
					html += "    <div style=\"display:flex; flex-direction:column; width:100%; gap:4px;\"><label style=\"font-size:10px; font-weight:700; opacity:0.8;\">" + text + "</label><input autocapitalize='none' autocorrect='off' spellcheck='false' autocomplete='off'" + disAttr + " type=\"time\" class=\"input-ctrl\" id=\"" + c.id + "\" value=\"" + val + "\"></div>\n";
					html += "  </div>\n";
				} else if (c.control_type === "form_stepper") {
					const val = c.value !== undefined ? c.value : 5;
					html += "  <div class=\"control-item\" style=\"" + posStyle + "\">\n";
					html += "    <div style=\"display:flex; justify-content:space-between; align-items:center; width:100%; gap:8px;\"><label style=\"font-size:10px; font-weight:700; opacity:0.8;\">" + text + "</label><div style=\"display:flex; align-items:center; gap:8px; background:rgba(255,255,255,0.05); border:1px solid rgba(255,255,255,0.1); border-radius:4px; padding:2px 6px;\"><button style=\"width:24px; height:24px; background:rgba(56,189,248,0.2); border:none; border-radius:4px; color:#38bdf8; font-weight:bold; font-size:16px; cursor:pointer;\">−</button><span id=\"" + c.id + "\" style=\"font-weight:bold;\">" + val + "</span><button style=\"width:24px; height:24px; background:rgba(56,189,248,0.2); border:none; border-radius:4px; color:#38bdf8; font-weight:bold; font-size:16px; cursor:pointer;\">+</button></div></div>\n";
					html += "  </div>\n";
				} else if (c.control_type === "form_code") {
					html += "  <div class=\"control-item\" style=\"" + posStyle + "\">\n";
					html += "    <div style=\"display:flex; flex-direction:column; width:100%; height:100%; gap:4px;\"><label style=\"font-size:10px; font-weight:700; opacity:0.8;\">" + text + "</label><textarea id=\"" + c.id + "\" class=\"input-ctrl\" style=\"flex:1; background:#0d1117; color:#7dd3fc; font-family:monospace; resize:none; padding:8px;\">" + (c.value || c.code || "") + "</textarea></div>\n";
					html += "  </div>\n";
				} else if (c.control_type === "form_drop_zone") {
					html += "  <div class=\"control-item\" style=\"" + posStyle + "\">\n";
					html += "    <div style=\"display:flex; flex-direction:column; width:100%; height:100%; gap:4px;\"><label style=\"font-size:10px; font-weight:700; opacity:0.8;\">" + text + "</label><div id=\"" + c.id + "\" style=\"flex:1; border:2px dashed #38bdf8; border-radius:6px; display:flex; flex-direction:column; align-items:center; justify-content:center; gap:4px; opacity:0.85;\"><span>📥</span><span>" + (c.placeholder || "Drop files here") + "</span></div></div>\n";
					html += "  </div>\n";
				} else if (c.control_type === "tabs") {
					const tItems = (text || "General, Security, Advanced").split(',').map(s => s.trim());
					html += "  <div class=\"control-item\" style=\"" + posStyle + "\">\n";
					html += "    <div id=\"" + c.id + "\" style=\"display:flex; border-bottom:2px solid rgba(255,255,255,0.1); gap:4px;\">" + tItems.map((tb, idx) => `<button style="background:none; border:none; color:${idx===0?'#38bdf8':'inherit'}; border-bottom:${idx===0?'2px solid #38bdf8':'none'}; padding:4px 12px; cursor:pointer;">${tb}</button>`).join('') + "</div>\n";
					html += "  </div>\n";
				} else if (c.control_type === "tool_bar") {
					const bItems = (text || "📄 New, 📂 Open, 💾 Save, ⚙️ Settings").split(',').map(s => s.trim());
					html += "  <div class=\"control-item\" style=\"" + posStyle + "\">\n";
					html += "    <div id=\"" + c.id + "\" style=\"display:flex; gap:6px; background:rgba(255,255,255,0.05); padding:4px 8px; border-radius:6px;\">" + bItems.map(it => `<button style="background:rgba(255,255,255,0.08); border:none; border-radius:4px; color:inherit; padding:4px 10px; cursor:pointer; font-weight:600;">${it}</button>`).join('') + "</div>\n";
					html += "  </div>\n";
				} else if (c.control_type === "status_bar") {
					html += "  <div class=\"control-item\" style=\"" + posStyle + "\">\n";
					html += "    <div id=\"" + c.id + "\" style=\"display:flex; justify-content:space-between; align-items:center; width:100%; background:rgba(0,0,0,0.4); border-top:1px solid rgba(255,255,255,0.1); padding:0 12px; font-size:11px;\"><span>🟢 Ready | " + text + "</span><span>100%</span></div>\n";
					html += "  </div>\n";
				} else if (c.control_type === "split_pane") {
					const parts = (text || "Sidebar | Details").split('|');
					html += "  <div class=\"control-item\" style=\"" + posStyle + "\">\n";
					html += "    <div id=\"" + c.id + "\" style=\"display:flex; width:100%; height:100%; border:1px solid rgba(255,255,255,0.1); border-radius:6px; overflow:hidden;\"><div style=\"flex:1; padding:8px;\">" + parts[0].trim() + "</div><div style=\"width:4px; background:#38bdf8;\"></div><div style=\"flex:2; padding:8px;\">" + (parts[1] || 'Content').trim() + "</div></div>\n";
					html += "  </div>\n";
				} else if (c.control_type === "pagination") {
					html += "  <div class=\"control-item\" style=\"" + posStyle + "\">\n";
					html += "    <div id=\"" + c.id + "\" style=\"display:flex; gap:4px; justify-content:center; width:100%;\"><button style=\"padding:2px 8px;\">« Prev</button><button style=\"padding:2px 8px; background:#38bdf8; color:#fff; font-weight:bold;\">1</button><button style=\"padding:2px 8px;\">2</button><button style=\"padding:2px 8px;\">Next »</button></div>\n";
					html += "  </div>\n";
				} else if (c.control_type === "command_palette") {
					html += "  <div class=\"control-item\" style=\"" + posStyle + "\">\n";
					html += "    <div id=\"" + c.id + "\" style=\"display:flex; align-items:center; gap:8px; background:#1e293b; border:1px solid #38bdf8; border-radius:6px; padding:0 12px;\"><span style=\"color:#38bdf8;\">⌘</span><input type=\"text\" placeholder=\"Type command...\" style=\"flex:1; background:none; border:none; color:inherit; outline:none;\"></div>\n";
					html += "  </div>\n";
				} else if (c.control_type === "toggle_button") {
					const chk = c.checked;
					html += "  <div class=\"control-item\" style=\"" + posStyle + "\">\n";
					html += "    <button id=\"" + c.id + "\" style=\"width:100%; height:100%; background:" + (chk ? '#38bdf8' : 'rgba(255,255,255,0.08)') + "; color:" + (chk ? '#ffffff' : 'inherit') + "; border:none; border-radius:6px; font-weight:bold;\">" + (chk ? '🔒 Locked' : (text || '🔓 Unlocked')) + "</button>\n";
					html += "  </div>\n";
				} else if (c.control_type === "form_password") {
					html += "  <div class=\"control-item\" style=\"" + posStyle + "\">\n";
					html += "    <div style=\"display:flex; flex-direction:column; width:100%; gap:4px;\"><label style=\"font-size:10px; font-weight:700; opacity:0.8;\">" + text + "</label><input autocapitalize='none' autocorrect='off' spellcheck='false' autocomplete='off'" + disAttr + " type=\"password\" class=\"input-ctrl\" id=\"" + c.id + "\" placeholder=\"" + (c.placeholder || "") + "\"></div>\n";
					html += "  </div>\n";
				} else if (c.control_type === "form_textarea") {
					html += "  <div class=\"control-item\" style=\"" + posStyle + "\">\n";
					html += "    <div style=\"display:flex; flex-direction:column; width:100%; gap:4px;\"><label style=\"font-size:10px; font-weight:700; opacity:0.8;\">" + text + "</label><textarea autocapitalize='none' autocorrect='off' spellcheck='false' autocomplete='off'" + disAttr + " class=\"input-ctrl\" id=\"" + c.id + "\" placeholder=\"" + (c.placeholder || "") + "\" style=\"resize:none;\"></textarea></div>\n";
					html += "  </div>\n";
				} else if (c.control_type === "form_dropdown" || c.control_type === "db_dropdown") {
					const opts = (c.options || "Option 1, Option 2, Option 3").split(',').map(s => s.trim());
					html += "  <div class=\"control-item\" style=\"" + posStyle + "\">\n";
					html += "    <div style=\"display:flex; flex-direction:column; width:100%; gap:4px;\"><label style=\"font-size:10px; font-weight:700; opacity:0.8;\">" + text + "</label><select id=\"" + c.id + "\" class=\"input-ctrl\" style=\"background-color:" + (c.background_color && c.background_color !== 'transparent' ? c.background_color : 'rgba(255,255,255,0.05)') + "; color:" + c_fg + ";\">" + opts.map(o => `<option value="${o}">${o}</option>`).join('') + "</select></div>\n";
					html += "  </div>\n";
				} else if (c.control_type === "form_link") {
					html += "  <div class=\"control-item\" style=\"" + posStyle + "\">\n";
					html += "    <a id=\"" + c.id + "\" href=\"#\" style=\"color:#38bdf8; text-decoration:none; font-weight:600;\">" + text + " 🔗</a>\n";
					html += "  </div>\n";
				} else if (c.control_type === "table" || c.control_type === "db_grid") {
					const rawHeaders = c.columns || c.headers || ['ID', 'Name', 'Value', 'Status'];
					const headers = Array.isArray(rawHeaders) ? rawHeaders : String(rawHeaders).split(',').map(s => s.trim());
					const rawRows = c.rows || c.data || [['#1', 'Item 1', '100', 'Active'], ['#2', 'Item 2', '200', 'Active']];
					html += "  <div class=\"control-item\" style=\"" + posStyle + " overflow:auto;\">\n";
					html += "    <table id=\"" + c.id + "\" style=\"width:100%; border-collapse:collapse; background:" + (c_bg !== 'transparent' ? c_bg : 'rgba(255,255,255,0.03)') + "; border:1px solid rgba(255,255,255,0.1); border-radius:6px; font-size:12px;\">\n";
					html += "      <thead><tr style=\"background:rgba(255,255,255,0.06);\">" + headers.map(h => `<th style="padding:6px 10px; text-align:left; border-bottom:1px solid rgba(255,255,255,0.1);">${h}</th>`).join('') + "</tr></thead>\n";
					html += "      <tbody>" + rawRows.map(r => { const cells = Array.isArray(r) ? r : Object.values(r); return `<tr style="border-bottom:1px solid rgba(255,255,255,0.05);">${cells.map(cell => `<td style="padding:6px 10px;">${cell}</td>`).join('')}</tr>`; }).join('\n') + "</tbody>\n";
					html += "    </table>\n";
					html += "  </div>\n";
				} else if (c.control_type === "badge") {
					html += "  <div class=\"control-item\" style=\"" + posStyle + "\">\n";
					html += "    <span class=\"badge-ctrl\" style=\"background-color:" + c_bg + "; color:" + c_fg + ";\" id=\"" + c.id + "\">" + text + "</span>\n";
					html += "  </div>\n";
				} else if (c.control_type === "panel") {
					html += "  <div class=\"control-item panel-ctrl\" style=\"" + posStyle + " background-color:" + c_bg + "; color:" + c_fg + ";\" id=\"" + c.id + "\">\n";
					html += "    📦 " + text + "\n";
					html += "  </div>\n";
				} else if (c.control_type === "code_view") {
					html += "  <div class=\"control-item\" style=\"" + posStyle + "\">\n";
					html += "    <textarea autocapitalize='none' autocorrect='off' spellcheck='false' autocomplete='off' class=\"input-ctrl\" style=\"background-color:" + (c.background_color && c.background_color !== 'transparent' ? c.background_color : '#0d1117') + "; color:" + (c.font_color || '#7dd3fc') + "; font-family:'Fira Code','Courier New',monospace; font-size:" + c_fs + "px; border:1px solid rgba(255,255,255,0.15); border-radius:8px; padding:10px; resize:none; outline:none; white-space:pre;\" id=\"" + c.id + "\" placeholder=\"" + (c.placeholder || "") + "\">" + text + "</textarea>\n";
					html += "  </div>\n";
				} else if (c.control_type === "sidebar" || c.control_type === "w3_sidebar") {
					const sbItems = (c.items || ["🏠 Dashboard", "📁 Projects", "👥 Team", "⚙️ Settings", "❓ Help"]);
					const itemsArr = Array.isArray(sbItems) ? sbItems : String(sbItems).split(',').map(s => s.trim());
					html += "  <div class=\"control-item rad-card\" style=\"" + posStyle + " background:" + (c_bg !== 'transparent' ? c_bg : '#1e293b') + "; flex-direction:column; overflow:hidden;\">\n";
					html += "    <div style=\"padding:10px 14px; background:rgba(255,255,255,0.06); border-bottom:1px solid rgba(255,255,255,0.1); display:flex; justify-content:space-between; align-items:center;\"><span style=\"font-weight:700; font-size:12px; color:#38bdf8;\">" + (text || "Navigation") + "</span><button onclick=\"this.closest('.control-item').style.display='none'\" style=\"background:none; border:none; color:inherit; font-size:16px; cursor:pointer;\">&times;</button></div>\n";
					html += "    <div style=\"flex:1; overflow-y:auto; padding:6px 0;\">" + itemsArr.map((it, i) => `<button style="width:100%; padding:8px 14px; text-align:left; background:${i===0?'rgba(56,189,248,0.15)':'transparent'}; color:${i===0?'#38bdf8':'inherit'}; border:none; font-size:11px; font-weight:${i===0?'700':'500'}; cursor:pointer; display:flex; justify-content:space-between;"><span>${it}</span><span style="opacity:0.4;">›</span></button>`).join('') + "</div>\n";
					html += "  </div>\n";
				} else if (c.control_type === "modal" || c.control_type === "modal_dialog" || c.control_type === "w3_modal") {
					html += "  <div class=\"control-item rad-card rad-elevation-2\" style=\"" + posStyle + " background:" + (c_bg !== 'transparent' ? c_bg : '#1e293b') + "; flex-direction:column; overflow:hidden;\">\n";
					html += "    <div style=\"padding:10px 14px; background:rgba(56,189,248,0.15); border-bottom:1px solid rgba(255,255,255,0.1); display:flex; justify-content:space-between; align-items:center;\"><span style=\"font-weight:700; font-size:12px; color:#38bdf8;\">" + (text || "Modal Dialog") + "</span><button onclick=\"this.closest('.control-item').style.display='none'\" style=\"background:none; border:none; color:inherit; font-size:16px; cursor:pointer;\">&times;</button></div>\n";
					html += "    <div style=\"padding:12px 14px; flex:1; font-size:11px; opacity:0.85;\">" + (c.message || c.placeholder || "Modal dialog container content.") + "</div>\n";
					html += "    <div style=\"padding:8px 14px; background:rgba(0,0,0,0.2); border-top:1px solid rgba(255,255,255,0.1); display:flex; justify-content:flex-end; gap:6px;\"><button onclick=\"this.closest('.control-item').style.display='none'\" style=\"padding:4px 10px; background:rgba(255,255,255,0.08); color:inherit; border:none; border-radius:4px; font-size:10px; cursor:pointer;\">Cancel</button><button onclick=\"this.closest('.control-item').style.display='none'\" style=\"padding:4px 12px; background:#38bdf8; color:#fff; border:none; border-radius:4px; font-size:10px; font-weight:700; cursor:pointer;\">Confirm</button></div>\n";
					html += "  </div>\n";
				} else if (c.control_type === "dropdown_menu" || c.control_type === "w3_dropdown") {
					const dItems = (c.items || ["Action One", "Action Two", "Settings"]);
					const dArr = Array.isArray(dItems) ? dItems : String(dItems).split(',').map(s => s.trim());
					html += "  <div class=\"control-item rad-dropdown-host\" style=\"" + posStyle + "\">\n";
					html += "    <button onclick=\"event.stopPropagation(); const m=this.nextElementSibling; m.style.display=m.style.display==='block'?'none':'block';\" style=\"width:100%; height:100%; background:#38bdf8; color:#fff; border:none; border-radius:6px; padding:0 12px; display:flex; align-items:center; justify-content:space-between; font-weight:600; cursor:pointer;\"><span>" + (text || "Select Action") + "</span><span style=\"font-size:10px;\">▼</span></button>\n";
					html += "    <div class=\"rad-dropdown-menu\">" + dArr.map(it => `<button onclick="event.stopPropagation(); this.closest('.rad-dropdown-menu').style.display='none'; this.closest('.control-item').querySelector('button span').textContent='${it}';" style="width:100%; padding:8px 12px; text-align:left; background:transparent; color:inherit; border:none; font-size:11px; cursor:pointer; display:block;">${it}</button>`).join('') + "</div>\n";
					html += "  </div>\n";
				} else if (c.control_type === "list_group" || c.control_type === "w3_list") {
					const lItems = c.items || [{title:"Project Specs", sub:"v1.4", tag:"Active"}, {title:"Customer Database", sub:"12k rows", tag:"Online"}];
					const lArr = Array.isArray(lItems) ? lItems : [{title: text || "Item 1", tag: "OK"}];
					html += "  <div class=\"control-item rad-card\" style=\"" + posStyle + " background:" + (c_bg !== 'transparent' ? c_bg : '#1e293b') + "; flex-direction:column; overflow-y:auto;\">\n";
					html += "    <div style=\"display:flex; flex-direction:column;\">" + lArr.map(it => `<div style="padding:10px 12px; border-bottom:1px solid rgba(255,255,255,0.06); display:flex; justify-content:space-between; align-items:center; font-size:11px;"><div><div style="font-weight:600;">${it.title||it.text||it}</div>${it.sub?`<div style="font-size:9px; opacity:0.65;">${it.sub}</div>`:''}</div>${it.tag?`<span style="background:rgba(56,189,248,0.18); color:#38bdf8; padding:2px 8px; border-radius:9999px; font-size:9px; font-weight:700;">${it.tag}</span>`:''}</div>`).join('') + "</div>\n";
					html += "  </div>\n";
				} else if (c.control_type === "content_card" || c.control_type === "card" || c.control_type === "w3_card") {
					html += "  <div class=\"control-item rad-card rad-elevation-2\" style=\"" + posStyle + " background:" + (c_bg !== 'transparent' ? c_bg : '#1e293b') + "; flex-direction:column; overflow:hidden;\">\n";
					html += "    <div style=\"padding:10px 14px; background:rgba(56,189,248,0.15); font-weight:700; color:#38bdf8; font-size:12px; border-bottom:1px solid rgba(255,255,255,0.1);\">" + (text || "Content Card") + "</div>\n";
					html += "    <div style=\"height:60px; background:rgba(0,0,0,0.2); display:flex; align-items:center; justify-content:center; font-size:12px; opacity:0.8;\">🖼️ Media slot</div>\n";
					html += "    <div style=\"padding:10px 14px; flex:1; font-size:11px; opacity:0.85;\">" + (c.description || "Card content description.") + "</div>\n";
					html += "    <div style=\"padding:6px 14px; border-top:1px solid rgba(255,255,255,0.1); display:flex; justify-content:flex-end;\"><button style=\"padding:4px 12px; background:#38bdf8; color:#fff; border:none; border-radius:4px; font-size:10px; font-weight:700; cursor:pointer;\">Explore</button></div>\n";
					html += "  </div>\n";
				} else if (c.control_type === "callout_panel" || c.control_type === "note_panel" || c.control_type === "w3_panel") {
					html += "  <div class=\"control-item\" style=\"" + posStyle + " background:rgba(56,189,248,0.12); border-left:5px solid #38bdf8; border-radius:0 8px 8px 0; padding:10px 14px; flex-direction:column; align-items:flex-start; justify-content:center;\">\n";
					html += "    <div style=\"font-weight:700; font-size:12px; color:#38bdf8;\">" + (c.title || "Important Note") + "</div>\n";
					html += "    <div style=\"font-size:11px; opacity:0.85; margin-top:2px;\">" + (text || "Highlighted callout message.") + "</div>\n";
					html += "  </div>\n";
				} else if (c.control_type === "tooltip_box" || c.control_type === "w3_tooltip") {
					html += "  <div class=\"control-item rad-tooltip-container\" style=\"" + posStyle + " justify-content:center;\">\n";
					html += "    <button style=\"padding:6px 14px; background:rgba(255,255,255,0.08); border:1px solid rgba(255,255,255,0.15); border-radius:6px; color:inherit; font-size:11px; font-weight:600; cursor:pointer;\">" + (text || "Hover Me ℹ️") + "</button>\n";
					html += "    <span class=\"rad-tooltip-bubble\">" + (c.tooltip || "Tooltip details popup") + "</span>\n";
					html += "  </div>\n";
				} else if (c.control_type === "animated_input" || c.control_type === "w3_animated_input") {
					html += "  <div class=\"control-item\" style=\"" + posStyle + " justify-content:flex-start;\">\n";
					html += "    <input type=\"text\" class=\"input-ctrl rad-anim-input\" placeholder=\"" + (c.placeholder || "Click to expand...") + "\" value=\"" + (text || "") + "\" style=\"width:140px; height:100%;\">\n";
					html += "  </div>\n";
				} else if (c.control_type === "hero_display" || c.control_type === "display_container" || c.control_type === "w3_display") {
					html += "  <div class=\"control-item rad-card\" style=\"" + posStyle + " background:linear-gradient(135deg, rgba(56,189,248,0.2), #0f172a); overflow:hidden;\">\n";
					html += "    <div style=\"position:absolute; top:8px; left:10px; background:rgba(0,0,0,0.6); color:#fff; font-size:9px; padding:2px 6px; border-radius:4px; font-weight:700;\">★ Featured</div>\n";
					html += "    <div style=\"position:absolute; top:8px; right:10px; background:#38bdf8; color:#fff; font-size:9px; padding:2px 6px; border-radius:4px; font-weight:700;\">NEW</div>\n";
					html += "    <div style=\"display:flex; flex-direction:column; align-items:center; justify-content:center; width:100%; height:100%;\"><div style=\"font-size:15px; font-weight:800; color:#38bdf8;\">" + (text || "Hero Display") + "</div><div style=\"font-size:10px; opacity:0.7;\">Position Pinned Overlays</div></div>\n";
					html += "  </div>\n";
				} else if (c.control_type === "code_snippet" || c.control_type === "code_block" || c.control_type === "w3_code") {
					html += "  <div class=\"control-item rad-card\" style=\"" + posStyle + " background:#0d1117; border-left:4px solid #10b981; padding:10px 14px; position:relative; overflow:auto;\">\n";
					html += "    <button onclick=\"navigator.clipboard.writeText(this.nextElementSibling.textContent); this.textContent='✓ Copied'; setTimeout(()=>this.textContent='📋 Copy',1500);\" style=\"position:absolute; top:6px; right:8px; background:rgba(255,255,255,0.1); border:none; color:inherit; border-radius:3px; padding:2px 6px; font-size:9px; cursor:pointer;\">📋 Copy</button>\n";
					html += "    <pre style=\"margin:0; font-family:monospace; font-size:11px; color:#a7f3d0;\">" + (c.code || text || "const app = new StudioApp();") + "</pre>\n";
					html += "  </div>\n";
				} else if (c.control_type === "count_badge" || c.control_type === "circular_badge" || c.control_type === "w3_badge") {
					html += "  <div class=\"control-item\" style=\"" + posStyle + " justify-content:center;\">\n";
					html += "    <span style=\"width:28px; height:28px; border-radius:50%; background:" + (c_bg !== 'transparent' ? c_bg : '#ef4444') + "; color:#fff; display:flex; align-items:center; justify-content:center; font-weight:800; font-size:11px; box-shadow:0 2px 6px rgba(0,0,0,0.3);\">" + (text || "1") + "</span>\n";
					html += "  </div>\n";
				} else if (c.control_type === "button_group" || c.control_type === "button_bar" || c.control_type === "w3_button_group") {
					const bList = c.buttons || (text ? text.split(',') : ["Left", "Center", "Right"]);
					const bArr = Array.isArray(bList) ? bList : String(bList).split(',').map(s => s.trim());
					html += "  <div class=\"control-item\" style=\"" + posStyle + "\">\n";
					html += "    <div style=\"display:flex; width:100%; height:100%; border:1px solid rgba(255,255,255,0.15); border-radius:6px; overflow:hidden;\">" + bArr.map((b, idx) => `<button style="flex:1; background:${idx===0?'#38bdf8':'rgba(255,255,255,0.06)'}; color:${idx===0?'#fff':'inherit'}; border:none; border-right:${idx===bArr.length-1?'none':'1px solid rgba(255,255,255,0.15)'}; font-size:10px; font-weight:700; cursor:pointer;">${b}</button>`).join('') + "</div>\n";
					html += "  </div>\n";
				} else if (c.control_type === "slideshow" || c.control_type === "carousel" || c.control_type === "w3_slideshow") {
					html += "  <div class=\"control-item rad-card rad-elevation-2\" style=\"" + posStyle + " background:" + (c_bg !== 'transparent' ? c_bg : '#1e293b') + "; flex-direction:column; overflow:hidden;\">\n";
					html += "    <div style=\"flex:1; display:flex; align-items:center; justify-content:space-between; padding:0 12px;\"><span style=\"font-size:14px; cursor:pointer; opacity:0.7;\">❮</span><div style=\"text-align:center;\"><div style=\"font-size:13px; font-weight:700; color:#38bdf8;\">" + (text || "Slide 1") + "</div><div style=\"font-size:9px; opacity:0.65;\">Carousel Container</div></div><span style=\"font-size:14px; cursor:pointer; opacity:0.7;\">❯</span></div>\n";
					html += "    <div style=\"padding:4px 10px; background:rgba(0,0,0,0.2); border-top:1px solid rgba(255,255,255,0.08); display:flex; justify-content:space-between; font-size:9px; opacity:0.8;\"><span>1 / 3</span><span>● ○ ○</span></div>\n";
					html += "  </div>\n";
				} else {
					html += "  <div class=\"control-item\" style=\"" + posStyle + "\">\n";
					html += "    <div id=\"" + c.id + "\" style=\"width:100%; height:100%; background-color:" + c_bg + "; color:" + c_fg + "; padding:6px; border-radius:6px;\">" + text + "</div>\n";
					html += "  </div>\n";
				}
			});

			html += "</main>\n\n<script>\n";
			html += "  window.addEventListener('click', function(e) {\n";
			html += "    if (!e.target.closest('.rad-dropdown-host') && !e.target.closest('.w3-dropdown-click')) {\n";
			html += "      document.querySelectorAll('.rad-dropdown-menu, .w3-dropdown-content').forEach(el => el.style.display = 'none');\n";
			html += "    }\n";
			html += "  });\n";
			html += "<\/script>\n</body>\n</html>";
			return html;
		}

		
		function flashCopyButton(btn) {
			if (!btn || !(btn instanceof HTMLElement)) return;
			if (btn._copyTimeout) clearTimeout(btn._copyTimeout);
			if (!btn._origContent) btn._origContent = btn.innerHTML;
			btn.classList.add("btn-copy-success");
			btn.innerHTML = "✓ Copied!";
			btn._copyTimeout = setTimeout(() => {
				btn.innerHTML = btn._origContent;
				btn.classList.remove("btn-copy-success");
				delete btn._origContent;
				delete btn._copyTimeout;
			}, 2000);
		}

		function copyTextToClipboard(text, successMsg, btn) {
			if (btn) flashCopyButton(btn);
			if (navigator.clipboard && navigator.clipboard.writeText) {
				navigator.clipboard.writeText(text).then(() => {
					showCopyToast(successMsg);
				}).catch(() => {
					fallbackCopy(text, successMsg);
				});
			} else {
				fallbackCopy(text, successMsg);
			}
		}

		function fallbackCopy(text, successMsg) {
			const ta = document.createElement("textarea");
			ta.value = text;
			ta.style.position = "fixed";
			ta.style.left = "-9999px";
			document.body.appendChild(ta);
			ta.select();
			try {
				document.execCommand("copy");
				showCopyToast(successMsg);
			} catch(err) {
				alert("Copy failed: " + err);
			}
			document.body.removeChild(ta);
		}

		function showCopyToast(msg) {
			const statusMsg = document.getElementById("statusMsg");
			if (statusMsg) statusMsg.textContent = "📋 " + msg;
			const toast = document.getElementById("copyNotificationToast");
			const toastText = document.getElementById("copyNotificationToastText");
			if (toast && toastText) {
				toastText.textContent = msg;
				toast.classList.add("visible");
				if (toast._toastTimeout) clearTimeout(toast._toastTimeout);
				toast._toastTimeout = setTimeout(() => {
					toast.classList.remove("visible");
				}, 2500);
			}
		}

		function generateBunTSCode() {
			const title = formSpec.title || "Bun RAD Form";
			const w = formSpec.width || 840;
			const h = formSpec.height || 560;

			let code = `import { SizeHint, Webview } from "webview-bun";
import { readFileSync } from "fs";
import { join } from "path";

// Initialize Webview Window
const wv = new Webview();
wv.title = "${title}";
wv.size = { width: ${w}, height: ${h}, hint: SizeHint.NONE };

// Load HTML UI Spec
const html = readFileSync(join(import.meta.dir, "index.html"), "utf-8");
wv.setHTML(html);

// ==========================================
// 🛠️ RAD BACKEND HELPER UTILITIES
// ==========================================

/** Safely execute JavaScript code in the frontend Webview window */
export function execJS(code: string) {
    try {
        wv.eval(code);
    } catch (e) {
        console.error("❌ JS Exec Error:", e);
    }
}

/** Dynamic UI control property updaters */
export function setControlText(controlId: string, text: string) {
    const escaped = JSON.stringify(text);
    execJS(\`const el=document.getElementById("\${controlId}");if(el){if("value" in el)el.value=\${escaped};else el.textContent=\${escaped};}\`);
}

export function setControlPlaceholder(controlId: string, placeholder: string) {
    const escaped = JSON.stringify(placeholder);
    execJS(\`const el=document.getElementById("\${controlId}");if(el){if("placeholder" in el)el.placeholder=\${escaped};else{const inp=el.querySelector("input, textarea");if(inp)inp.placeholder=\${escaped};}}\`);
}

export function setControlReadOnly(controlId: string, readOnly: boolean) {
    execJS(\`const el=document.getElementById("\${controlId}");if(el){if("readOnly" in el)el.readOnly=\${readOnly};else{const inp=el.querySelector("input, textarea");if(inp)inp.readOnly=\${readOnly};}}\`);
}

export function setControlRequired(controlId: string, required: boolean) {
    execJS(\`const el=document.getElementById("\${controlId}");if(el){if("required" in el)el.required=\${required};else{const inp=el.querySelector("input, textarea, select");if(inp)inp.required=\${required};}}\`);
}

export function setControlMaxLength(controlId: string, maxLength: number) {
    execJS(\`const el=document.getElementById("\${controlId}");if(el){if("maxLength" in el)el.maxLength=\${maxLength};else{const inp=el.querySelector("input, textarea");if(inp)inp.maxLength=\${maxLength};}}\`);
}

export function setControlEnabled(controlId: string, enabled: boolean) {
    execJS(\`const el=document.getElementById("\${controlId}");if(el){el.disabled=\${!enabled};el.style.opacity=\${enabled ? "1" : "0.55"};el.style.pointerEvents=\${enabled ? "auto" : "none"};}\`);
}

export function setControlVisible(controlId: string, visible: boolean) {
    execJS(\`const el=document.getElementById("\${controlId}");if(el){el.style.display=\${visible ? "" : "none"};}\`);
}

// ==========================================
// 🪟 WINDOW EVENT LIFECYCLE HOOKS
// ==========================================

/** Triggered when UI finish loading on window creation */
wv.bind("onFormLoad", () => {
    console.log("⚡ Window Lifecycle [onFormLoad]: Form initialized.");
});

/** Triggered when the UI window is resized */
wv.bind("onFormResize", (size?: { width: number, height: number }) => {
    console.log("⚡ Window Lifecycle [onFormResize]: Dimensions changed:", size || "");
});

/** Triggered when the UI window is closing */
wv.bind("onFormClose", () => {
    console.log("⚡ Window Lifecycle [onFormClose]: Window closing...");
});

// Global Backend Logging Bridge
wv.bind("backendAlert", (msg: string) => {
    console.log("⚡ Backend Alert:", msg);
});
`;

			let boundMethods = [];
			let customHandlers = [];

			(formSpec.controls || []).forEach(c => {
				if (!c.event_handlers) return;
				for (let evtName in c.event_handlers) {
					let handler = c.event_handlers[evtName];
					if (handler && typeof handler === "string" && handler.trim()) {
						const clean = handler.trim();
						const isFuncName = /^[a-zA-Z_$][a-zA-Z0-9_$]*$/.test(clean);
						if (isFuncName && !boundMethods.includes(clean)) {
							boundMethods.push(clean);
							customHandlers.push({ name: clean, ctrlId: c.id, type: c.control_type || "control", evt: evtName });
						}
					}
				}
			});

			if (customHandlers.length > 0) {
				code += '\n// ==========================================\n';
				code += '// 🔌 RAD COMPONENT EVENT HANDLERS (' + customHandlers.length + ' active binding(s))\n';
				code += '// ==========================================\n';
				customHandlers.forEach(h => {
					code += 'wv.bind("' + h.name + '", (data?: any) => {\n';
					code += '    console.log("⚡ RAD Event [' + h.evt + '] on #' + h.ctrlId + ' (' + h.type + '):", data || "");\n';
					if (h.evt === "onChange" || h.evt === "onInput") {
						code += '    // Process input data from control\n';
						code += '    return { success: true, value: data };\n';
					} else {
						code += '    // TODO: Add custom Bun backend logic for ' + h.name + '\n';
						code += '    return { success: true, timestamp: Date.now() };\n';
					}
					code += '});\n\n';
				});
			} else {
				code += '\n// Note: Add component event handlers in the Events tab to auto-generate TS methods here.\n\n';
			}

			code += 'console.log("🚀 Starting Bun RAD Studio App: ' + title + '...");\nwv.run();\n';
			return code;
		}

		function copyBunTSCode(btn) {
			const code = generateBunTSCode();
			const targetBtn = btn || (typeof event !== 'undefined' && event && event.currentTarget);
			copyTextToClipboard(code, "Copied Bun GUI TypeScript runner code to clipboard!", targetBtn);
			switchTab("tabBunTS");
		}

		function copyHTMLCode(btn) {
			const htmlStr = generateHTMLCode();
			const targetBtn = btn || (typeof event !== 'undefined' && event && event.currentTarget);
			copyTextToClipboard(htmlStr, "Copied standalone HTML5 code to clipboard!", targetBtn);
			switchTab("tabHTML");
		}

		function clearForm() {
			saveHistoryState();
			formSpec = {
				title: "New RAD Form",
				width: 840,
				height: 560,
				background_color: "#0f172a",
				font_color: "#f8fafc",
				padding: 20,
				spacing: 12,
				controls: []
			};
			selectedIndices = [];
			const formTitleEl = document.getElementById("propFormTitle");
			if (formTitleEl) formTitleEl.value = formSpec.title;
			renderCanvas();
			renderCode();
			renderTree();
			populateInspector();
			syncSpecToV();
			document.getElementById("statusMsg").textContent = "Created a new blank form layout.";
		}

		function copyVCode(btn) {
			const text = document.getElementById("codePreviewText").value;
			const targetBtn = btn || (typeof event !== 'undefined' && event && event.currentTarget);
			copyTextToClipboard(text, "Copied V source code to clipboard!", targetBtn);
		}

		function exportApp() {
			const statusMsg = document.getElementById("statusMsg");
			if (statusMsg) statusMsg.textContent = "Exporting App Project...";

			const handleResult = (res) => {
				let data = res;
				if (typeof data === "string") {
					try { data = JSON.parse(data); } catch(e){}
				}
				if (data && data.success) {
					const targetDir = data.dir || "exported_project";
					const kept = Array.isArray(data.backups) ? data.backups.length : 0;
					const note = kept ? " (" + kept + " existing file(s) that differed were kept as .bak-<time> copies)" : "";
					if (statusMsg) statusMsg.textContent = "Project exported to: " + targetDir + note;
					showCopyToast("Project successfully exported to " + targetDir + note);
					switchTab("tabBunTS");
				} else {
					const err = (data && data.error) ? data.error : "Unknown export error";
					if (statusMsg) statusMsg.textContent = "Export failed: " + err;
					showCopyToast("Export failed: " + err);
				}
			};

			if (window.exportProject) {
				try {
					const res = window.exportProject(JSON.stringify(formSpec));
					if (res && typeof res.then === "function") {
						res.then(handleResult).catch((err) => {
							if (statusMsg) statusMsg.textContent = "Export failed: " + err.message;
							showCopyToast("Export failed: " + err.message);
						});
					} else {
						handleResult(res);
					}
				} catch (err) {
					if (statusMsg) statusMsg.textContent = "Export error: " + err.message;
					showCopyToast("Export error: " + err.message);
				}
			} else {
				// Browser / Standalone HTTP Fallback Export
				downloadProjectFiles();
			}
		}

		function downloadProjectFiles() {
			const statusMsg = document.getElementById("statusMsg");
			try {
				const jsonStr = JSON.stringify(formSpec, null, 2);
				const blob = new Blob([jsonStr], { type: "application/json" });
				const url = URL.createObjectURL(blob);
				const a = document.createElement("a");
				a.href = url;
				a.download = (formSpec.title ? formSpec.title.toLowerCase().replace(/[^a-z0-9]/g, "_") : "rad_project") + "_spec.json";
				document.body.appendChild(a);
				a.click();
				document.body.removeChild(a);
				URL.revokeObjectURL(url);

				if (statusMsg) statusMsg.textContent = "Project layout JSON downloaded! Switched to Bun TS code tab.";
				showCopyToast("Layout JSON downloaded! Switched to Bun TS code view.");
				switchTab("tabBunTS");
			} catch (err) {
				if (statusMsg) statusMsg.textContent = "Download failed: " + err.message;
				showCopyToast("Download failed: " + err.message);
			}
		}
