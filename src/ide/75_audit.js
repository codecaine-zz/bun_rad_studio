
		function escapeHtml(value) {
			return String(value).replace(/[&<>"']/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[ch]));
		}

		// The Audit report is HTML, and control ids, captions and the form title come from the layout (which may have
		// been imported), so every value is escaped here.
		function collectLayoutIssues(spec) {
			const issues = [];
			const idSet = new Set();
			const winW = spec.width || 840;
			const winH = spec.height || 560;
			const controls = spec.controls || [];
			const nonPanel = [];

			controls.forEach((c, idx) => {
				const id = "<code>" + escapeHtml(c.id) + "</code>";
				if (idSet.has(c.id)) {
					issues.push("❌ <b>Duplicate ID:</b> " + id + " is used by multiple controls.");
				} else {
					idSet.add(c.id);
				}

				if (!(c.width > 0) || !(c.height > 0)) {
					issues.push("❌ <b>Invalid Size:</b> Control " + id + " is " + escapeHtml(c.width) + "x" + escapeHtml(c.height) + "; width and height must be above 0.");
				}

				if (c.x < 0 || c.y < 0) {
					issues.push("⚠️ <b>Out of Bounds:</b> Control " + id + " (" + escapeHtml(c.x) + ", " + escapeHtml(c.y) + ") starts outside the form (negative position).");
				} else if (c.x + c.width > winW || c.y + c.height > winH) {
					issues.push("⚠️ <b>Out of Bounds:</b> Control " + id + " (" + escapeHtml(c.x) + ", " + escapeHtml(c.y) + ") exceeds form bounds (" + escapeHtml(winW) + "x" + escapeHtml(winH) + ").");
				}

				if (!c.text || !String(c.text).trim()) {
					issues.push("ℹ️ <b>Empty Caption:</b> Control " + id + " has an empty text string.");
				}

				if (c.control_type !== "panel" && c.width > 0 && c.height > 0) {
					nonPanel.push({ c, idx });
				}
			});

			if (nonPanel.length > 1) {
				nonPanel.sort((a, b) => (a.c.x - b.c.x) || (a.idx - b.idx));
				const overlapPairs = [];
				for (let i = 0; i < nonPanel.length; i++) {
					const cur = nonPanel[i];
					const rightEdge = cur.c.x + cur.c.width;
					for (let j = i + 1; j < nonPanel.length; j++) {
						const other = nonPanel[j];
						if (other.c.x >= rightEdge) break;
						if (cur.c.y < other.c.y + other.c.height && cur.c.y + cur.c.height > other.c.y) {
							const first = cur.idx < other.idx ? cur : other;
							const second = cur.idx < other.idx ? other : cur;
							overlapPairs.push({ aIdx: first.idx, bIdx: second.idx, aId: first.c.id, bId: second.c.id });
						}
					}
				}
				overlapPairs.sort((p, q) => (p.aIdx - q.aIdx) || (p.bIdx - q.bIdx));
				for (let k = 0; k < overlapPairs.length; k++) {
					const pair = overlapPairs[k];
					issues.push("⚠️ <b>Overlap Detected:</b> <code>" + escapeHtml(pair.aId) + "</code> overlaps with <code>" + escapeHtml(pair.bId) + "</code>.");
				}
			}
			return issues;
		}

		function showDiagnosticsModal() {
			const modal = document.getElementById("diagnosticsModal");
			const summary = document.getElementById("diagnosticsSummary");
			if (!modal || !summary) return;

			const issues = collectLayoutIssues(formSpec);

			if (issues.length === 0) {
				summary.innerHTML = "<div style='color:var(--success); font-weight:bold; font-size:12px;'>🎉 Perfect! No layout collisions or structural issues detected.</div><div style='margin-top:6px; opacity:0.8;'>Form: " + escapeHtml(formSpec.title) + " | Controls: " + formSpec.controls.length + "</div>";
			} else {
				summary.innerHTML = "<div style='color:var(--warning); font-weight:bold; margin-bottom:8px;'>Found " + issues.length + " item(s) requiring attention:</div>" + issues.map(i => "<div style='margin-bottom:4px;'>" + i + "</div>").join("");
			}

			showDialog("diagnosticsModal");
		}

		function hideDiagnosticsModal() {
			hideDialog("diagnosticsModal");
		}

		function autoFixLayoutIssues() {
			saveHistoryState();
			const winW = formSpec.width || 840;
			const winH = formSpec.height || 560;

			const seen = new Set();
			formSpec.controls.forEach((c, idx) => {
				if (seen.has(c.id)) {
					let nextId = c.id + "_fixed" + (idx + 1);
					while (seen.has(nextId)) nextId += "_1";
					c.id = nextId;
				}
				seen.add(c.id);
			});

			formSpec.controls.forEach((c) => {
				if (c.x + c.width > winW - 20) c.x = Math.max(10, winW - c.width - 20);
				if (c.y + c.height > winH - 20) c.y = Math.max(10, winH - c.height - 20);
				if (c.x < 0) c.x = 0;
				if (c.y < 0) c.y = 0;
			});

			renderCanvas();
			renderCode();
			renderTree();
			populateInspector();
			showDiagnosticsModal();
			document.getElementById("statusMsg").textContent = "Auto-fixed layout duplicates and boundaries!";
		}
