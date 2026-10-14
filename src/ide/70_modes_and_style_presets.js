
		let gridSize = 8;
		let isLiveHoverMode = false;
		let isTabOrderMode = false;
		let nextTabSeq = 0;

		function toggleTabOrderMode() {
			isTabOrderMode = !isTabOrderMode;
			const btn = document.getElementById("tabOrderBtn");
			if (btn) {
				btn.textContent = "🔢 Tab Order: " + (isTabOrderMode ? "ON" : "OFF");
				btn.className = isTabOrderMode ? "btn btn-warning" : "btn";
			}
			if (isTabOrderMode) {
				nextTabSeq = 0;
			}
			renderCanvas();
			const statusMsg = document.getElementById("statusMsg");
			if (statusMsg) {
				statusMsg.textContent = isTabOrderMode 
					? "🔢 Tab Order Mode active. Click controls sequentially on canvas to set focus index (0, 1, 2...)." 
					: "Exited Tab Order Mode.";
			}
		}

		function autoSequenceTabOrder() {
			saveHistoryState();
			let sorted = formSpec.controls.slice().map((c, i) => ({ ctrl: c, index: i }));
			sorted.sort((a, b) => {
				const dy = Math.abs(a.ctrl.y - b.ctrl.y);
				if (dy > 22) return a.ctrl.y - b.ctrl.y;
				return a.ctrl.x - b.ctrl.x;
			});
			sorted.forEach((item, seq) => {
				item.ctrl.tab_order = seq;
			});
			renderCanvas();
			renderCode();
			populateInspector();
			const statusMsg = document.getElementById("statusMsg");
			if (statusMsg) statusMsg.textContent = "Auto-sequenced tab order (Top-to-Bottom, Left-to-Right) for all controls.";
		}

		function toggleLiveHoverMode() {
			isLiveHoverMode = !isLiveHoverMode;
			const btn = document.getElementById("liveHoverTestBtn");
			if (btn) {
				btn.textContent = "⚡ Live Hover Mode: " + (isLiveHoverMode ? "ON" : "OFF");
				btn.className = isLiveHoverMode ? "btn btn-success" : "btn";
			}
			renderCanvas();
			document.getElementById("statusMsg").textContent = isLiveHoverMode 
				? "⚡ Live Hover & Interactive Canvas Mode active. Hover/click controls to test live handlers." 
				: "Design mode active. Drag & resize controls on canvas.";
		}

		function showSnapGridMenu() {
			const options = [8, 4, 16, 32, 0];
			const curIdx = options.indexOf(gridSize);
			gridSize = options[(curIdx + 1) % options.length];
			snapToGrid = gridSize > 0;
			const snapBtn = document.getElementById("snapBtn");
			if (snapBtn) snapBtn.textContent = "📐 Snap: " + (gridSize > 0 ? gridSize + "px" : "OFF");
			document.getElementById("statusMsg").textContent = "Grid Snap set to: " + (gridSize > 0 ? gridSize + "px" : "Disabled");
		}

		function fitControlToContent() {
			if (selectedIndices.length === 0) return;
			saveHistoryState();
			selectedIndices.forEach(idx => {
				const c = formSpec.controls[idx];
				if (c.locked) return;
				const charW = (c.font_size || 13) * 0.62;
				const len = (c.text || c.id).length;
				c.width = Math.max(60, Math.round(len * charW + 28));
				c.height = Math.max(26, Math.round((c.font_size || 13) * 1.8 + 8));
			});
			renderCanvas();
			renderCode();
			renderTree();
			populateInspector();
			document.getElementById("statusMsg").textContent = "Auto-fitted size for " + selectedIndices.length + " control(s).";
		}

		function setHoverBgColor(hex) {
			if (selectedIndices.length === 0) return;
			saveHistoryState();
			selectedIndices.forEach(idx => {
				formSpec.controls[idx].hover_color = hex;
			});
			const el = document.getElementById("propHoverBgColor");
			if (el && hex) el.value = hex;
			renderCanvas();
			renderCode();
			populateInspector();
			syncSpecToV();
		}

		function applyQuickStylePreset(preset) {
			if (selectedIndices.length === 0) return;
			saveHistoryState();
			const styles = {
				primary: { bg: "#0284c7", fg: "#ffffff", hBg: "#0369a1", hFg: "#ffffff", cursor: "pointer" },
				success: { bg: "#10b981", fg: "#ffffff", hBg: "#059669", hFg: "#ffffff", cursor: "pointer" },
				warning: { bg: "#f59e0b", fg: "#ffffff", hBg: "#d97706", hFg: "#ffffff", cursor: "pointer" },
				danger:  { bg: "#ef4444", fg: "#ffffff", hBg: "#dc2626", hFg: "#ffffff", cursor: "pointer" },
				violet:  { bg: "#8b5cf6", fg: "#ffffff", hBg: "#7c3aed", hFg: "#ffffff", cursor: "pointer" },
				slate:   { bg: "#334155", fg: "#ffffff", hBg: "#475569", hFg: "#ffffff", cursor: "default" }
			};
			const st = styles[preset] || styles.primary;
			selectedIndices.forEach(idx => {
				const c = formSpec.controls[idx];
				c.background_color = st.bg;
				c.font_color = st.fg;
				c.hover_color = st.hBg;
				c.hover_text_color = st.hFg;
				c.cursor = st.cursor;
			});
			renderCanvas();
			renderCode();
			renderTree();
			populateInspector();
			syncSpecToV();
			document.getElementById("statusMsg").textContent = "Applied " + preset.toUpperCase() + " style preset to " + selectedIndices.length + " control(s).";
		}
