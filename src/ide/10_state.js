		// Global RAD Designer State
		let formSpec = __SPEC_JSON__;
		let selectedIndices = [];
		let clipboardBuffer = [];
		let undoStack = [];
		let redoStack = [];
		let snapToGrid = true;
		let wasMarqueeSelecting = false;
		let draggedType = null;
		let canvasScale = 1.0;
		let placementType = null; // Delphi-style: set when a palette item is selected for placement

		// Pan workspace state
		let isPanning = false;
		let panStartX = 0, panStartY = 0;
		let scrollLeftStart = 0, scrollTopStart = 0;
