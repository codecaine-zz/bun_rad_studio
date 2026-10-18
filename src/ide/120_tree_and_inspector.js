
		function renderTree() {
			const container = document.getElementById("treeContainer");
			if (!container) return;
			container.innerHTML = "";
			const filterEl = document.getElementById("treeFilterBox");
			const query = filterEl ? filterEl.value.toLowerCase().trim() : "";

			formSpec.controls.forEach((ctrl, idx) => {
				if (query && !ctrl.id.toLowerCase().includes(query) && !ctrl.control_type.toLowerCase().includes(query)) return;

				const item = document.createElement("div");
				item.className = "tree-item" + (selectedIndices.includes(idx) ? " selected" : "");
				item.onclick = (e) => selectControl(idx, e);
				// Tree rows are built after start-up, so they are made keyboard operable here.
				item.tabIndex = 0;
				item.setAttribute("role", "button");
				item.setAttribute("aria-pressed", selectedIndices.includes(idx) ? "true" : "false");
				item.setAttribute("aria-label", "Select " + ctrl.id + " (" + ctrl.control_type + ")");
				item.dataset.ctrlIndex = String(idx);
				item.addEventListener("keydown", (e) => {
					if (e.target !== item || (e.key !== "Enter" && e.key !== " ")) return;
					e.preventDefault();
					selectControl(idx, e);
					// Selecting rebuilds the tree, so put the keyboard focus back on the same row.
					const again = document.querySelector('#treeContainer [data-ctrl-index="' + idx + '"]');
					if (again) again.focus();
				});

				const label = document.createElement("span");
				label.textContent = (ctrl.locked ? "🔒 " : "") + ctrl.id + " (" + ctrl.control_type + ")";
				item.appendChild(label);

				const actions = document.createElement("div");
				actions.className = "tree-actions";

				const btnUp = document.createElement("button");
				btnUp.className = "tree-btn";
				btnUp.textContent = "▲";
				btnUp.onclick = (e) => { e.stopPropagation(); moveControlOrder(idx, -1); };

				const btnDown = document.createElement("button");
				btnDown.className = "tree-btn";
				btnDown.textContent = "▼";
				btnDown.onclick = (e) => { e.stopPropagation(); moveControlOrder(idx, 1); };

				actions.appendChild(btnUp);
				actions.appendChild(btnDown);
				item.appendChild(actions);

				container.appendChild(item);
			});
		}

		function moveControlOrder(idx, dir) {
			const target = idx + dir;
			if (target < 0 || target >= formSpec.controls.length) return;
			saveHistoryState();
			const temp = formSpec.controls[idx];
			formSpec.controls[idx] = formSpec.controls[target];
			formSpec.controls[target] = temp;
			selectedIndices = [target];
			renderCanvas();
			renderCode();
			renderTree();
		}

		function updateObjectInspectorDropdown() {
			const sel = document.getElementById("objectInspectorSelector");
			if (!sel) return;
			sel.innerHTML = "";

			const formOpt = document.createElement("option");
			formOpt.value = "-1";
			formOpt.textContent = "Form: " + (formSpec.title || "Delphi/VB Form");
			if (selectedIndices.length === 0) formOpt.selected = true;
			sel.appendChild(formOpt);

			if (selectedIndices.length > 1) {
				const multiOpt = document.createElement("option");
				multiOpt.value = "-2";
				multiOpt.textContent = "⚡ Multiple Controls Selected (" + selectedIndices.length + " items)";
				multiOpt.selected = true;
				sel.appendChild(multiOpt);
			}

			formSpec.controls.forEach((c, idx) => {
				const opt = document.createElement("option");
				opt.value = idx;
				const typeLabel = c.control_type ? (c.control_type.charAt(0).toUpperCase() + c.control_type.slice(1)) : "Control";
				const textLabel = c.text ? ` ("${c.text}")` : "";
				opt.textContent = `${c.id}: ${typeLabel}${textLabel}`;
				if (selectedIndices.length === 1 && selectedIndices[0] === idx) {
					opt.selected = true;
				}
				sel.appendChild(opt);
			});
		}

		function selectControlFromDropdown(valIndex) {
			const idx = parseInt(valIndex, 10);
			if (idx === -1 || isNaN(idx)) {
				selectedIndices = [];
			} else if (idx >= 0 && idx < formSpec.controls.length) {
				selectedIndices = [idx];
			}
			renderCanvas();
			populateInspector();
			renderTree();
			if (selectedIndices.length > 0) {
				const c = formSpec.controls[selectedIndices[0]];
				showToast(`Selected: ${c.id} (${c.control_type})`);
				document.getElementById("statusMsg").textContent = "Selected component '" + c.id + "' on form.";
			} else {
				showToast("Selected: Form");
				document.getElementById("statusMsg").textContent = "Selected main parent Form.";
			}
		}

		function updateToolbarSelectionState() {
			const selCount = Array.isArray(selectedIndices) ? selectedIndices.length : 0;
			document.querySelectorAll("[data-min-sel]").forEach(btn => {
				const minSel = parseInt(btn.getAttribute("data-min-sel") || "1", 10);
				if (selCount < minSel) {
					btn.classList.add("btn-disabled");
					btn.setAttribute("aria-disabled", "true");
				} else {
					btn.classList.remove("btn-disabled");
					btn.setAttribute("aria-disabled", "false");
				}
			});
			const pasteBtn = document.getElementById("pasteBtn");
			if (pasteBtn) {
				const hasClip = Array.isArray(clipboardBuffer) && clipboardBuffer.length > 0;
				if (!hasClip) {
					pasteBtn.classList.add("btn-disabled");
					pasteBtn.setAttribute("aria-disabled", "true");
				} else {
					pasteBtn.classList.remove("btn-disabled");
					pasteBtn.setAttribute("aria-disabled", "false");
				}
			}
		}

		function populateInspector() {
			updateObjectInspectorDropdown();
			updateToolbarSelectionState();
			const container = document.getElementById("controlPropContainer");
			if (!container) return;
			if (selectedIndices.length === 0) {
				container.style.opacity = "0.4";
				container.style.pointerEvents = "none";
				const header = document.getElementById("selectedPropHeader");
				if (header) header.textContent = "Selected Control Properties";
				return;
			}
			container.style.opacity = "1";
			container.style.pointerEvents = "auto";

			const header = document.getElementById("selectedPropHeader");
			if (header) {
				header.textContent = selectedIndices.length === 1 
					? "Selected Control Properties" 
					: "Selected Control Properties (" + selectedIndices.length + " items)";
			}

			const propIdEl = document.getElementById("propId");
			const propTextEl = document.getElementById("propText");
			const propTooltipEl = document.getElementById("propTooltip");
			const propXEl = document.getElementById("propX");
			const propYEl = document.getElementById("propY");
			const propWEl = document.getElementById("propWidth");
			const propHEl = document.getElementById("propHeight");
			const propFSEl = document.getElementById("propFontSize");
			const fontEl = document.getElementById("propFontColor");
			const bgEl = document.getElementById("propBgColor");
			const hoverBgEl = document.getElementById("propHoverBgColor");
			const hoverFgEl = document.getElementById("propHoverFgColor");
			const cursorEl = document.getElementById("propCursor");

			if (selectedIndices.length === 1) {
				const c = formSpec.controls[selectedIndices[0]];
				if (propIdEl) { propIdEl.value = c.id; propIdEl.disabled = false; propIdEl.placeholder = ""; }
				if (propTextEl) { propTextEl.value = c.text || ""; propTextEl.placeholder = ""; }
				const propPlaceholderEl = document.getElementById("propPlaceholder");
				if (propPlaceholderEl) { propPlaceholderEl.value = c.placeholder || ""; propPlaceholderEl.placeholder = ""; }
				const propCheckedEl = document.getElementById("propChecked");
				if (propCheckedEl) { propCheckedEl.value = c.checked ? "true" : "false"; }
				const propEnabledEl = document.getElementById("propEnabled");
				if (propEnabledEl) { propEnabledEl.value = c.enabled !== false ? "true" : "false"; }
				const propReadOnlyEl = document.getElementById("propReadOnly");
				if (propReadOnlyEl) propReadOnlyEl.value = c.read_only ? "true" : "false";
				const propRequiredEl = document.getElementById("propRequired");
				if (propRequiredEl) propRequiredEl.value = c.required ? "true" : "false";
				const propAutoFocusEl = document.getElementById("propAutoFocus");
				if (propAutoFocusEl) propAutoFocusEl.value = c.auto_focus ? "true" : "false";
				const propMaxLengthEl = document.getElementById("propMaxLength");
				if (propMaxLengthEl) propMaxLengthEl.value = c.max_length !== undefined && c.max_length !== null ? c.max_length : "";
				const propMinValueEl = document.getElementById("propMinValue");
				if (propMinValueEl) propMinValueEl.value = c.min_value !== undefined && c.min_value !== null ? c.min_value : "";
				const propMaxValueEl = document.getElementById("propMaxValue");
				if (propMaxValueEl) propMaxValueEl.value = c.max_value !== undefined && c.max_value !== null ? c.max_value : "";
				const propStepEl = document.getElementById("propStep");
				if (propStepEl) propStepEl.value = c.step !== undefined && c.step !== null ? c.step : "";
				if (propTooltipEl) { propTooltipEl.value = c.tooltip || ""; propTooltipEl.placeholder = ""; }
				if (propXEl) { propXEl.value = c.x; propXEl.placeholder = ""; }
				if (propYEl) { propYEl.value = c.y; propYEl.placeholder = ""; }
				if (propWEl) { propWEl.value = c.width; propWEl.placeholder = ""; }
				if (propHEl) { propHEl.value = c.height; propHEl.placeholder = ""; }
				if (propFSEl) { propFSEl.value = c.font_size || 13; propFSEl.placeholder = ""; }
				if (fontEl) fontEl.value = c.font_color || "#ffffff";
				if (bgEl) bgEl.value = c.background_color || "#1e293b";
				if (hoverBgEl) hoverBgEl.value = c.hover_color || "#0284c7";
				if (hoverFgEl) hoverFgEl.value = c.hover_text_color || "#ffffff";
				if (cursorEl) cursorEl.value = c.cursor || "default";

				const propRadiusEl = document.getElementById("propBorderRadius");
				if (propRadiusEl) propRadiusEl.value = c.border_radius !== undefined && c.border_radius !== null ? c.border_radius : "";
				const propWidthEl = document.getElementById("propBorderWidth");
				if (propWidthEl) propWidthEl.value = c.border_width !== undefined && c.border_width !== null ? c.border_width : "";
				const propColorEl = document.getElementById("propBorderColor");
				if (propColorEl) propColorEl.value = c.border_color || "#38bdf8";
				const propStyleEl = document.getElementById("propBorderStyle");
				if (propStyleEl) propStyleEl.value = c.border_style || "solid";
				const propShadowEl = document.getElementById("propBoxShadow");
				if (propShadowEl) propShadowEl.value = c.box_shadow || "none";
				const propAlignEl = document.getElementById("propTextAlign");
				if (propAlignEl) propAlignEl.value = c.text_align || "left";
				const propOpacityEl = document.getElementById("propOpacity");
				if (propOpacityEl) propOpacityEl.value = c.opacity !== undefined && c.opacity !== null ? c.opacity : 100;

				c.event_handlers = c.event_handlers || {};
				const evtClickEl = document.getElementById("evtOnClick");
				if (evtClickEl) evtClickEl.value = c.event_handlers["onClick"] || "";
				const evtChangeEl = document.getElementById("evtOnChange");
				if (evtChangeEl) evtChangeEl.value = c.event_handlers["onChange"] || "";
				const evtDblClickEl = document.getElementById("evtOnDblClick");
				if (evtDblClickEl) evtDblClickEl.value = c.event_handlers["onDoubleClick"] || "";
				const evtHoverEl = document.getElementById("evtOnHover");
				if (evtHoverEl) evtHoverEl.value = c.event_handlers["onHover"] || "";
				const evtHoverExitEl = document.getElementById("evtOnHoverExit");
				if (evtHoverExitEl) evtHoverExitEl.value = c.event_handlers["onHoverExit"] || "";
				const evtFocusEl = document.getElementById("evtOnFocus");
				if (evtFocusEl) evtFocusEl.value = c.event_handlers["onFocus"] || "";
				const evtBlurEl = document.getElementById("evtOnBlur");
				if (evtBlurEl) evtBlurEl.value = c.event_handlers["onBlur"] || "";
				const evtKeyDownEl = document.getElementById("evtOnKeyDown");
				if (evtKeyDownEl) evtKeyDownEl.value = c.event_handlers["onKeyDown"] || "";
				const evtKeyUpEl = document.getElementById("evtOnKeyUp");
				if (evtKeyUpEl) evtKeyUpEl.value = c.event_handlers["onKeyUp"] || "";
				const evtMouseDownEl = document.getElementById("evtOnMouseDown");
				if (evtMouseDownEl) evtMouseDownEl.value = c.event_handlers["onMouseDown"] || "";
				const evtMouseUpEl = document.getElementById("evtOnMouseUp");
				if (evtMouseUpEl) evtMouseUpEl.value = c.event_handlers["onMouseUp"] || "";
			} else {
				const selectedCtrls = selectedIndices.map(i => formSpec.controls[i]);
				if (propIdEl) { propIdEl.value = ""; propIdEl.placeholder = "(Multiple)"; propIdEl.disabled = true; }
				const allSame = (key) => selectedCtrls.every(c => c[key] === selectedCtrls[0][key]);

				if (propTextEl) {
					propTextEl.value = allSame("text") ? selectedCtrls[0].text : "";
					propTextEl.placeholder = allSame("text") ? "" : "(Multiple values)";
				}
				const propPlaceholderEl = document.getElementById("propPlaceholder");
				if (propPlaceholderEl) {
					propPlaceholderEl.value = allSame("placeholder") ? (selectedCtrls[0].placeholder || "") : "";
					propPlaceholderEl.placeholder = allSame("placeholder") ? "" : "(Multiple values)";
				}
				const propReadOnlyEl = document.getElementById("propReadOnly");
				if (propReadOnlyEl) propReadOnlyEl.value = allSame("read_only") ? (selectedCtrls[0].read_only ? "true" : "false") : "false";
				const propRequiredEl = document.getElementById("propRequired");
				if (propRequiredEl) propRequiredEl.value = allSame("required") ? (selectedCtrls[0].required ? "true" : "false") : "false";
				const propAutoFocusEl = document.getElementById("propAutoFocus");
				if (propAutoFocusEl) propAutoFocusEl.value = allSame("auto_focus") ? (selectedCtrls[0].auto_focus ? "true" : "false") : "false";
				const propMaxLengthEl = document.getElementById("propMaxLength");
				if (propMaxLengthEl) { propMaxLengthEl.value = allSame("max_length") ? (selectedCtrls[0].max_length !== undefined ? selectedCtrls[0].max_length : "") : ""; propMaxLengthEl.placeholder = allSame("max_length") ? "Unlimited" : "(Multiple)"; }
				const propMinValueEl = document.getElementById("propMinValue");
				if (propMinValueEl) { propMinValueEl.value = allSame("min_value") ? (selectedCtrls[0].min_value !== undefined ? selectedCtrls[0].min_value : "") : ""; propMinValueEl.placeholder = allSame("min_value") ? "Min" : "(Multiple)"; }
				const propMaxValueEl = document.getElementById("propMaxValue");
				if (propMaxValueEl) { propMaxValueEl.value = allSame("max_value") ? (selectedCtrls[0].max_value !== undefined ? selectedCtrls[0].max_value : "") : ""; propMaxValueEl.placeholder = allSame("max_value") ? "Max" : "(Multiple)"; }
				const propStepEl = document.getElementById("propStep");
				if (propStepEl) { propStepEl.value = allSame("step") ? (selectedCtrls[0].step !== undefined ? selectedCtrls[0].step : "") : ""; propStepEl.placeholder = allSame("step") ? "1" : "(Multiple)"; }
				if (propTooltipEl) {
					propTooltipEl.value = allSame("tooltip") ? (selectedCtrls[0].tooltip || "") : "";
					propTooltipEl.placeholder = allSame("tooltip") ? "" : "(Multiple values)";
				}
				if (propXEl) {
					propXEl.value = allSame("x") ? selectedCtrls[0].x : "";
					propXEl.placeholder = allSame("x") ? "" : "(Multiple)";
				}
				if (propYEl) {
					propYEl.value = allSame("y") ? selectedCtrls[0].y : "";
					propYEl.placeholder = allSame("y") ? "" : "(Multiple)";
				}
				if (propWEl) {
					propWEl.value = allSame("width") ? selectedCtrls[0].width : "";
					propWEl.placeholder = allSame("width") ? "" : "(Multiple)";
				}
				if (propHEl) {
					propHEl.value = allSame("height") ? selectedCtrls[0].height : "";
					propHEl.placeholder = allSame("height") ? "" : "(Multiple)";
				}
				if (propFSEl) {
					propFSEl.value = allSame("font_size") ? (selectedCtrls[0].font_size || 13) : "";
					propFSEl.placeholder = allSame("font_size") ? "" : "(Multiple)";
				}
				if (fontEl) fontEl.value = allSame("font_color") ? (selectedCtrls[0].font_color || "#ffffff") : "#ffffff";
				if (bgEl) bgEl.value = allSame("background_color") ? (selectedCtrls[0].background_color || "#1e293b") : "#1e293b";
				if (hoverBgEl) hoverBgEl.value = allSame("hover_color") ? (selectedCtrls[0].hover_color || "#0284c7") : "#0284c7";
				if (hoverFgEl) hoverFgEl.value = allSame("hover_text_color") ? (selectedCtrls[0].hover_text_color || "#ffffff") : "#ffffff";
				if (cursorEl) cursorEl.value = allSame("cursor") ? (selectedCtrls[0].cursor || "default") : "default";

				const propRadiusEl = document.getElementById("propBorderRadius");
				if (propRadiusEl) propRadiusEl.value = allSame("border_radius") ? (selectedCtrls[0].border_radius !== undefined ? selectedCtrls[0].border_radius : "") : "";
				const propWidthEl = document.getElementById("propBorderWidth");
				if (propWidthEl) propWidthEl.value = allSame("border_width") ? (selectedCtrls[0].border_width !== undefined ? selectedCtrls[0].border_width : "") : "";
				const propColorEl = document.getElementById("propBorderColor");
				if (propColorEl) propColorEl.value = allSame("border_color") ? (selectedCtrls[0].border_color || "#38bdf8") : "#38bdf8";
				const propStyleEl = document.getElementById("propBorderStyle");
				if (propStyleEl) propStyleEl.value = allSame("border_style") ? (selectedCtrls[0].border_style || "solid") : "solid";
				const propShadowEl = document.getElementById("propBoxShadow");
				if (propShadowEl) propShadowEl.value = allSame("box_shadow") ? (selectedCtrls[0].box_shadow || "none") : "none";
				const propAlignEl = document.getElementById("propTextAlign");
				if (propAlignEl) propAlignEl.value = allSame("text_align") ? (selectedCtrls[0].text_align || "left") : "left";
				const propOpacityEl = document.getElementById("propOpacity");
				if (propOpacityEl) propOpacityEl.value = allSame("opacity") ? (selectedCtrls[0].opacity !== undefined ? selectedCtrls[0].opacity : 100) : 100;
			}
		}

		function updateSelectedControl(changedProp) {
			if (selectedIndices.length === 0) return;
			if (changedProp && typeof changedProp !== "string") {
				changedProp = undefined;
			}
			saveHistoryState();

			const propIdEl = document.getElementById("propId");
			const propTextEl = document.getElementById("propText");
			const propPlaceholderEl = document.getElementById("propPlaceholder");
			const propTooltipEl = document.getElementById("propTooltip");
			const propXEl = document.getElementById("propX");
			const propYEl = document.getElementById("propY");
			const propWEl = document.getElementById("propWidth");
			const propHEl = document.getElementById("propHeight");
			const propFSEl = document.getElementById("propFontSize");
			const fontEl = document.getElementById("propFontColor");
			const bgEl = document.getElementById("propBgColor");
			const hoverBgEl = document.getElementById("propHoverBgColor");
			const hoverFgEl = document.getElementById("propHoverFgColor");
			const cursorEl = document.getElementById("propCursor");

			const parseNum = (val, fallback, minVal) => {
				if (val === undefined || val === null || val === "") return fallback;
				const p = parseInt(val, 10);
				if (Number.isNaN(p)) return fallback;
				return Math.max(minVal, p);
			};

			selectedIndices.forEach((idx) => {
				const ctrl = formSpec.controls[idx];
				if ((!changedProp || changedProp === 'id') && selectedIndices.length === 1) {
					if (propIdEl && propIdEl.value && propIdEl.value.trim() !== "") ctrl.id = propIdEl.value.trim();
				}
				if (!changedProp || changedProp === 'text') {
					if (propTextEl && propTextEl.value !== "") ctrl.text = propTextEl.value;
				}
				if (!changedProp || changedProp === 'placeholder') {
					if (propPlaceholderEl) ctrl.placeholder = propPlaceholderEl.value;
				}
				if (!changedProp || changedProp === 'checked') {
					const propCheckedEl = document.getElementById("propChecked");
					if (propCheckedEl) {
						const isChk = propCheckedEl.value === "true";
						if (ctrl.control_type === "radio" && isChk) {
							formSpec.controls.forEach(c => {
								if (c.control_type === "radio") c.checked = false;
							});
						}
						ctrl.checked = isChk;
					}
				}
				if (!changedProp || changedProp === 'enabled') {
					const propEnabledEl = document.getElementById("propEnabled");
					if (propEnabledEl) {
						ctrl.enabled = propEnabledEl.value === "true";
					}
				}
				if (!changedProp || changedProp === 'read_only') {
					const el = document.getElementById("propReadOnly");
					if (el) ctrl.read_only = el.value === "true";
				}
				if (!changedProp || changedProp === 'required') {
					const el = document.getElementById("propRequired");
					if (el) ctrl.required = el.value === "true";
				}
				if (!changedProp || changedProp === 'auto_focus') {
					const el = document.getElementById("propAutoFocus");
					if (el) ctrl.auto_focus = el.value === "true";
				}
				if (!changedProp || changedProp === 'max_length') {
					const el = document.getElementById("propMaxLength");
					if (el && el.value !== "") ctrl.max_length = parseNum(el.value, undefined, 1); else if (el && el.value === "") delete ctrl.max_length;
				}
				if (!changedProp || changedProp === 'min_value') {
					const el = document.getElementById("propMinValue");
					if (el && el.value !== "") ctrl.min_value = parseFloat(el.value); else if (el && el.value === "") delete ctrl.min_value;
				}
				if (!changedProp || changedProp === 'max_value') {
					const el = document.getElementById("propMaxValue");
					if (el && el.value !== "") ctrl.max_value = parseFloat(el.value); else if (el && el.value === "") delete ctrl.max_value;
				}
				if (!changedProp || changedProp === 'step') {
					const el = document.getElementById("propStep");
					if (el && el.value !== "") ctrl.step = parseFloat(el.value); else if (el && el.value === "") delete ctrl.step;
				}
				if (!changedProp || changedProp === 'tooltip') {
					if (propTooltipEl) ctrl.tooltip = propTooltipEl.value;
				}
				if (!changedProp || changedProp === 'x') {
					if (propXEl && propXEl.value !== "") ctrl.x = parseNum(propXEl.value, ctrl.x, 0);
				}
				if (!changedProp || changedProp === 'y') {
					if (propYEl && propYEl.value !== "") ctrl.y = parseNum(propYEl.value, ctrl.y, 0);
				}
				if (!changedProp || changedProp === 'width') {
					if (propWEl && propWEl.value !== "") ctrl.width = parseNum(propWEl.value, ctrl.width, 10);
				}
				if (!changedProp || changedProp === 'height') {
					if (propHEl && propHEl.value !== "") ctrl.height = parseNum(propHEl.value, ctrl.height, 4);
				}
				if (!changedProp || changedProp === 'font_size') {
					if (propFSEl && propFSEl.value !== "") ctrl.font_size = parseNum(propFSEl.value, ctrl.font_size || 13, 1);
				}
				if (changedProp === 'font_color') {
					if (fontEl && fontEl.value) ctrl.font_color = fontEl.value;
				}
				if (changedProp === 'background_color') {
					if (bgEl && bgEl.value) ctrl.background_color = bgEl.value;
				}
				if (changedProp === 'hover_color') {
					if (hoverBgEl && hoverBgEl.value) ctrl.hover_color = hoverBgEl.value;
				}
				if (changedProp === 'hover_text_color') {
					if (hoverFgEl && hoverFgEl.value) ctrl.hover_text_color = hoverFgEl.value;
				}
				if (changedProp === 'cursor') {
					if (cursorEl) ctrl.cursor = cursorEl.value;
				}
				if (changedProp === 'border_radius') {
					const el = document.getElementById("propBorderRadius");
					if (el && el.value !== "") ctrl.border_radius = parseNum(el.value, 0, 0);
					else if (el && el.value === "") delete ctrl.border_radius;
				}
				if (changedProp === 'border_width') {
					const el = document.getElementById("propBorderWidth");
					if (el && el.value !== "") ctrl.border_width = parseNum(el.value, 0, 0);
					else if (el && el.value === "") delete ctrl.border_width;
				}
				if (changedProp === 'border_color') {
					const el = document.getElementById("propBorderColor");
					if (el && el.value) ctrl.border_color = el.value;
				}
				if (changedProp === 'border_style') {
					const el = document.getElementById("propBorderStyle");
					if (el && el.value) ctrl.border_style = el.value;
				}
				if (changedProp === 'box_shadow') {
					const el = document.getElementById("propBoxShadow");
					if (el && el.value) ctrl.box_shadow = el.value;
				}
				if (changedProp === 'text_align') {
					const el = document.getElementById("propTextAlign");
					if (el && el.value) ctrl.text_align = el.value;
				}
				if (changedProp === 'opacity') {
					const el = document.getElementById("propOpacity");
					if (el && el.value !== "") ctrl.opacity = Math.min(100, Math.max(0, parseNum(el.value, 100, 0)));
					else if (el && el.value === "") delete ctrl.opacity;
				}
			});

			renderCanvas();
			renderCode();
			renderTree();
			syncSpecToV();
		}

		function setBgColor(color) {
			if (selectedIndices.length === 0) return;
			saveHistoryState();
			selectedIndices.forEach(idx => {
				formSpec.controls[idx].background_color = color;
			});
			const bgEl = document.getElementById("propBgColor");
			if (bgEl && color !== "transparent") bgEl.value = color;
			renderCanvas();
			renderCode();
			renderTree();
			populateInspector();
			syncSpecToV();
		}

		function updateEventPlaceholder(evtName, val) {
			if (selectedIndices.length === 0) return;
			saveHistoryState();
			selectedIndices.forEach(idx => {
				const c = formSpec.controls[idx];
				c.event_handlers = c.event_handlers || {};
				c.event_handlers[evtName] = val;
			});
			renderCode();
			syncSpecToV();
		}

		function autoGenerateEvents() {
			if (selectedIndices.length === 0) return;
			saveHistoryState();
			selectedIndices.forEach(idx => {
				const c = formSpec.controls[idx];
				c.event_handlers = c.event_handlers || {};
				c.event_handlers["onClick"] = "on_" + c.id + "_click";
				c.event_handlers["onChange"] = "on_" + c.id + "_change";
				c.event_handlers["onHover"] = "on_" + c.id + "_hover";
				c.event_handlers["onHoverExit"] = "on_" + c.id + "_hover_exit";
				c.event_handlers["onFocus"] = "on_" + c.id + "_focus";
				c.event_handlers["onBlur"] = "on_" + c.id + "_blur";
				c.event_handlers["onKeyDown"] = "on_" + c.id + "_keydown";
				c.event_handlers["onKeyUp"] = "on_" + c.id + "_keyup";
				c.event_handlers["onMouseDown"] = "on_" + c.id + "_mousedown";
				c.event_handlers["onMouseUp"] = "on_" + c.id + "_mouseup";
			});
			populateInspector();
			renderCode();
			syncSpecToV();
			document.getElementById("statusMsg").textContent = "Auto-generated click, change, and hover event placeholders.";
		}

		function deleteSelectedControl() {
			if (selectedIndices.length === 0) return;
			saveHistoryState();
			selectedIndices.sort((a, b) => b - a).forEach(idx => {
				formSpec.controls.splice(idx, 1);
			});
			selectedIndices = [];
			renderCanvas();
			renderCode();
			renderTree();
			populateInspector();
			document.getElementById("statusMsg").textContent = "Selected control(s) deleted.";
		}

		function updateFormSpec() {
			saveHistoryState();
			const formTitleEl = document.getElementById("propFormTitle");
			if (formTitleEl) formSpec.title = formTitleEl.value;
			renderCanvas();
			renderCode();
		}

		let lastActiveCodeTab = "tabBunTS";
		const INSPECTOR_CODE_TABS = ["tabBunTS", "tabHTML", "tabReact", "tabVue", "tabPython", "tabJSON"];

		function switchTab(tabId, evt) {
			const resolvedTabId = tabId === "tabCode" ? (lastActiveCodeTab || "tabBunTS") : tabId;
			const isCodeTab = INSPECTOR_CODE_TABS.includes(resolvedTabId);

			document.querySelectorAll(".tab-item").forEach(t => t.classList.remove("active"));
			document.querySelectorAll(".tab-content").forEach(c => c.classList.remove("active"));

			const subbar = document.getElementById("inspectorCodeSubbar");
			if (isCodeTab) {
				lastActiveCodeTab = resolvedTabId;
				const primaryCodeTab = document.getElementById("inspectorCodePrimaryTab");
				if (primaryCodeTab) primaryCodeTab.classList.add("active");
				if (subbar) subbar.classList.add("visible");
				document.querySelectorAll(".code-lang-pill").forEach(pill => {
					const oc = pill.getAttribute("onclick") || "";
					if (oc.includes("'" + resolvedTabId + "'")) {
						pill.classList.add("active");
					} else {
						pill.classList.remove("active");
					}
				});
			} else {
				if (subbar) subbar.classList.remove("visible");
				if (evt && evt.target && evt.target.classList.contains("tab-item")) {
					evt.target.classList.add("active");
				} else {
					document.querySelectorAll(".tab-item").forEach(t => {
						if (t.getAttribute("onclick") && t.getAttribute("onclick").includes("'" + resolvedTabId + "'")) {
							t.classList.add("active");
						}
					});
				}
			}

			const targetContent = document.getElementById(resolvedTabId);
			if (targetContent) targetContent.classList.add("active");
		}
