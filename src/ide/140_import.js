
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
			const seen = {};
			const controls = [];
			for (let i = 0; i < rawControls.length; i++) {
				const c = rawControls[i];
				if (!c || typeof c !== "object" || Array.isArray(c) || typeof c.control_type !== "string" || !c.control_type) {
					return { error: "Control #" + (i + 1) + ' is missing a "control_type".' };
				}
				let id = typeof c.id === "string" && c.id ? c.id : c.control_type + "_" + (i + 1);
				while (seen[id]) id += "_" + (i + 1);
				seen[id] = true;
				controls.push(Object.assign({}, c, {
					id: id,
					x: isNum(c.x) ? c.x : 0,
					y: isNum(c.y) ? c.y : 0,
					width: isNum(c.width) ? c.width : 150,
					height: isNum(c.height) ? c.height : 36,
					text: c.text === undefined || c.text === null ? "" : String(c.text)
				}));
			}
			const spec = Object.assign({
				title: "Imported Form",
				background_color: "#0f172a",
				font_color: "#f8fafc",
				padding: 20,
				spacing: 12
			}, parsed, {
				title: typeof parsed.title === "string" && parsed.title ? parsed.title : "Imported Form",
				width: isNum(parsed.width) ? parsed.width : 840,
				height: isNum(parsed.height) ? parsed.height : 560,
				controls: controls
			});
			return { spec: spec };
		}

		// Counts event handlers that are script rather than a plain function name. Those run as code in the
		// Run preview and in exported projects, so importing a layout that has them deserves a warning.
		function countImportedScripts(spec) {
			const isFunctionName = (v) => /^[a-zA-Z_$][a-zA-Z0-9_$]*$/.test(v);
			const looksLikeHandlerKey = (k) => /^on[A-Za-z]+$/.test(k);
			let count = 0;
			(spec.controls || []).forEach((c) => {
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
