
		// Palette items, templates and menu entries are clickable divs. Make them reachable and operable from the
		// keyboard: focusable, announced as buttons, and activated with Enter or Space.
		function makeClickablesKeyboardOperable() {
			document.querySelectorAll("[onclick]").forEach((el) => {
				if (/^(BUTTON|A|INPUT|SELECT|TEXTAREA)$/.test(el.tagName)) return;
				if (!el.hasAttribute("tabindex")) el.setAttribute("tabindex", "0");
				if (!el.hasAttribute("role")) el.setAttribute("role", "button");
				if (!el.hasAttribute("aria-label")) {
					const label = (el.getAttribute("title") || el.textContent || "").trim().replace(/\s+/g, " ");
					if (label) el.setAttribute("aria-label", label.slice(0, 120));
				}
				el.addEventListener("keydown", (e) => {
					if (e.target !== el) return;
					if (e.key === "Enter" || e.key === " ") {
						e.preventDefault();
						el.click();
						// A palette item armed from the keyboard places its control straight away.
						if (el.classList.contains("palette-item") && placementType) placeControlWithKeyboard(placementType);
					}
				});
			});
		}

		// Dialogs: move focus in when one opens, hand it back to the opener when it closes, close on Escape (even
		// from a text box), keep Tab inside it, and keep editing shortcuts from changing the form behind it.
		const DIALOG_IDS = ["eventEditorModal", "importModal", "hotkeysModal", "diagnosticsModal"];
		const dialogOpeners = {};

		function getOpenDialog() {
			for (const id of DIALOG_IDS) {
				const el = document.getElementById(id);
				if (el && el.style.display === "flex") return el;
			}
			return null;
		}

		function dialogFocusables(dialog) {
			return Array.from(dialog.querySelectorAll("button, input, select, textarea, [tabindex]")).filter((el) => {
				if (el.disabled || el.getAttribute("tabindex") === "-1") return false;
				return window.getComputedStyle(el).display !== "none";
			});
		}

		function showDialog(id) {
			const dialog = document.getElementById(id);
			if (!dialog) return;
			if (dialog.style.display !== "flex") dialogOpeners[id] = document.activeElement;
			dialog.style.display = "flex";
			const first = dialog.querySelector("textarea, input, select") || dialogFocusables(dialog)[0];
			if (first && first.focus) first.focus();
		}

		function hideDialog(id) {
			const dialog = document.getElementById(id);
			if (!dialog) return;
			const wasOpen = dialog.style.display === "flex";
			dialog.style.display = "none";
			const opener = dialogOpeners[id];
			delete dialogOpeners[id];
			if (wasOpen && opener && opener.focus && document.contains(opener)) opener.focus();
		}

		function onDialogKeydown(e) {
			const dialog = getOpenDialog();
			if (!dialog) return;
			if (e.key === "Escape") {
				e.preventDefault();
				e.stopPropagation();
				hideDialog(dialog.id);
			} else if (e.key === "Tab") {
				const items = dialogFocusables(dialog);
				if (items.length === 0) { e.preventDefault(); return; }
				const first = items[0], last = items[items.length - 1];
				const inside = dialog.contains(document.activeElement);
				if (!inside) { e.preventDefault(); first.focus(); }
				else if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
				else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
			}
		}

		function setupDialogs() {
			DIALOG_IDS.forEach((id) => {
				const dialog = document.getElementById(id);
				if (!dialog) return;
				dialog.setAttribute("role", "dialog");
				dialog.setAttribute("aria-modal", "true");
				const title = dialog.querySelector(".modal-box span");
				if (title) dialog.setAttribute("aria-label", title.textContent.trim().replace(/\s+/g, " ").slice(0, 120));
			});
			window.addEventListener("keydown", onDialogKeydown, true);
		}
