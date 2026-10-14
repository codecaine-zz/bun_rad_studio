
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
		}

		function pasteCopiedControl() {
			if (clipboardBuffer.length === 0) return;
			saveHistoryState();
			let newIndices = [];
			clipboardBuffer.forEach(item => {
				const count = formSpec.controls.length + 1;
				const newId = item.control_type + "_" + count;
				const copy = JSON.parse(JSON.stringify(item));
				copy.id = newId;
				copy.x += 16;
				copy.y += 16;
				copy.event_handlers = { "onClick": "on_" + newId + "_click" };
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
			selectedIndices.sort((a, b) => a - b);
			const movingCtrls = selectedIndices.map(idx => formSpec.controls[idx]);
			selectedIndices.sort((a, b) => b - a).forEach(idx => formSpec.controls.splice(idx, 1));
			movingCtrls.forEach(ctrl => formSpec.controls.push(ctrl));
			selectedIndices = movingCtrls.map((_, i) => formSpec.controls.length - movingCtrls.length + i);
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
			selectedIndices.sort((a, b) => b - a);
			const movingCtrls = selectedIndices.map(idx => formSpec.controls[idx]);
			selectedIndices.forEach(idx => formSpec.controls.splice(idx, 1));
			movingCtrls.reverse().forEach(ctrl => formSpec.controls.unshift(ctrl));
			selectedIndices = movingCtrls.map((_, i) => i);
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
			selectedIndices.sort((a, b) => b - a);
			let newIndices = [];
			selectedIndices.forEach(idx => {
				if (idx < formSpec.controls.length - 1) {
					const temp = formSpec.controls[idx];
					formSpec.controls[idx] = formSpec.controls[idx + 1];
					formSpec.controls[idx + 1] = temp;
					newIndices.push(idx + 1);
				} else {
					newIndices.push(idx);
				}
			});
			selectedIndices = newIndices;
			renderCanvas();
			renderTree();
			renderCode();
			populateInspector();
			syncSpecToV();
		}

		function moveBackward() {
			if (selectedIndices.length === 0) return;
			saveHistoryState();
			selectedIndices.sort((a, b) => a - b);
			let newIndices = [];
			selectedIndices.forEach(idx => {
				if (idx > 0) {
					const temp = formSpec.controls[idx];
					formSpec.controls[idx] = formSpec.controls[idx - 1];
					formSpec.controls[idx - 1] = temp;
					newIndices.push(idx - 1);
				} else {
					newIndices.push(idx);
				}
			});
			selectedIndices = newIndices;
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
				menu.style.left = e.clientX + "px";
				menu.style.top = e.clientY + "px";
				menu.style.display = "block";
			}
		}

		function hideContextMenu() {
			const menu = document.getElementById("contextMenu");
			if (menu) menu.style.display = "none";
		}
