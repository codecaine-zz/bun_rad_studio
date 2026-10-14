
		// Event Handler Code Editor Modal Logic
		let activeEditingEvtName = null;

		function showEventEditorModal(evtName) {
			if (selectedIndices.length !== 1) {
				alert("Please select a single control to edit event handlers.");
				return;
			}
			const c = formSpec.controls[selectedIndices[0]];
			activeEditingEvtName = evtName;
			const titleEl = document.getElementById("eventEditorTitle");
			const subtitleEl = document.getElementById("eventEditorSubtitle");
			const textarea = document.getElementById("eventEditorTextarea");

			if (titleEl) titleEl.textContent = "✏️ RAD Event Script Editor: " + evtName;
			if (subtitleEl) subtitleEl.textContent = c.id + "." + evtName;
			if (textarea) textarea.value = (c.event_handlers && c.event_handlers[evtName]) || "";

			showDialog("eventEditorModal");
		}

		function hideEventEditorModal() {
			hideDialog("eventEditorModal");
		}

		function saveEventHandlerCode() {
			if (selectedIndices.length !== 1 || !activeEditingEvtName) return;
			saveHistoryState();
			const c = formSpec.controls[selectedIndices[0]];
			c.event_handlers = c.event_handlers || {};
			const code = document.getElementById("eventEditorTextarea").value;
			c.event_handlers[activeEditingEvtName] = code;

			hideEventEditorModal();
			populateInspector();
			renderCode();
			showCopyToast("Saved & bound event handler " + activeEditingEvtName + " to " + c.id + "!");
		}

		function insertEventCodeSnippet(type) {
			const textarea = document.getElementById("eventEditorTextarea");
			if (!textarea) return;
			let snippet = "";
			if (type === "alert") snippet = "alert('Event triggered successfully!');";
			else if (type === "console") snippet = "console.log('⚡ RAD Event triggered:', this.id, this.value);";
			else if (type === "backend") snippet = "if (window.backendAlert) window.backendAlert('Processing backend action for ' + this.id);";
			else if (type === "setValue") snippet = "document.getElementById('target_ctrl_id').textContent = 'Updated!';";

			textarea.value = (textarea.value ? textarea.value + "\n" : "") + snippet;
		}
