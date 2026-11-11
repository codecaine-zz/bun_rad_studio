
		function showImportModal() {
			showDialog("importModal");
		}
		function hideImportModal() {
			hideDialog("importModal");
		}

		function showHotkeysModal() {
			showDialog("hotkeysModal");
		}
		function hideHotkeysModal() {
			hideDialog("hotkeysModal");
		}

		// Checks an imported layout and fills in missing values. Returns { spec } or { error } without touching the open form.
		function normalizeImportedSpec(parsed) {
			if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
				return { error: "The text must be one JSON object that describes a form, not a list or a single value." };
			}
			if (parsed.controls === undefined && parsed.title === undefined) {
				return { error: 'This JSON does not look like a form layout: it has neither "title" nor "controls".' };
			}
			const rawControls = parsed.controls === undefined ? [] : parsed.controls;
			if (!Array.isArray(rawControls)) {
				return { error: '"controls" must be a list of controls.' };
			}
			const isNum = (v) => typeof v === "number" && isFinite(v);
			const UNSAFE_KEYS = new Set(["__proto__", "constructor", "prototype"]);
			const ALLOWED_CTRL_KEYS = new Set([
				"id", "control_type", "x", "y", "width", "height", "text", "value", "checked",
				"font_size", "font_color", "background_color", "hover_color", "hover_text_color",
				"border_radius", "border_width", "border_color", "border_style", "box_shadow",
				"text_align", "opacity", "cursor", "enabled", "visible", "locked", "tooltip",
				"placeholder", "options", "items", "columns", "headers", "rows", "data",
				"data_source", "data_field", "alert_type", "tab_order", "anchors", "dock",
				"event_handlers", "context_menu_items", "shortcut", "icon", "interval",
				"title", "description", "message", "code", "buttons", "slides", "min", "max", "step"
			]);
			const isSafeCtrlKey = (k) => !UNSAFE_KEYS.has(k) && (ALLOWED_CTRL_KEYS.has(k) || /^on[A-Za-z]+$/.test(k));
			const sanitizePlainObj = (src) => {
				if (!src || typeof src !== "object" || Array.isArray(src)) return {};
				const out = {};
				Object.keys(src).forEach((k) => {
					if (!UNSAFE_KEYS.has(k)) out[k] = src[k];
				});
				return out;
			};
			const seen = new Set();
			const controls = [];
			for (let i = 0; i < rawControls.length; i++) {
				const c = rawControls[i];
				if (!c || typeof c !== "object" || Array.isArray(c) || typeof c.control_type !== "string" || !c.control_type) {
					return { error: "Control #" + (i + 1) + ' is missing a "control_type".' };
				}
				let id = typeof c.id === "string" && c.id ? c.id : c.control_type + "_" + (i + 1);
				while (seen.has(id)) id += "_" + (i + 1);
				seen.add(id);
				const cleanCtrl = {};
				Object.keys(c).forEach((k) => {
					if (!isSafeCtrlKey(k)) return;
					if (k === "event_handlers" || k === "anchors") {
						cleanCtrl[k] = sanitizePlainObj(c[k]);
					} else {
						cleanCtrl[k] = c[k];
					}
				});
				cleanCtrl.id = id;
				cleanCtrl.control_type = c.control_type;
				cleanCtrl.x = isNum(c.x) ? c.x : 0;
				cleanCtrl.y = isNum(c.y) ? c.y : 0;
				cleanCtrl.width = isNum(c.width) ? c.width : 150;
				cleanCtrl.height = isNum(c.height) ? c.height : 36;
				cleanCtrl.text = c.text === undefined || c.text === null ? "" : String(c.text);
				controls.push(cleanCtrl);
			}
			const spec = {
				title: typeof parsed.title === "string" && parsed.title ? parsed.title : "Imported Form",
				width: isNum(parsed.width) ? parsed.width : 840,
				height: isNum(parsed.height) ? parsed.height : 560,
				background_color: typeof parsed.background_color === "string" ? parsed.background_color : "#0f172a",
				font_color: typeof parsed.font_color === "string" ? parsed.font_color : "#f8fafc",
				padding: isNum(parsed.padding) ? parsed.padding : 20,
				spacing: isNum(parsed.spacing) ? parsed.spacing : 12,
				controls: controls
			};
			const OPTIONAL_SPEC_KEYS = [
				"theme", "fx_mode", "fullscreen", "always_on_top", "effects",
				"menu_bar", "menus", "global_context_menu_items", "responsive"
			];
			OPTIONAL_SPEC_KEYS.forEach((k) => {
				if (parsed[k] !== undefined) {
					spec[k] = (typeof parsed[k] === "object" && parsed[k] !== null && !Array.isArray(parsed[k]))
						? sanitizePlainObj(parsed[k])
						: parsed[k];
				}
			});
			if (Array.isArray(parsed.non_visual_controls)) {
				const nvcList = [];
				for (let j = 0; j < parsed.non_visual_controls.length; j++) {
					const nv = parsed.non_visual_controls[j];
					if (!nv || typeof nv !== "object" || Array.isArray(nv)) continue;
					const nvType = typeof nv.control_type === "string" && nv.control_type ? nv.control_type : "timer";
					let nvId = typeof nv.id === "string" && nv.id ? nv.id : nvType + "_" + (j + 1);
					while (seen.has(nvId)) nvId += "_" + (j + 1);
					seen.add(nvId);
					const cleanNv = {};
					Object.keys(nv).forEach((k) => {
						if (!isSafeCtrlKey(k)) return;
						cleanNv[k] = k === "event_handlers" ? sanitizePlainObj(nv[k]) : nv[k];
					});
					cleanNv.id = nvId;
					cleanNv.control_type = nvType;
					if (nv.interval !== undefined) {
						cleanNv.interval = Math.max(10, Number(nv.interval) || 1000);
					}
					nvcList.push(cleanNv);
				}
				spec.non_visual_controls = nvcList;
			}
			return { spec: spec };
		}

		// Counts event handlers that are script rather than a plain function name. Those run as code in the
		// Run preview and in exported projects, so importing a layout that has them deserves a warning.
		function countImportedScripts(spec) {
			const isFunctionName = (v) => /^[a-zA-Z_$][a-zA-Z0-9_$]*$/.test(v);
			const looksLikeHandlerKey = (k) => /^on[A-Za-z]+$/.test(k);
			let count = 0;
			const inspectList = [].concat(
				Array.isArray(spec && spec.controls) ? spec.controls : [],
				Array.isArray(spec && spec.non_visual_controls) ? spec.non_visual_controls : []
			);
			inspectList.forEach((c) => {
				if (!c || typeof c !== "object") return;
				const handlers = Object.assign({}, c.event_handlers || {});
				Object.keys(c).forEach((k) => { if (looksLikeHandlerKey(k) && typeof c[k] === "string") handlers[k] = c[k]; });
				Object.keys(handlers).forEach((k) => {
					const v = handlers[k];
					if (typeof v === "string" && v.trim() && !isFunctionName(v.trim())) count++;
				});
			});
			return count;
		}

		function processImportJSON() {
			const text = document.getElementById("importJsonText").value;
			let parsed;
			try {
				parsed = JSON.parse(text);
			} catch (err) {
				alert("That text is not valid JSON: " + err.message + "\nYour current form was not changed.");
				return;
			}
			const result = normalizeImportedSpec(parsed);
			if (result.error) {
				alert(result.error + "\nYour current form was not changed.");
				return;
			}
			const scripts = countImportedScripts(result.spec);
			if (scripts > 0 && !confirm("This layout contains " + scripts + " event handler script(s). They run as code when you use Run and in exported projects. Import it only if you trust where it came from.\n\nImport anyway?")) {
				return;
			}
			saveHistoryState();
			formSpec = result.spec;
			selectedIndices = [];
			renderCanvas();
			renderCode();
			renderTree();
			populateInspector();
			hideImportModal();
			document.getElementById("statusMsg").textContent = "Imported \"" + formSpec.title + "\" with " + formSpec.controls.length + " control(s). Undo (Cmd/Ctrl+Z) restores the previous form.";
		}
