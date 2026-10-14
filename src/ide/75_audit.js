
		function escapeHtml(value) {
			return String(value).replace(/[&<>"']/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[ch]));
		}

		// The Audit report is HTML, and control ids, captions and the form title come from the layout (which may have
		// been imported), so every value is escaped here.
		function collectLayoutIssues(spec) {
			const issues = [];
			const idMap = {};
			const winW = spec.width || 840;
			const winH = spec.height || 560;
			const controls = spec.controls || [];

			controls.forEach((c, idx) => {
				const id = "<code>" + escapeHtml(c.id) + "</code>";
				if (idMap[c.id]) {
					issues.push("❌ <b>Duplicate ID:</b> " + id + " is used by multiple controls.");
				} else {
					idMap[c.id] = true;
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

				controls.forEach((other, oIdx) => {
					if (idx >= oIdx) return;
					if (c.control_type === "panel" || other.control_type === "panel") return;
					if (c.x < other.x + other.width && c.x + c.width > other.x &&
						c.y < other.y + other.height && c.y + c.height > other.y) {
						issues.push("⚠️ <b>Overlap Detected:</b> " + id + " overlaps with <code>" + escapeHtml(other.id) + "</code>.");
					}
				});
			});
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

			let seen = {};
			formSpec.controls.forEach((c, idx) => {
				if (seen[c.id]) {
					c.id = c.id + "_fixed" + (idx + 1);
				}
				seen[c.id] = true;
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
