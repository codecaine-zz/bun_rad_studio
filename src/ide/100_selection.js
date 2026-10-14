
		let lastAnchorIdx = null;

		function getControlsInRange(startIdx, endIdx) {
			if (startIdx === null || startIdx === undefined || startIdx < 0 || startIdx >= formSpec.controls.length) {
				return [endIdx];
			}
			if (endIdx === null || endIdx === undefined || endIdx < 0 || endIdx >= formSpec.controls.length) {
				return [startIdx];
			}

			const ctrlA = formSpec.controls[startIdx];
			const ctrlB = formSpec.controls[endIdx];
			if (!ctrlA || !ctrlB) return [endIdx];

			let rangeSet = new Set();

			// 1. Array index range in formSpec.controls
			const minIdx = Math.min(startIdx, endIdx);
			const maxIdx = Math.max(startIdx, endIdx);
			for (let i = minIdx; i <= maxIdx; i++) {
				rangeSet.add(i);
			}

			// 2. Spatial Y-range & Bounding Box overlap
			const minY = Math.min(ctrlA.y, ctrlB.y);
			const maxY = Math.max(ctrlA.y + (ctrlA.height || 36), ctrlB.y + (ctrlB.height || 36));
			const minX = Math.min(ctrlA.x, ctrlB.x);
			const maxX = Math.max(ctrlA.x + (ctrlA.width || 140), ctrlB.x + (ctrlB.width || 140));

			const isColumnBand = Math.abs(ctrlA.x - ctrlB.x) < 100;

			formSpec.controls.forEach((c, i) => {
				const cTop = c.y;
				const cBottom = c.y + (c.height || 36);
				const cLeft = c.x;
				const cRight = c.x + (c.width || 140);

				const yOverlap = (cBottom >= minY && cTop <= maxY);
				if (yOverlap) {
					if (isColumnBand) {
						rangeSet.add(i);
					} else {
						const xOverlap = (cRight >= minX && cLeft <= maxX);
						if (xOverlap || (cTop >= minY && cBottom <= maxY)) {
							rangeSet.add(i);
						}
					}
				}
			});

			// 3. Spatial reading order (Top-to-Bottom, Left-to-Right)
			let spatialOrdered = formSpec.controls.map((c, i) => ({ idx: i, x: c.x, y: c.y }));
			spatialOrdered.sort((a, b) => {
				const dy = Math.abs(a.y - b.y);
				if (dy > 20) return a.y - b.y;
				return a.x - b.x;
			});

			const posA = spatialOrdered.findIndex(item => item.idx === startIdx);
			const posB = spatialOrdered.findIndex(item => item.idx === endIdx);
			if (posA !== -1 && posB !== -1) {
				const pMin = Math.min(posA, posB);
				const pMax = Math.max(posA, posB);
				for (let p = pMin; p <= pMax; p++) {
					rangeSet.add(spatialOrdered[p].idx);
				}
			}

			// Exclude container panels from Shift range selection so background panels are not selected
			return Array.from(rangeSet).filter(i => formSpec.controls[i] && formSpec.controls[i].control_type !== "panel");
		}

		function getChildControlIndicesOfPanel(panelIdx) {
			const panel = formSpec.controls[panelIdx];
			if (!panel || panel.control_type !== "panel") return [];
			const pLeft = panel.x - 10;
			const pRight = panel.x + (panel.width || 280) + 10;
			const pTop = panel.y - 10;
			const pBottom = panel.y + (panel.height || 120) + 10;

			let childIndices = [];
			formSpec.controls.forEach((c, idx) => {
				if (idx === panelIdx || c.control_type === "panel") return;
				if (c.x >= pLeft && c.x + (c.width || 140) <= pRight &&
					c.y >= pTop && c.y + (c.height || 36) <= pBottom) {
					childIndices.push(idx);
				}
			});
			return childIndices;
		}

		function selectControl(idx, e) {
			if (e) e.stopPropagation();
			const isShift = e && e.shiftKey;
			const isCtrl = e && (e.metaKey || e.ctrlKey);

			if (isShift && !isCtrl) {
				if (lastAnchorIdx === null || lastAnchorIdx === undefined || lastAnchorIdx < 0 || lastAnchorIdx >= formSpec.controls.length) {
					lastAnchorIdx = idx;
					selectedIndices = [idx];
				} else {
					selectedIndices = getControlsInRange(lastAnchorIdx, idx);
				}
			} else if (isShift && isCtrl) {
				if (lastAnchorIdx === null || lastAnchorIdx === undefined || lastAnchorIdx < 0 || lastAnchorIdx >= formSpec.controls.length) {
					lastAnchorIdx = idx;
					if (!selectedIndices.includes(idx)) selectedIndices.push(idx);
				} else {
					const range = getControlsInRange(lastAnchorIdx, idx);
					selectedIndices = Array.from(new Set([...selectedIndices, ...range]));
				}
			} else if (isCtrl) {
				const existingIndex = selectedIndices.indexOf(idx);
				if (existingIndex >= 0) {
					selectedIndices.splice(existingIndex, 1);
				} else {
					selectedIndices.push(idx);
				}
				lastAnchorIdx = idx;
			} else {
				if (formSpec.controls[idx] && formSpec.controls[idx].control_type === "panel") {
					const children = getChildControlIndicesOfPanel(idx);
					selectedIndices = [idx, ...children];
				} else {
					selectedIndices = [idx];
				}
				lastAnchorIdx = idx;
			}
			renderCanvas();
			renderTree();
			populateInspector();
			const statusMsg = document.getElementById("statusMsg");
			if (statusMsg) {
				if (isShift) {
					const anchorName = formSpec.controls[lastAnchorIdx] ? formSpec.controls[lastAnchorIdx].id : "start";
					const targetName = formSpec.controls[idx] ? formSpec.controls[idx].id : "end";
					statusMsg.textContent = "Selected range of " + selectedIndices.length + " control(s) from " + anchorName + " to " + targetName + " (MS Access Shift-Click).";
				} else if (formSpec.controls[idx] && formSpec.controls[idx].control_type === "panel") {
					statusMsg.textContent = "Selected panel " + formSpec.controls[idx].id + " and all " + (selectedIndices.length - 1) + " controls on this panel.";
				}
			}
		}
