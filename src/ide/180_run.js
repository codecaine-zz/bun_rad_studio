
		// Hook into renderCode to keep modern exporters populated
		const origRenderCode = renderCode;
		renderCode = function() {
			origRenderCode();
			const reactEl = document.getElementById("reactPreviewText");
			if (reactEl) reactEl.value = generateReactTailwindCode();
			const vueEl = document.getElementById("vuePreviewText");
			if (vueEl) vueEl.value = generateVueCode();
			const pyEl = document.getElementById("pythonPreviewText");
			if (pyEl) pyEl.value = generatePythonTkinterCode();
			renderNonVisualTray();
		};

		function triggerRunForm() {
			const status = document.getElementById("statusMsg");
			if (!window.runPreview) {
				status.textContent = "Run needs the desktop app: this page has no preview window to open.";
				return;
			}
			status.textContent = "Launching live Bun preview window...";
			Promise.resolve(window.runPreview(JSON.stringify(formSpec))).then((result) => {
				if (result && result.success === false) {
					status.textContent = "Preview failed: " + (result.error || "unknown error");
				} else {
					status.textContent = "Preview window started. If it does not appear, read .rad_preview/preview.log in the folder you started the designer from.";
				}
			}).catch((err) => {
				status.textContent = "Preview failed: " + (err && err.message ? err.message : err);
			});
		}
