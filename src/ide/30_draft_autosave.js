
		// Autosave: the desktop app copies the form to a per-user file shortly after every change. Nothing is saved
		// until the user has answered the restore banner, so the empty form shown at start-up can never overwrite
		// an older draft. In a plain browser the backend functions are missing and everything here does nothing.
		let draftReady = false;
		let draftTimer = null;
		let pendingDraft = null;

		function scheduleDraftSave() {
			if (!draftReady || typeof window.saveDraft !== "function") return;
			clearTimeout(draftTimer);
			draftTimer = setTimeout(() => {
				try {
					Promise.resolve(window.saveDraft(JSON.stringify(formSpec))).catch(() => {});
				} catch (err) { /* autosave must never interrupt editing */ }
			}, 800);
		}

		function parseDraft(draft) {
			try {
				const result = normalizeImportedSpec(JSON.parse(draft.specJson));
				if (result.error || !result.spec.controls || result.spec.controls.length === 0) return null;
				return { spec: result.spec, savedAt: draft.savedAt };
			} catch (err) {
				return null;
			}
		}

		function hideDraftBanner() {
			const banner = document.getElementById("draftBanner");
			if (banner) banner.style.display = "none";
		}

		async function offerDraftRestore() {
			if (typeof window.loadDraft !== "function") return;
			let draft = null;
			try { draft = await window.loadDraft(); } catch (err) { draft = null; }
			pendingDraft = draft ? parseDraft(draft) : null;
			if (!pendingDraft) { draftReady = true; return; }
			const when = pendingDraft.savedAt ? new Date(pendingDraft.savedAt) : null;
			const whenText = when && !isNaN(when.getTime()) ? " saved " + when.toLocaleString() : "";
			const count = pendingDraft.spec.controls.length;
			document.getElementById("draftBannerText").textContent = "Restore your unsaved design \"" + pendingDraft.spec.title + "\" (" + count + " control" + (count === 1 ? "" : "s") + whenText + ")?";
			document.getElementById("draftBanner").style.display = "flex";
			const restoreBtn = document.getElementById("draftRestoreBtn");
			if (restoreBtn) restoreBtn.focus();
		}

		function restoreDraft() {
			if (!pendingDraft) return;
			const scripts = countImportedScripts(pendingDraft.spec);
			if (scripts > 0 && !confirm("This draft contains " + scripts + " event handler script(s). They run as code when you use Run and in exported projects. Restore it only if you saved it yourself.\n\nRestore anyway?")) {
				return;
			}
			saveHistoryState();
			formSpec = pendingDraft.spec;
			selectedIndices = [];
			pendingDraft = null;
			draftReady = true;
			hideDraftBanner();
			const titleEl = document.getElementById("propFormTitle");
			if (titleEl) titleEl.value = formSpec.title || "";
			renderCanvas();
			renderCode();
			renderTree();
			populateInspector();
			document.getElementById("statusMsg").textContent = "Restored your unsaved design \"" + formSpec.title + "\" with " + formSpec.controls.length + " control(s). Undo (Cmd/Ctrl+Z) returns to the blank form.";
		}

		function discardDraft() {
			pendingDraft = null;
			draftReady = true;
			hideDraftBanner();
			try { if (typeof window.clearDraft === "function") Promise.resolve(window.clearDraft()).catch(() => {}); } catch (err) { /* nothing to clear */ }
			document.getElementById("statusMsg").textContent = "Discarded the autosaved draft.";
		}
