
		function filterPalette(query) {
			const q = (query || "").toLowerCase().trim();
			let totalVisible = 0;
			const categories = document.querySelectorAll(".palette-category");
			categories.forEach(cat => {
				const items = cat.querySelectorAll(".palette-item");
				let catVisible = 0;
				items.forEach(item => {
					const labelText = (item.textContent || "").toLowerCase();
					const titleText = (item.getAttribute("title") || "").toLowerCase();
					const match = !q || labelText.includes(q) || titleText.includes(q);
					item.style.display = match ? "flex" : "none";
					if (match) catVisible++;
				});
				totalVisible += catVisible;
				const countBadge = cat.querySelector(".palette-cat-count");
				if (countBadge) {
					countBadge.textContent = q ? (catVisible + "/" + items.length) : String(items.length);
				}
				if (q) {
					cat.style.display = catVisible > 0 ? "" : "none";
					const grid = cat.querySelector(".palette-grid");
					if (grid) grid.style.display = catVisible > 0 ? "grid" : "none";
				} else {
					cat.style.display = "";
					const grid = cat.querySelector(".palette-grid");
					if (grid) grid.style.display = "";
				}
			});
			const emptyMsg = document.getElementById("paletteEmptyMsg");
			if (emptyMsg) {
				emptyMsg.style.display = (q && totalVisible === 0) ? "block" : "none";
			}
		}

		function updatePaletteCollapseButtonLabel() {
			const btn = document.getElementById("toggleAllCategoriesBtn");
			if (!btn) return;
			const categories = Array.from(document.querySelectorAll(".palette-category"));
			const allCollapsed = categories.length > 0 && categories.every(c => c.classList.contains("collapsed"));
			btn.textContent = allCollapsed ? "⊞ Expand" : "⊟ Collapse";
		}

		function initPaletteCategories() {
			document.querySelectorAll(".palette-category").forEach(cat => {
				const header = cat.querySelector(".palette-cat-header");
				const items = cat.querySelectorAll(".palette-item");
				if (!header || header.dataset.collapsibleBound === "1") return;
				header.dataset.collapsibleBound = "1";
				if (!header.querySelector(".palette-cat-count")) {
					const countSpan = document.createElement("span");
					countSpan.className = "palette-cat-count";
					countSpan.textContent = String(items.length);
					header.appendChild(countSpan);
				}
				if (!header.querySelector(".palette-cat-chevron")) {
					const chev = document.createElement("span");
					chev.className = "palette-cat-chevron";
					chev.textContent = "▾";
					header.appendChild(chev);
				}
				header.setAttribute("role", "button");
				header.setAttribute("tabindex", "0");
				header.setAttribute("aria-expanded", cat.classList.contains("collapsed") ? "false" : "true");
				const toggleCat = () => {
					cat.classList.toggle("collapsed");
					header.setAttribute("aria-expanded", cat.classList.contains("collapsed") ? "false" : "true");
					updatePaletteCollapseButtonLabel();
				};
				header.addEventListener("click", toggleCat);
				header.addEventListener("keydown", (e) => {
					if (e.key === "Enter" || e.key === " ") {
						e.preventDefault();
						toggleCat();
					}
				});
			});
			updatePaletteCollapseButtonLabel();
		}

		function toggleAllPaletteCategories() {
			const categories = Array.from(document.querySelectorAll(".palette-category"));
			if (categories.length === 0) return;
			const allCollapsed = categories.every(c => c.classList.contains("collapsed"));
			categories.forEach(cat => {
				if (allCollapsed) {
					cat.classList.remove("collapsed");
				} else {
					cat.classList.add("collapsed");
				}
				const header = cat.querySelector(".palette-cat-header");
				if (header) header.setAttribute("aria-expanded", allCollapsed ? "true" : "false");
			});
			updatePaletteCollapseButtonLabel();
		}

		function filterControlProps(query) {
			const q = (query || "").toLowerCase().trim();
			const container = document.getElementById("controlPropContainer");
			if (!container) return;
			const rows = container.querySelectorAll(".prop-row, .prop-grid-2");
			rows.forEach(r => {
				const label = r.querySelector(".prop-label") || r;
				const text = label.textContent.toLowerCase();
				if (!q || text.includes(q)) {
					r.style.display = "";
				} else {
					r.style.display = "none";
				}
			});
		}

		function centerInForm(dir) {
			if (selectedIndices.length === 0) return;
			saveHistoryState();
			const canvas = document.getElementById('formCanvas');
			const formW = canvas ? canvas.clientWidth : (formSpec.width || 800);
			const formH = canvas ? canvas.clientHeight : (formSpec.height || 600);
			selectedIndices.forEach(idx => {
				const c = formSpec.controls[idx];
				if (c.locked) return;
				if (dir === "horiz" || dir === "h") {
					c.x = Math.max(0, Math.round((formW - c.width) / 2));
				} else if (dir === "vert" || dir === "v") {
					c.y = Math.max(0, Math.round((formH - c.height) / 2));
				}
			});
			renderCanvas();
			renderCode();
			renderTree();
			populateInspector();
			syncSpecToV();
			document.getElementById("statusMsg").textContent = "Centered " + selectedIndices.length + " control(s) in form.";
		}

		// Enter Delphi-style placement mode: clicking palette item arms the cursor
		// then the next click on the canvas places the control at that position.
		function enterPlacementMode(type) {
			const toast = document.getElementById('placementToast');
			const toastText = document.getElementById('placementToastText');
			if (toast) { if (toastText) toastText.textContent = 'Click canvas to place ' + type; toast.style.display = 'flex'; requestAnimationFrame(() => toast.classList.add('visible')); }

			placementType = type;
			const canvas = document.getElementById("formCanvas");
			if (canvas) canvas.style.cursor = "crosshair";
			const statusMsg = document.getElementById("statusMsg");
			if (statusMsg) statusMsg.textContent = "✚ Placement Mode: Click on canvas to place " + type + " — Press Esc to cancel";
			// Highlight the selected palette item
			document.querySelectorAll(".palette-item").forEach(el => el.classList.remove("palette-item-armed"));
			document.querySelectorAll(".palette-item").forEach(el => {
				if (el.getAttribute("onclick") && el.getAttribute("onclick").includes("'" + type + "'")) {
					el.classList.add("palette-item-armed");
				}
			});
		}

				function cancelPlacementMode() {
			const toast = document.getElementById('placementToast');
			if (toast) { toast.classList.remove('visible'); setTimeout(() => { toast.style.display = 'none'; }, 250); }

			draggedType = null;
			placementType = null;
			const canvas = document.getElementById("formCanvas");
			if (canvas) canvas.style.cursor = "";
			document.querySelectorAll(".palette-item").forEach(el => el.classList.remove("palette-item-armed"));
			const statusMsg = document.getElementById("statusMsg");
			if (statusMsg) statusMsg.textContent = "Design mode active.";
		}

		function onCanvasClick(e) {
			if (!placementType) return; // Not in placement mode, let normal handlers work
			if (e.target.classList.contains("resize-handle")) return;
			if (e.target.classList.contains("designer-control") || e.target.closest(".designer-control")) return;
			e.preventDefault();
			e.stopPropagation();
			const canvas = document.getElementById("formCanvas");
			const rect = canvas.getBoundingClientRect();
			let x = Math.round((e.clientX - rect.left) / canvasScale);
			let y = Math.round((e.clientY - rect.top) / canvasScale);
			if (snapToGrid) { x = Math.round(x / 8) * 8; y = Math.round(y / 8) * 8; }
			const targetType = placementType;
			// Clear placement mode BEFORE placeControlAt unless Shift is held
			if (!e.shiftKey) {
				cancelPlacementMode();
			}
			placeControlAt(targetType, x, y);
		}

		function spawnControl(type) {
			// spawnControl now enters placement mode for precise canvas click placement
			enterPlacementMode(type);
		}

		function placeControlAt(type, x, y) {
			saveHistoryState();
			const count = formSpec.controls.length + 1;
			const id = type + "_" + count;

			if (snapToGrid) {
				x = Math.round(x / 8) * 8;
				y = Math.round(y / 8) * 8;
			}

			let defaultW = 150;
			let defaultH = 36;
			if (type === "textarea" || type === "table" || type === "panel" || type === "form_textarea" || type === "code_view" || type === "form_drop_zone") { defaultW = 280; defaultH = 120; }
			if (type === "form_field" || type === "form_password" || type === "form_dropdown" || type === "form_date" || type === "form_slider" || type === "form_progress" || type === "form_checkbox" || type === "form_radio" || type === "form_search" || type === "form_color" || type === "form_time" || type === "form_stepper") { defaultW = 220; defaultH = 44; }
			if (type === "form_code") { defaultW = 280; defaultH = 140; }
			if (type === "tabs") { defaultW = 320; defaultH = 40; }
			if (type === "tool_bar") { defaultW = 400; defaultH = 40; }
			if (type === "status_bar") { defaultW = 400; defaultH = 28; }
			if (type === "split_pane") { defaultW = 320; defaultH = 160; }
			if (type === "pagination") { defaultW = 260; defaultH = 36; }
			if (type === "command_palette") { defaultW = 320; defaultH = 40; }
			if (type === "toggle_button") { defaultW = 120; defaultH = 36; }
			if (type === "form_switch") { defaultW = 220; defaultH = 32; }
			if (type === "metric_card") { defaultW = 180; defaultH = 75; }
			if (type === "alert_banner") { defaultW = 320; defaultH = 40; }
			if (type === "circular_progress") { defaultW = 80; defaultH = 80; }
			if (type === "divider") { defaultW = 300; defaultH = 4; }
			if (type === "badge" || type === "status_indicator" || type === "form_link") { defaultW = 140; defaultH = 26; }
			if (type === "radio" || type === "switch" || type === "date" || type === "date_picker") { defaultW = 180; defaultH = 28; }
			if (type === "rating" || type === "stepper") { defaultW = 120; defaultH = 32; }
			if (type === "segmented_control") { defaultW = 240; defaultH = 36; }
			if (type === "tree_view") { defaultW = 220; defaultH = 140; }
			if (type === "avatar_group") { defaultW = 160; defaultH = 38; }
			if (type === "stat_chart") { defaultW = 200; defaultH = 90; }
			if (type === "accordion") { defaultW = 280; defaultH = 100; }
			if (type === "breadcrumb") { defaultW = 260; defaultH = 32; }
			if (type === "timeline") { defaultW = 280; defaultH = 110; }
			if (type === "toast_card") { defaultW = 260; defaultH = 64; }
			if (type === "time_picker") { defaultW = 150; defaultH = 36; }
			if (type === "rich_select") { defaultW = 200; defaultH = 36; }
			if (type === "property_grid") { defaultW = 240; defaultH = 140; }
			if (type === "popup_menu") { defaultW = 200; defaultH = 130; }
			if (type === "calendar_view") { defaultW = 240; defaultH = 180; }
			if (type === "color_swatch") { defaultW = 200; defaultH = 70; }
			if (type === "file_path_bar") { defaultW = 280; defaultH = 36; }
			if (type === "kanban_board") { defaultW = 340; defaultH = 180; }
			if (type === "shortcut_recorder") { defaultW = 180; defaultH = 36; }
			if (type === "split_button") { defaultW = 160; defaultH = 36; }
			if (type === "sparkline_table") { defaultW = 300; defaultH = 130; }
			if (type === "metric_comparison") { defaultW = 220; defaultH = 90; }
			if (type === "activity_feed") { defaultW = 280; defaultH = 140; }
			if (type === "file_tree_tabs") { defaultW = 320; defaultH = 36; }
			if (type === "sidebar" || type === "w3_sidebar") { defaultW = 200; defaultH = 260; }
			if (type === "modal" || type === "modal_dialog" || type === "w3_modal") { defaultW = 320; defaultH = 180; }
			if (type === "dropdown_menu" || type === "w3_dropdown") { defaultW = 160; defaultH = 36; }
			if (type === "list_group" || type === "w3_list") { defaultW = 280; defaultH = 160; }
			if (type === "content_card" || type === "card" || type === "w3_card") { defaultW = 240; defaultH = 220; }
			if (type === "callout_panel" || type === "note_panel" || type === "w3_panel") { defaultW = 280; defaultH = 80; }
			if (type === "tooltip_box" || type === "w3_tooltip") { defaultW = 140; defaultH = 36; }
			if (type === "animated_input" || type === "w3_animated_input") { defaultW = 240; defaultH = 36; }
			if (type === "hero_display" || type === "display_container" || type === "w3_display") { defaultW = 280; defaultH = 160; }
			if (type === "code_snippet" || type === "code_block" || type === "w3_code") { defaultW = 300; defaultH = 110; }
			if (type === "count_badge" || type === "circular_badge" || type === "w3_badge") { defaultW = 32; defaultH = 32; }
			if (type === "button_group" || type === "button_bar" || type === "w3_button_group") { defaultW = 240; defaultH = 36; }
			if (type === "slideshow" || type === "carousel" || type === "w3_slideshow") { defaultW = 300; defaultH = 180; }

			const themeSelect = document.getElementById("propFormTheme");
			const activeTheme = themeSelect ? themeSelect.value : "Dark";
			const themeColors = getThemeColors(activeTheme);

			const transparentTypes = ["label", "checkbox", "switch", "radio", "rating", "status_indicator", "circular_progress", "slider", "mode", "divider", "badge", "form_link", "alert_banner", "path", "form_field", "form_textarea", "form_password", "form_number", "form_slider", "form_dropdown", "form_date", "form_progress", "form_switch", "form_checkbox", "form_radio", "form_search", "form_color", "form_time", "form_stepper", "form_code", "form_drop_zone", "tabs", "tool_bar", "status_bar", "split_pane", "pagination", "command_palette", "toggle_button", "stepper", "tag", "metric_meter", "progress", "number", "date", "search", "segmented_control", "tree_view", "avatar_group", "breadcrumb", "timeline", "time_picker", "rich_select", "color_swatch", "file_path_bar", "kanban_board", "shortcut_recorder", "split_button", "sparkline_table", "metric_comparison", "activity_feed", "file_tree_tabs", "dropdown_menu", "tooltip_box", "animated_input", "count_badge", "button_group", "w3_dropdown", "w3_tooltip", "w3_animated_input", "w3_badge", "w3_button_group"];
			let defaultBg = themeColors.ctrlBg;
			if (transparentTypes.includes(type)) {
				defaultBg = "transparent";
			} else if (type === "button") {
				defaultBg = themeColors.btnBg;
			} else if (type === "panel") {
				defaultBg = themeColors.panelBg;
			}

			let defaultTooltip = "";
			const pItem = document.querySelector(`.palette-item[onclick*="'${type}'"]`);
			if (pItem) defaultTooltip = pItem.getAttribute("title") || "";

			const newControl = {
				id: id,
				control_type: type,
				x: x,
				y: y,
				width: defaultW,
				height: defaultH,
				text: capitalize(type) + " " + count,
				font_size: 13,
				font_color: type === "button" ? themeColors.btnFg : (type === "label" ? themeColors.formFg : themeColors.ctrlFg),
				background_color: defaultBg,
				enabled: true,
				visible: true,
				locked: false,
				tooltip: defaultTooltip,
				event_handlers: {
					"onClick": "on_" + id + "_click"
				}
			};

			formSpec.controls.push(newControl);
			selectedIndices = [formSpec.controls.length - 1];
			renderCanvas();
			renderCode();
			renderTree();
			populateInspector();
			document.getElementById("statusMsg").textContent = "Placed " + type + " control (" + id + ")";
		}

		function onDragStart(e, type) {
			draggedType = type;
			e.dataTransfer.setData("text/plain", type);
			// Also enter placement mode as fallback for drop
			placementType = type;
		}

				function onCanvasDrop(e) {
			e.preventDefault();
			const canvas = document.getElementById("formCanvas");
			const rect = canvas.getBoundingClientRect();
			let x = Math.round((e.clientX - rect.left) / canvasScale);
			let y = Math.round((e.clientY - rect.top) / canvasScale);

			if (snapToGrid) {
				x = Math.round(x / 8) * 8;
				y = Math.round(y / 8) * 8;
			}

			const type = draggedType || placementType || e.dataTransfer.getData("text/plain") || "button";
			placeControlAt(type, x, y);
			cancelPlacementMode();
		}

		function toggleLockSelected() {
			if (selectedIndices.length === 0) return;
			saveHistoryState();
			selectedIndices.forEach(idx => {
				formSpec.controls[idx].locked = !formSpec.controls[idx].locked;
			});
			renderCanvas();
			renderTree();
			populateInspector();
		}
