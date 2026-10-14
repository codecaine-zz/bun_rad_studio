
		// Zoom & Pan Workspace Engine
		function setupCanvasZoomAndPan() {
			const viewport = document.getElementById("canvasViewport");

			viewport.addEventListener("wheel", (e) => {
				if (e.ctrlKey || e.metaKey) {
					e.preventDefault();
					const delta = e.deltaY < 0 ? 0.08 : -0.08;
					zoomCanvas(delta);
				}
			}, { passive: false });

			// Spacebar or Middle Click Panning
			window.addEventListener("keydown", (e) => {
				if (e.code === "Space" && e.target === document.body) {
					e.preventDefault();
					viewport.classList.add("panning");
				}
			});

			window.addEventListener("keyup", (e) => {
				if (e.code === "Space") {
					viewport.classList.remove("panning");
				}
			});
		}

		function zoomCanvas(delta) {
			canvasScale = Math.min(2.0, Math.max(0.5, canvasScale + delta));
			const frame = document.getElementById("windowFrame");
			frame.style.transform = "scale(" + canvasScale + ")";
			document.getElementById("statusMsg").textContent = "Canvas Zoom: " + Math.round(canvasScale * 100) + "%";
			drawRulers();
		}

		let isAlwaysOnTopState = false;
		function toggleAlwaysOnTop() {
			isAlwaysOnTopState = !isAlwaysOnTopState;
			if (window.setAlwaysOnTop) {
				window.setAlwaysOnTop(isAlwaysOnTopState).then(res => {
					if (res && res.onTop !== undefined) isAlwaysOnTopState = res.onTop;
					updateStayOnTopUI();
				}).catch(() => updateStayOnTopUI());
			} else {
				updateStayOnTopUI();
			}
		}

		function updateStayOnTopUI() {
			const btn = document.getElementById("stayOnTopBtn");
			if (btn) {
				if (isAlwaysOnTopState) {
					btn.textContent = "📌 Pin: ON";
					btn.classList.add("btn-primary");
					document.getElementById("statusMsg").textContent = "Window Always On Top: ENABLED";
				} else {
					btn.textContent = "📌 Pin: OFF";
					btn.classList.remove("btn-primary");
					document.getElementById("statusMsg").textContent = "Window Always On Top: DISABLED";
				}
			}
		}

		let lastFullscreenTime = 0;
		function toggleFullscreen() {
			const now = Date.now();
			if (now - lastFullscreenTime < 500) return;
			lastFullscreenTime = now;

			if (typeof window.toggleFullscreen === "function" && window.toggleFullscreen !== toggleFullscreen) {
				try { window.toggleFullscreen(); return; } catch (e) {}
			} else if (window.toggleNativeFullscreen) {
				try { window.toggleNativeFullscreen(); return; } catch (e) {}
			}
			if (!document.fullscreenElement && !document.webkitFullscreenElement) {
				if (document.documentElement.requestFullscreen) {
					document.documentElement.requestFullscreen().catch(() => {});
				} else if (document.documentElement.webkitRequestFullscreen) {
					document.documentElement.webkitRequestFullscreen();
				}
			} else {
				if (document.exitFullscreen) {
					document.exitFullscreen().catch(() => {});
				} else if (document.webkitExitFullscreen) {
					document.webkitExitFullscreen();
				}
			}
		}

		function changeWindowPosition(preset) {
			if (window.setWindowPosition) {
				window.setWindowPosition(preset).then(() => {
					document.getElementById("statusMsg").textContent = "Window position moved to: " + preset;
				}).catch(() => {});
			}
		}

		function resetZoom() {
			canvasScale = 1.0;
			const frame = document.getElementById("windowFrame");
			frame.style.transform = "scale(1.0)";
			drawRulers();
		}

		function drawRulers() {
			const rH = document.getElementById("rulerHCanvas");
			const rV = document.getElementById("rulerVCanvas");
			if (!rH || !rV) return;

			rH.width = rH.parentElement.clientWidth;
			rH.height = 20;
			rV.width = 20;
			rV.height = rV.parentElement.clientHeight;

			const ctxH = rH.getContext("2d");
			ctxH.fillStyle = "#090d16";
			ctxH.fillRect(0, 0, rH.width, 20);
			ctxH.strokeStyle = "#334155";
			ctxH.fillStyle = "#94a3b8";
			ctxH.font = "8px sans-serif";

			for (let x = 0; x < rH.width; x += 20 * canvasScale) {
				ctxH.beginPath();
				ctxH.moveTo(x, 12);
				ctxH.lineTo(x, 20);
				ctxH.stroke();
				const val = Math.round(x / canvasScale);
				if (val % 100 === 0) {
					ctxH.fillText(val, x + 2, 10);
				}
			}

			const ctxV = rV.getContext("2d");
			ctxV.fillStyle = "#090d16";
			ctxV.fillRect(0, 0, 20, rV.height);
			ctxV.strokeStyle = "#334155";
			ctxV.fillStyle = "#94a3b8";
			ctxV.font = "8px sans-serif";

			for (let y = 0; y < rV.height; y += 20 * canvasScale) {
				ctxV.beginPath();
				ctxV.moveTo(12, y);
				ctxV.lineTo(20, y);
				ctxV.stroke();
				const val = Math.round(y / canvasScale);
				if (val % 100 === 0) {
					ctxV.fillText(val, 2, y + 8);
				}
			}
		}

		function selectAllControls() {
			selectedIndices = formSpec.controls.map((_, i) => i);
			renderCanvas();
			renderTree();
			populateInspector();
			document.getElementById("statusMsg").textContent = "Selected all " + selectedIndices.length + " controls.";
		}

		if (document.readyState === "complete" || document.readyState === "interactive") {
			initDesignerApp();
		} else {
			document.addEventListener("DOMContentLoaded", initDesignerApp);
		}

		function bindLivePropertyEditors() {
			const propIds = ["propId", "propText", "propTooltip", "propX", "propY", "propWidth", "propHeight", "propFontSize", "propFontColor", "propBgColor", "propHoverBgColor", "propHoverFgColor", "propCursor"];
			propIds.forEach((id) => {
				const el = document.getElementById(id);
				if (!el) return;
				["input", "keyup", "change"].forEach((evt) => {
					el.addEventListener(evt, updateSelectedControl);
				});
			});

			const formTitleEl = document.getElementById("propFormTitle");
			if (formTitleEl) {
				["input", "keyup", "change"].forEach((evt) => {
					formTitleEl.addEventListener(evt, updateFormSpec);
				});
			}
		}
