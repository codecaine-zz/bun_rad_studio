
		// Keyboard resize (Alt + arrow keys): grow or shrink the selected controls, never below 8 px.
		function resizeSelectedControlsBy(dw, dh) {
			if (selectedIndices.length === 0) return;
			saveHistoryState();
			selectedIndices.forEach(idx => {
				const ctrl = formSpec.controls[idx];
				if (!ctrl.locked) {
					ctrl.width = Math.max(8, ctrl.width + dw);
					ctrl.height = Math.max(8, ctrl.height + dh);
				}
			});
			renderCanvas();
			renderCode();
			renderTree();
			populateInspector();
			document.getElementById("statusMsg").textContent = "Resized " + selectedIndices.length + " control(s) by keyboard.";
		}

		// Keyboard placement: drop a control just below the lowest existing one (or near the top-left of an empty form)
		// instead of waiting for a mouse click on the canvas. The new control is selected, so arrow keys move it
		// (Shift = 8 px) and Alt + arrow keys resize it.
		function placeControlWithKeyboard(type) {
			const bottom = formSpec.controls.reduce((m, c) => Math.max(m, (c.y || 0) + (c.height || 0)), 0);
			const y = formSpec.controls.length ? bottom + 8 : 16;
			const before = formSpec.controls.length;
			placeControlAt(type, 16, Math.min(y, Math.max(0, (formSpec.height || 560) - 44)));
			cancelPlacementMode();
			if (formSpec.controls.length > before) {
				const c = formSpec.controls[formSpec.controls.length - 1];
				document.getElementById("statusMsg").textContent = "Placed " + type + " control (" + c.id + ") at " + c.x + "," + c.y + ". Arrow keys move it (Shift = 8 px), Alt + arrow keys resize it.";
			}
		}

		function moveSelectedControlsBy(dx, dy) {
			if (selectedIndices.length === 0) return;
			saveHistoryState();
			selectedIndices.forEach(idx => {
				const ctrl = formSpec.controls[idx];
				if (!ctrl.locked) {
					ctrl.x = Math.max(0, ctrl.x + dx);
					ctrl.y = Math.max(0, ctrl.y + dy);
				}
			});
			renderCanvas();
			renderCode();
			renderTree();
			populateInspector();
		}

		function autoArrangeColumns(cols) {
			saveHistoryState();
			const targets = selectedIndices.length > 0 ? selectedIndices : formSpec.controls.map((_, i) => i);
			if (targets.length === 0) return;

			const startX = 24;
			const startY = 64;
			const gapX = 16;
			const gapY = 16;
			const availableWidth = formSpec.width - startX * 2;
			const colWidth = Math.max(120, Math.floor((availableWidth - (cols - 1) * gapX) / cols));

			targets.forEach((idx, i) => {
				const col = i % cols;
				const row = Math.floor(i / cols);
				const ctrl = formSpec.controls[idx];
				if (ctrl.locked) return;

				ctrl.x = Math.round(startX + col * (colWidth + gapX));
				ctrl.y = Math.round(startY + row * (40 + gapY));
				if (ctrl.control_type !== "panel" && ctrl.control_type !== "table") {
					ctrl.width = colWidth;
				}
			});

			renderCanvas();
			renderCode();
			renderTree();
			populateInspector();
			document.getElementById("statusMsg").textContent = "Auto-arranged controls into " + cols + " columns.";
		}

		function alignSelectedControls(mode) {
			const mapped = mode === "center_h" ? "center" : (mode === "center_v" ? "middle" : mode);
			alignControls(mapped);
		}

		function alignControls(mode) {
			if (selectedIndices.length === 0) {
				const msg = document.getElementById('statusMsg');
				if (msg) msg.textContent = 'Select one or more controls first, then align.';
				return;
			}
			saveHistoryState();
			const canvas = document.getElementById('formCanvas');
			const formW = canvas ? canvas.clientWidth : (formSpec.width || 800);
			const formH = canvas ? canvas.clientHeight : (formSpec.height || 600);

			if (selectedIndices.length === 1) {
				// Single control: align to form boundaries
				const active = formSpec.controls[selectedIndices[0]];
				if (!active.locked) {
					if (mode === 'left')   active.x = 0;
					if (mode === 'center') active.x = Math.max(0, Math.round((formW - active.width) / 2));
					if (mode === 'right')  active.x = Math.max(0, formW - active.width);
					if (mode === 'top')    active.y = 0;
					if (mode === 'middle') active.y = Math.max(0, Math.round((formH - active.height) / 2));
					if (mode === 'bottom') active.y = Math.max(0, formH - active.height);
				}
			} else {
				// Multiple controls: align to primary anchor (first selected control in Delphi/VB RAD style)
				const anchorIdx = (lastAnchorIdx !== null && lastAnchorIdx !== undefined && selectedIndices.includes(lastAnchorIdx)) ? lastAnchorIdx : selectedIndices[0];
				const anchor = formSpec.controls[anchorIdx];
				const anchorCenterX = anchor.x + anchor.width / 2;
				const anchorCenterY = anchor.y + anchor.height / 2;
				const anchorRight = anchor.x + anchor.width;
				const anchorBottom = anchor.y + anchor.height;

				selectedIndices.forEach(idx => {
					const active = formSpec.controls[idx];
					if (active.locked) return;
					if (mode === 'left')   active.x = anchor.x;
					if (mode === 'center') active.x = Math.max(0, Math.round(anchorCenterX - active.width / 2));
					if (mode === 'right')  active.x = Math.max(0, anchorRight - active.width);
					if (mode === 'top')    active.y = anchor.y;
					if (mode === 'middle') active.y = Math.max(0, Math.round(anchorCenterY - active.height / 2));
					if (mode === 'bottom') active.y = Math.max(0, anchorBottom - active.height);
				});
			}
			renderCanvas();
			renderCode();
			renderTree();
			populateInspector();
			syncSpecToV();
			const names = { left: 'Left Edge', center: 'Horizontal Center', right: 'Right Edge', top: 'Top Edge', middle: 'Vertical Center', bottom: 'Bottom Edge' };
			const statusMsg = document.getElementById('statusMsg');
			if (statusMsg) statusMsg.textContent = 'Aligned ' + selectedIndices.length + ' control(s) to ' + (names[mode] || mode) + (selectedIndices.length > 1 ? ' (relative to primary control)' : ' (relative to form)');
		}

		function equalizeSize(dimension, mode = "first") {
			const statusMsg = document.getElementById("statusMsg");
			if (selectedIndices.length < 2) {
				if (statusMsg) statusMsg.textContent = "⚠️ Select 2 or more controls to equalize size.";
				return;
			}
			saveHistoryState();
			const anchorIdx = (lastAnchorIdx !== null && lastAnchorIdx !== undefined && selectedIndices.includes(lastAnchorIdx)) ? lastAnchorIdx : selectedIndices[0];
			const anchorCtrl = formSpec.controls[anchorIdx] || formSpec.controls[selectedIndices[0]];
			const selectedCtrls = selectedIndices.map(i => formSpec.controls[i]);

			let targetVal = 0;
			let labelMode = "";

			if (dimension === "width") {
				if (mode === "widest") {
					targetVal = Math.max(...selectedCtrls.map(c => c.width));
					labelMode = "Widest (" + targetVal + "px)";
				} else if (mode === "narrowest") {
					targetVal = Math.min(...selectedCtrls.map(c => c.width));
					labelMode = "Narrowest (" + targetVal + "px)";
				} else {
					targetVal = anchorCtrl.width;
					labelMode = "Primary Control Width (" + targetVal + "px)";
				}
				selectedIndices.forEach(idx => {
					const ctrl = formSpec.controls[idx];
					if (!ctrl.locked) ctrl.width = targetVal;
				});
			} else if (dimension === "height") {
				if (mode === "tallest") {
					targetVal = Math.max(...selectedCtrls.map(c => c.height));
					labelMode = "Tallest (" + targetVal + "px)";
				} else if (mode === "shortest") {
					targetVal = Math.min(...selectedCtrls.map(c => c.height));
					labelMode = "Shortest (" + targetVal + "px)";
				} else {
					targetVal = anchorCtrl.height;
					labelMode = "Primary Control Height (" + targetVal + "px)";
				}
				selectedIndices.forEach(idx => {
					const ctrl = formSpec.controls[idx];
					if (!ctrl.locked) ctrl.height = targetVal;
				});
			}

			renderCanvas();
			renderCode();
			renderTree();
			populateInspector();
			syncSpecToV();
			if (statusMsg) statusMsg.textContent = "⚡ Resized " + selectedIndices.length + " controls to " + labelMode + ".";
		}

		function distributeControls(axis) {
			const statusMsg = document.getElementById("statusMsg");
			if (selectedIndices.length < 3) {
				if (statusMsg) statusMsg.textContent = "⚠️ Select 3 or more controls to distribute spacing evenly.";
				return;
			}
			saveHistoryState();
			let items = selectedIndices.map(i => formSpec.controls[i]);
			if (axis === "horiz") {
				items.sort((a, b) => a.x - b.x);
				let minX = items[0].x;
				let maxX = items[items.length - 1].x;
				let totalGap = (maxX - minX);
				let step = totalGap / (items.length - 1);
				items.forEach((item, index) => {
					if (!item.locked) item.x = Math.round(minX + index * step);
				});
			} else {
				items.sort((a, b) => a.y - b.y);
				let minY = items[0].y;
				let maxY = items[items.length - 1].y;
				let totalGap = (maxY - minY);
				let step = totalGap / (items.length - 1);
				items.forEach((item, index) => {
					if (!item.locked) item.y = Math.round(minY + index * step);
				});
			}
			renderCanvas();
			renderCode();
			renderTree();
			populateInspector();
			syncSpecToV();
			if (statusMsg) statusMsg.textContent = "⚡ Distributed " + selectedIndices.length + " controls evenly along " + (axis === "horiz" ? "Horizontal" : "Vertical") + " axis.";
		}
