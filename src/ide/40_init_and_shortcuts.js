
		function initDesignerApp() {
			makeClickablesKeyboardOperable();
			setupDialogs();
			initPaletteCategories();
			setupSidebarResizers();
			const propTitleEl = document.getElementById("propFormTitle");
			if (propTitleEl) propTitleEl.value = formSpec.title || "";
			bindLivePropertyEditors();
			setupCanvasZoomAndPan();
			setupCustomTooltipEngine();
			updateToolbarSelectionState();

			// Live mouse coordinates in status bar
			const canvasForCoords = document.getElementById('formCanvas');
			if (canvasForCoords) {
				canvasForCoords.addEventListener('mousemove', (e) => {
					const r = canvasForCoords.getBoundingClientRect();
					const x = Math.round((e.clientX - r.left) / canvasScale);
					const y = Math.round((e.clientY - r.top) / canvasScale);
					const el = document.getElementById('statusCoords');
					if (el) el.textContent = 'X: ' + x + ' Y: ' + y;
				});
				canvasForCoords.addEventListener('mouseleave', () => {
					const el = document.getElementById('statusCoords');
					if (el) el.textContent = 'X: — Y: —';
				});
			}
			drawRulers();
			renderCanvas();
			renderCode();
			renderTree();
			offerDraftRestore();

			const inspector = document.querySelector(".inspector-sidebar");
			if (inspector) {
				inspector.addEventListener("mousedown", (e) => e.stopPropagation());
				inspector.addEventListener("click", (e) => e.stopPropagation());
			}

			// Dismiss context menu on click elsewhere
			window.addEventListener("click", () => hideContextMenu());

			// Prevent default browser context menu to avoid accidental reload terminating IDE session
			window.addEventListener("contextmenu", (e) => {
				const isInput = e.target && (e.target.tagName === "INPUT" || e.target.tagName === "TEXTAREA");
				if (!isInput && !e.target.closest("#canvasViewport")) {
					e.preventDefault();
					return false;
				}
			}, { capture: true });

			window.addEventListener("keydown", (e) => {
				if (
					e.key === "F5" ||
					e.code === "F5" ||
					((e.metaKey || e.ctrlKey) && (e.key === "r" || e.key === "R" || e.code === "KeyR"))
				) {
					e.preventDefault();
					e.stopPropagation();
					return false;
				}
			}, { capture: true });

		function setupCustomTooltipEngine() {
			let tip = document.getElementById("globalTooltip");
			if (!tip) {
				tip = document.createElement("div");
				tip.id = "globalTooltip";
				tip.className = "global-tooltip";
				document.body.appendChild(tip);
			}

			const updateTipPosition = (e) => {
				let x = e.clientX + 14;
				let y = e.clientY + 18;
				if (x + tip.offsetWidth > window.innerWidth - 12) {
					x = e.clientX - tip.offsetWidth - 10;
				}
				if (y + tip.offsetHeight > window.innerHeight - 12) {
					y = e.clientY - tip.offsetHeight - 10;
				}
				tip.style.left = x + "px";
				tip.style.top = y + "px";
			};

			document.addEventListener("mouseover", (e) => {
				const target = e.target.closest("[title], [data-tooltip], .btn, .palette-item, .tree-item, .designer-control");
				if (!target) return;

				let text = target.getAttribute("data-tooltip") || target.getAttribute("title");
				if (!text && target.classList.contains("designer-control")) {
					const idx = parseInt(target.dataset.ctrlIndex, 10);
					if (!isNaN(idx) && formSpec.controls[idx]) {
						const c = formSpec.controls[idx];
						text = c.tooltip ? "Hint: " + c.tooltip : (c.id + " (" + c.control_type + ")");
					}
				}

				if (text && text.trim()) {
					tip.textContent = text;
					tip.style.display = "block";
					updateTipPosition(e);
				}
			});

			document.addEventListener("mousemove", (e) => {
				if (tip.style.display === "block") {
					updateTipPosition(e);
				}
			});

			document.addEventListener("mouseout", (e) => {
				const target = e.target.closest("[title], [data-tooltip], .btn, .palette-item, .tree-item, .designer-control");
				if (target) {
					tip.style.display = "none";
				}
			});
		}

			// Keyboard shortcuts engine
			let lastAltTime = 0;
			let isFnPressed = false;

			window.addEventListener("keyup", (e) => {
				if (e.key === "Fn" || e.key === "Globe" || e.code === "Fn" || e.code === "Function") {
					isFnPressed = false;
				}
			});

			window.addEventListener("keydown", (e) => {
				if (e.key === "Fn" || e.key === "Globe" || e.code === "Fn" || e.code === "Function") {
					isFnPressed = true;
				}

				// 1. Double-tap Alt ("alt+alt") within 450ms to close/quit window
				if ((e.key === "Alt" || e.code === "AltLeft" || e.code === "AltRight") && !e.repeat) {
					const now = Date.now();
					if (now - lastAltTime > 50 && now - lastAltTime < 450) {
						lastAltTime = 0;
						e.preventDefault();
						if (window.quitApp) window.quitApp();
						else if (window.closeWindow) window.closeWindow();
						else window.close();
						return;
					}
					lastAltTime = now;
				} else if (e.key !== "Alt" && e.code !== "AltLeft" && e.code !== "AltRight") {
					lastAltTime = 0;
				}

				// 2. Cmd+Q / Cmd+W (macOS) / Ctrl+Q / Ctrl+W / Alt+F4 / Alt+W / Alt+Q (Windows/Linux) to close/quit app
				if (
					((e.metaKey || e.ctrlKey) && (e.key.toLowerCase() === "q" || e.key.toLowerCase() === "w" || e.code === "KeyQ" || e.code === "KeyW")) ||
					(e.altKey && (e.key === "F4" || e.code === "F4" || e.key.toLowerCase() === "w" || e.key.toLowerCase() === "q"))
				) {
					e.preventDefault();
					if (window.quitApp) {
						window.quitApp();
					} else if (window.closeWindow) {
						window.closeWindow();
					} else {
						window.close();
					}
					return;
				}

				if (e.repeat) return;

				const isInput = !!(e.target && (e.target.tagName === "INPUT" || e.target.tagName === "TEXTAREA" || e.target.tagName === "SELECT" || e.target.isContentEditable));
				const isFKey = e.key === "f" || e.key === "F" || e.code === "KeyF" || (typeof e.key === "string" && e.key.toLowerCase() === "f");
				const isFn = isFnPressed || (typeof e.getModifierState === "function" && (e.getModifierState("Fn") || e.getModifierState("FnLock") || e.getModifierState("Symbol")));

				// 3. Fullscreen shortcuts: Fn+F / Globe+F, F/f (when not in input), F11, Cmd+Ctrl+F, Cmd+F, Alt+Enter
				if (
					(!isInput && isFKey && !e.altKey) ||
					(isFn && isFKey) ||
					e.key === "F11" || e.code === "F11" ||
					((e.metaKey || e.ctrlKey) && e.shiftKey && isFKey) ||
					((e.metaKey && e.ctrlKey) && isFKey) ||
					(e.altKey && (e.key === "Enter" || e.code === "Enter"))
				) {
					e.preventDefault();
					e.stopPropagation();
					toggleFullscreen();
					return;
				}

				// 4. Minimize window: Cmd+M, Ctrl+M, Alt+M
				if ((e.metaKey || e.ctrlKey || e.altKey) && (e.key.toLowerCase() === "m" || e.code === "KeyM")) {
					const isInput = e.target && (e.target.tagName === "INPUT" || e.target.tagName === "TEXTAREA");
					if (!isInput) {
						e.preventDefault();
						if (window.minimizeWindow) window.minimizeWindow();
						return;
					}
				}

				// 5. Always-on-top toggle: Cmd+Shift+T, Ctrl+Shift+T, Alt+T
				if (
					((e.metaKey || e.ctrlKey) && e.shiftKey && (e.key.toLowerCase() === "t" || e.code === "KeyT")) ||
					(e.altKey && !e.ctrlKey && !e.metaKey && (e.key.toLowerCase() === "t" || e.code === "KeyT"))
				) {
					const isInput = e.target && (e.target.tagName === "INPUT" || e.target.tagName === "TEXTAREA");
					if (!isInput) {
						e.preventDefault();
						toggleAlwaysOnTop();
						return;
					}
				}

				// 6. Center window: Cmd+Shift+C, Ctrl+Shift+C
				if ((e.metaKey || e.ctrlKey) && e.shiftKey && (e.key.toLowerCase() === "c" || e.code === "KeyC")) {
					const isInput = e.target && (e.target.tagName === "INPUT" || e.target.tagName === "TEXTAREA");
					if (!isInput) {
						e.preventDefault();
						if (window.centerWindow) window.centerWindow();
						else changeWindowPosition("center");
						return;
					}
				}

				// 7. Zoom shortcuts: Cmd/Ctrl + (+/- / 0)
				if (e.metaKey || e.ctrlKey) {
					if (e.key === "=" || e.key === "+" || e.code === "Equal" || e.code === "NumpadAdd") {
						e.preventDefault();
						zoomCanvas(0.1);
						return;
					} else if (e.key === "-" || e.key === "_" || e.code === "Minus" || e.code === "NumpadSubtract") {
						e.preventDefault();
						zoomCanvas(-0.1);
						return;
					} else if (e.key === "0" || e.code === "Digit0" || e.code === "Numpad0") {
						e.preventDefault();
						canvasZoom = 1.0;
						applyCanvasTransform();
						return;
					}
				}

				if (getOpenDialog()) return;
				if (e.key === "Escape") {
					if (placementType) { cancelPlacementMode(); return; }
				}
				if (e.target.tagName === "INPUT" || e.target.tagName === "TEXTAREA" || e.target.tagName === "SELECT") return;

				if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "c") {
					e.preventDefault();
					copySelectedControl();
				} else if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "v") {
					e.preventDefault();
					pasteCopiedControl();
				} else if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "a") {
					e.preventDefault();
					selectAllControls();
				} else if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "z") {
					e.preventDefault();
					if (e.shiftKey) redo(); else undo();
				} else if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "y") {
					e.preventDefault();
					redo();
				} else if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "d") {
					e.preventDefault();
					duplicateSelectedControl();
				} else if (e.key === "Delete" || e.key === "Backspace") {
					e.preventDefault();
					deleteSelectedControl();
				} else if (e.key === "Escape") {
					selectedIndices = [];
					hideContextMenu();
					hideHotkeysModal();
					hideImportModal();
					renderCanvas();
					populateInspector();
				} else if (e.altKey && e.key === "ArrowLeft") {
					e.preventDefault();
					resizeSelectedControlsBy(- (e.shiftKey ? 8 : 1), 0);
				} else if (e.altKey && e.key === "ArrowRight") {
					e.preventDefault();
					resizeSelectedControlsBy(e.shiftKey ? 8 : 1, 0);
				} else if (e.altKey && e.key === "ArrowUp") {
					e.preventDefault();
					resizeSelectedControlsBy(0, - (e.shiftKey ? 8 : 1));
				} else if (e.altKey && e.key === "ArrowDown") {
					e.preventDefault();
					resizeSelectedControlsBy(0, e.shiftKey ? 8 : 1);
				} else if (e.key === "ArrowLeft") {
					e.preventDefault();
					moveSelectedControlsBy(- (e.shiftKey ? 8 : 1), 0);
				} else if (e.key === "ArrowRight") {
					e.preventDefault();
					moveSelectedControlsBy(e.shiftKey ? 8 : 1, 0);
				} else if (e.key === "ArrowUp") {
					e.preventDefault();
					moveSelectedControlsBy(0, - (e.shiftKey ? 8 : 1));
				} else if (e.key === "ArrowDown") {
					e.preventDefault();
					moveSelectedControlsBy(0, e.shiftKey ? 8 : 1);
				}
			});

			setupMarqueeSelection();
		}
