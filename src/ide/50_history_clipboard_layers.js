
		function saveHistoryState() {
			if (undoStack.length > 40) undoStack.shift();
			undoStack.push(JSON.stringify(formSpec));
			redoStack = [];
			updateUndoRedoButtons();
		}

		function undo() {
			if (undoStack.length === 0) return;
			redoStack.push(JSON.stringify(formSpec));
			const prev = undoStack.pop();
			formSpec = JSON.parse(prev);
			selectedIndices = [];
			renderCanvas();
			renderCode();
			renderTree();
			populateInspector();
			updateUndoRedoButtons();
			document.getElementById("statusMsg").textContent = "Undid last action.";
		}

		function redo() {
			if (redoStack.length === 0) return;
			undoStack.push(JSON.stringify(formSpec));
			const next = redoStack.pop();
			formSpec = JSON.parse(next);
			selectedIndices = [];
			renderCanvas();
			renderCode();
			renderTree();
			populateInspector();
			updateUndoRedoButtons();
			document.getElementById("statusMsg").textContent = "Redid action.";
		}

		function updateUndoRedoButtons() {
			document.getElementById("undoBtn").style.opacity = undoStack.length > 0 ? "1" : "0.4";
			document.getElementById("redoBtn").style.opacity = redoStack.length > 0 ? "1" : "0.4";
		}

		// Clipboard Engine
		function copySelectedControl(btn) {
			if (selectedIndices.length === 0) return;
			clipboardBuffer = selectedIndices.map(idx => JSON.parse(JSON.stringify(formSpec.controls[idx])));
			const msg = "Copied " + clipboardBuffer.length + " control(s) to internal clipboard.";
			document.getElementById("statusMsg").textContent = msg;
			showCopyToast(msg);
			const targetBtn = btn || (typeof event !== 'undefined' && event && event.currentTarget);
			if (targetBtn) flashCopyButton(targetBtn);
			if (typeof updateToolbarSelectionState === "function") updateToolbarSelectionState();
		}

		function pasteCopiedControl() {
			if (clipboardBuffer.length === 0) return;
			saveHistoryState();
			const usedIds = new Set(
				[].concat(formSpec.controls || [], formSpec.non_visual_controls || []).map((c) => c && c.id)
			);
			let newIndices = [];
			clipboardBuffer.forEach(item => {
				let count = formSpec.controls.length + 1;
				const baseType = item.control_type || "button";
				let newId = baseType + "_" + count;
				while (usedIds.has(newId)) {
					count++;
					newId = baseType + "_" + count;
				}
				usedIds.add(newId);
				item.x += 16;
				item.y += 16;
				const copy = JSON.parse(JSON.stringify(item));
				const prevId = item.id;
				copy.id = newId;
				const prevHandlers = (copy.event_handlers && typeof copy.event_handlers === "object") ? copy.event_handlers : null;
				if (prevHandlers && Object.keys(prevHandlers).length > 0) {
					const remapped = {};
					Object.keys(prevHandlers).forEach((evt) => {
						const fn = prevHandlers[evt];
						if (typeof fn === "string" && prevId && fn === "on_" + prevId + "_click") {
							remapped[evt] = "on_" + newId + "_click";
						} else {
							remapped[evt] = fn;
						}
					});
					copy.event_handlers = remapped;
				} else {
					copy.event_handlers = { "onClick": "on_" + newId + "_click" };
				}
				formSpec.controls.push(copy);
				newIndices.push(formSpec.controls.length - 1);
			});
			selectedIndices = newIndices;
			renderCanvas();
			renderCode();
			renderTree();
			populateInspector();
			document.getElementById("statusMsg").textContent = "Pasted " + newIndices.length + " control(s).";
		}

		function duplicateSelectedControl() {
			if (selectedIndices.length === 0) return;
			copySelectedControl();
			pasteCopiedControl();
		}

		// Z-Order Depth Control
		function bringToFront() {
			if (selectedIndices.length === 0) return;
			saveHistoryState();
			const selectedSet = new Set(selectedIndices);
			const rest = [];
			const moving = [];
			formSpec.controls.forEach((ctrl, idx) => {
				if (selectedSet.has(idx)) moving.push(ctrl);
				else rest.push(ctrl);
			});
			formSpec.controls = rest.concat(moving);
			selectedIndices = moving.map((_, i) => rest.length + i);
			renderCanvas();
			renderTree();
			renderCode();
			populateInspector();
			syncSpecToV();
			document.getElementById("statusMsg").textContent = "Brought " + selectedIndices.length + " control(s) to front.";
		}

		function sendToBack() {
			if (selectedIndices.length === 0) return;
			saveHistoryState();
			const selectedSet = new Set(selectedIndices);
			const rest = [];
			const moving = [];
			formSpec.controls.forEach((ctrl, idx) => {
				if (selectedSet.has(idx)) moving.push(ctrl);
				else rest.push(ctrl);
			});
			formSpec.controls = moving.concat(rest);
			selectedIndices = moving.map((_, i) => i);
			renderCanvas();
			renderTree();
			renderCode();
			populateInspector();
			syncSpecToV();
			document.getElementById("statusMsg").textContent = "Sent " + selectedIndices.length + " control(s) to back.";
		}

		function moveForward() {
			if (selectedIndices.length === 0) return;
			saveHistoryState();
			const sortedDesc = Array.from(new Set(selectedIndices)).sort((a, b) => b - a);
			const occupied = new Set(sortedDesc);
			const newIndices = [];
			sortedDesc.forEach(idx => {
				if (idx < formSpec.controls.length - 1 && !occupied.has(idx + 1)) {
					const temp = formSpec.controls[idx];
					formSpec.controls[idx] = formSpec.controls[idx + 1];
					formSpec.controls[idx + 1] = temp;
					occupied.delete(idx);
					occupied.add(idx + 1);
					newIndices.push(idx + 1);
				} else {
					newIndices.push(idx);
				}
			});
			selectedIndices = newIndices.sort((a, b) => a - b);
			renderCanvas();
			renderTree();
			renderCode();
			populateInspector();
			syncSpecToV();
		}

		function moveBackward() {
			if (selectedIndices.length === 0) return;
			saveHistoryState();
			const sortedAsc = Array.from(new Set(selectedIndices)).sort((a, b) => a - b);
			const occupied = new Set(sortedAsc);
			const newIndices = [];
			sortedAsc.forEach(idx => {
				if (idx > 0 && !occupied.has(idx - 1)) {
					const temp = formSpec.controls[idx];
					formSpec.controls[idx] = formSpec.controls[idx - 1];
					formSpec.controls[idx - 1] = temp;
					occupied.delete(idx);
					occupied.add(idx - 1);
					newIndices.push(idx - 1);
				} else {
					newIndices.push(idx);
				}
			});
			selectedIndices = newIndices.sort((a, b) => a - b);
			renderCanvas();
			renderTree();
			renderCode();
			populateInspector();
			syncSpecToV();
		}

		// Custom Context Menu
		function onCanvasContextMenu(e) {
			e.preventDefault();
			const ctrlDiv = e.target.closest ? e.target.closest(".designer-control") : null;
			if (ctrlDiv && ctrlDiv.dataset && ctrlDiv.dataset.ctrlIndex !== undefined) {
				const idx = parseInt(ctrlDiv.dataset.ctrlIndex, 10);
				if (!isNaN(idx) && !selectedIndices.includes(idx)) {
					selectControl(idx, e);
				}
			}
			const menu = document.getElementById("contextMenu");
			if (menu) {
				menu.style.display = "block";
				const menuW = menu.offsetWidth || 200;
				const menuH = menu.offsetHeight || 320;
				const clampedX = Math.max(8, Math.min(e.clientX, window.innerWidth - menuW - 8));
				const clampedY = Math.max(8, Math.min(e.clientY, window.innerHeight - menuH - 8));
				menu.style.left = clampedX + "px";
				menu.style.top = clampedY + "px";
			}
		}

		function hideContextMenu() {
			const menu = document.getElementById("contextMenu");
			if (menu) menu.style.display = "none";
		}
