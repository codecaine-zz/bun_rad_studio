// Microsoft Access Visual Query Designer & QBE Engine (PostgreSQL Pro)

function quoteSqlIdentifier(value) {
  return '"' + String(value).replace(/"/g, '""') + '"';
}

function formatAccessCriterion(qualifiedField, criterionStr) {
  if (!criterionStr || !String(criterionStr).trim()) return "";
  const trimmed = String(criterionStr).trim();
  // Disallow semicolons and SQL comment markers to prevent statement injection
  if (trimmed.includes(";") || trimmed.includes("--") || trimmed.includes("/*")) {
    return qualifiedField + " = '" + trimmed.replace(/'/g, "''") + "'";
  }
  if (/^(=|<>|!=|>|<|>=|<=|LIKE|NOT LIKE|ILIKE|NOT ILIKE|IN|NOT IN|BETWEEN|IS NULL|IS NOT NULL)/i.test(trimmed)) {
    return qualifiedField + " " + trimmed;
  }
  if (/^['"].*['"]$/.test(trimmed)) {
    return qualifiedField + " = " + trimmed;
  }
  if (!isNaN(Number(trimmed)) && trimmed !== "") {
    return qualifiedField + " = " + trimmed;
  }
  return qualifiedField + " = '" + trimmed.replace(/'/g, "''") + "'";
}

function getSingularCandidate(tableName) {
  if (!tableName) return "";
  const lower = tableName.toLowerCase();
  if (lower.endsWith("ies")) return lower.slice(0, -3) + "y";
  if (lower.endsWith("es")) return lower.slice(0, -2);
  if (lower.endsWith("s")) return lower.slice(0, -1);
  return lower;
}

function getEntityMeta(name) {
  if (!currentSchema) return null;
  return (currentSchema.tables || []).find(t => t.name === name) || (currentSchema.views || []).find(v => v.name === name) || null;
}

function formatPgTypeShort(rawType) {
  if (!rawType) return 'ANY';
  let t = String(rawType).trim();
  const lower = t.toLowerCase();
  if (lower.startsWith('timestamp with time zone')) return lower.replace('timestamp with time zone', 'timestamptz');
  if (lower.startsWith('timestamp without time zone')) return lower.replace('timestamp without time zone', 'timestamp');
  if (lower.startsWith('time with time zone')) return lower.replace('time with time zone', 'timetz');
  if (lower.startsWith('time without time zone')) return lower.replace('time without time zone', 'time');
  if (lower.startsWith('character varying')) return lower.replace('character varying', 'varchar');
  if (lower === 'double precision') return 'float8';
  return t;
}

function findAllDesignerJoins(leftTableName, rightTableName) {
  if (!currentSchema || !leftTableName || !rightTableName || leftTableName === rightTableName) return [];
  const leftMeta = getEntityMeta(leftTableName);
  const rightMeta = getEntityMeta(rightTableName);
  if (!leftMeta || !rightMeta) return [];

  const results = [];
  const seen = new Set();
  function addCandidate(lT, lF, rT, rF, type, conf) {
    const id = lT + "." + lF + "<->" + rT + "." + rF;
    const revId = rT + "." + rF + "<->" + lT + "." + lF;
    if (seen.has(id) || seen.has(revId)) return;
    seen.add(id);
    seen.add(revId);
    results.push({
      leftTable: lT,
      leftField: lF,
      rightTable: rT,
      rightField: rF,
      type: type || "INNER",
      confidence: conf || 50,
    });
  }

  // 1. Explicit foreign key from leftMeta to rightMeta
  (leftMeta.foreignKeys || []).forEach(fk => {
    if (fk.table === rightTableName) {
      addCandidate(leftTableName, fk.from, rightTableName, fk.to || "id", "INNER", 100);
    }
  });

  // 2. Reverse foreign key from rightMeta to leftMeta
  (rightMeta.foreignKeys || []).forEach(fk => {
    if (fk.table === leftTableName) {
      addCandidate(leftTableName, fk.to || "id", rightTableName, fk.from, "INNER", 100);
    }
  });

  // 3. Conventional naming: leftTable has singular(rightTable)_id or rightTable_id column
  const rightSingular = getSingularCandidate(rightTableName).toLowerCase();
  const rightLower = rightTableName.toLowerCase();
  (leftMeta.columns || []).forEach(c => {
    const colLower = c.name.toLowerCase();
    if (colLower === (rightSingular + "_id") || colLower === (rightLower + "_id") || colLower === (rightSingular + "id")) {
      const targetPk = (rightMeta.columns || []).find(rc => rc.pk)?.name || "id";
      addCandidate(leftTableName, c.name, rightTableName, targetPk, "INNER", 90);
    }
  });

  // Conventional naming: rightTable has singular(leftTable)_id or leftTable_id column
  const leftSingular = getSingularCandidate(leftTableName).toLowerCase();
  const leftLower = leftTableName.toLowerCase();
  (rightMeta.columns || []).forEach(c => {
    const colLower = c.name.toLowerCase();
    if (colLower === (leftSingular + "_id") || colLower === (leftLower + "_id") || colLower === (leftSingular + "id")) {
      const targetPk = (leftMeta.columns || []).find(lc => lc.pk)?.name || "id";
      addCandidate(leftTableName, targetPk, rightTableName, c.name, "INNER", 90);
    }
  });

  // 4. Domain specific matching keys (excluding generic 'id' and standard audit fields)
  const leftFields = (leftMeta.columns || []).map(c => c.name);
  const rightFieldNames = new Set((rightMeta.columns || []).map(c => c.name));
  const ignoredCols = new Set(["id", "created_at", "updated_at", "deleted_at", "status", "active", "type", "description", "name", "notes", "data", "metadata"]);
  leftFields.forEach(c => {
    const lower = c.toLowerCase();
    if (rightFieldNames.has(c) && !ignoredCols.has(lower) && (lower.endsWith("_id") || lower.endsWith("_code") || lower.endsWith("_no") || lower.endsWith("_num") || lower.endsWith("_key"))) {
      addCandidate(leftTableName, c, rightTableName, c, "INNER", 80);
    }
  });

  return results.sort((a, b) => b.confidence - a.confidence);
}

function suggestDesignerJoin(leftTableName, rightTableName) {
  const all = findAllDesignerJoins(leftTableName, rightTableName);
  if (all && all.length > 0) return all[0];
  if (!currentSchema) return null;
  const leftMeta = getEntityMeta(leftTableName);
  const rightMeta = getEntityMeta(rightTableName);
  if (!leftMeta || !rightMeta) return null;
  const lf = (leftMeta.columns && leftMeta.columns[0]) ? leftMeta.columns[0].name : "id";
  const rf = (rightMeta.columns && rightMeta.columns[0]) ? rightMeta.columns[0].name : "id";
  return {
    leftTable: leftTableName,
    rightTable: rightTableName,
    leftField: lf,
    rightField: rf,
    type: "INNER",
    confidence: 10,
  };
}

function buildDesignerJoinPairs() {
  if (!currentSchema || !queryDesignerState.selectedTables || !queryDesignerState.selectedTables.length) return [];
  const tables = queryDesignerState.selectedTables;
  if (tables.length === 1) return [];

  // 1. Collect all pairwise relationship candidates with confidence scores
  const candidateEdges = [];
  for (let i = 0; i < tables.length; i++) {
    for (let j = i + 1; j < tables.length; j++) {
      const t1 = tables[i];
      const t2 = tables[j];
      const sugg = suggestDesignerJoin(t1, t2);
      if (sugg) {
        candidateEdges.push({
          key: t1 + "." + sugg.leftField + "->" + t2 + "." + sugg.rightField,
          leftTable: sugg.leftTable,
          leftField: sugg.leftField,
          rightTable: sugg.rightTable,
          rightField: sugg.rightField,
          type: sugg.type || "INNER",
          confidence: sugg.confidence || 50,
        });
      }
    }
  }

  // 2. Minimum Spanning Tree (Prim's Algorithm) starting from the primary table
  const connected = new Set([tables[0]]);
  const unvisited = new Set(tables.slice(1));
  const treeEdges = [];

  while (unvisited.size > 0) {
    let bestEdge = null;
    let highestConfidence = -1;

    for (const edge of candidateEdges) {
      const leftIn = connected.has(edge.leftTable);
      const rightIn = connected.has(edge.rightTable);
      if ((leftIn && !rightIn && unvisited.has(edge.rightTable)) ||
          (rightIn && !leftIn && unvisited.has(edge.leftTable))) {
        if (edge.confidence > highestConfidence) {
          highestConfidence = edge.confidence;
          bestEdge = edge;
        }
      }
    }

    if (bestEdge) {
      treeEdges.push(bestEdge);
      connected.add(bestEdge.leftTable);
      connected.add(bestEdge.rightTable);
      unvisited.delete(bestEdge.leftTable);
      unvisited.delete(bestEdge.rightTable);
    } else {
      // If a table is an isolated island, connect it to tables[0] via fallback
      const island = unvisited.values().next().value;
      const fallback = suggestDesignerJoin(tables[0], island) || {
        leftTable: tables[0],
        rightTable: island,
        leftField: "id",
        rightField: "id",
        type: "INNER",
      };
      treeEdges.push({
        key: tables[0] + "." + fallback.leftField + "->" + island + "." + fallback.rightField,
        leftTable: fallback.leftTable,
        leftField: fallback.leftField,
        rightTable: fallback.rightTable,
        rightField: fallback.rightField,
        type: fallback.type || "INNER",
        confidence: 10,
      });
      connected.add(island);
      unvisited.delete(island);
    }
  }

  return treeEdges;
}

function ensureQueryDesignerState() {
  if (!currentSchema || !currentSchema.tables || !currentSchema.tables.length) {
    queryDesignerState.selectedTables = [];
    queryDesignerState.joins = [];
    queryDesignerState.columns = [];
    return;
  }
  const tableNames = (currentSchema.tables || []).map(t => t.name).concat((currentSchema.views || []).map(v => v.name));
  if (!Array.isArray(queryDesignerState.selectedTables) || !queryDesignerState.selectedTables.length) {
    const defaultTable = currentSchema.tables[0].name;
    queryDesignerState.selectedTables = [defaultTable];
  }
  const selectedTables = (queryDesignerState.selectedTables || []).filter(name => tableNames.includes(name));
  if (selectedTables.length === 0 && currentSchema.tables.length > 0) {
    selectedTables.push(currentSchema.tables[0].name);
  }
  queryDesignerState.selectedTables = selectedTables;

  if (queryDesignerState.joins === undefined || queryDesignerState.joins === null) {
    queryDesignerState.joins = buildDesignerJoinPairs();
  } else {
    queryDesignerState.joins = queryDesignerState.joins.filter(j => selectedTables.includes(j.leftTable) && selectedTables.includes(j.rightTable));
  }

  if (!Array.isArray(queryDesignerState.columns)) {
    queryDesignerState.columns = [];
  } else {
    queryDesignerState.columns = queryDesignerState.columns.filter(col => selectedTables.includes(col.table));
  }

  if (!queryDesignerState.columns.length && selectedTables.length > 0) {
    const firstTable = selectedTables[0];
    const meta = getEntityMeta(firstTable);
    if (meta && meta.columns && meta.columns.length) {
      meta.columns.slice(0, 5).forEach(c => {
        queryDesignerState.columns.push({
          id: "col-" + Date.now() + "-" + Math.random().toString(16).slice(2),
          table: firstTable,
          field: c.name,
          alias: "",
          total: queryDesignerState.showTotals ? "GroupBy" : "None",
          sort: "",
          show: true,
          criteria: "",
          or1: "",
          or2: "",
        });
      });
    }
  }

  if (!queryDesignerState.savedQueries) {
    queryDesignerState.savedQueries = loadSavedQueriesFromStorage();
  }
  if (!queryDesignerState.tablePositions) {
    queryDesignerState.tablePositions = {};
  }
  selectedTables.forEach((t, i) => {
    if (!queryDesignerState.tablePositions[t]) {
      queryDesignerState.tablePositions[t] = {
        x: 20 + (i % 4) * 280,
        y: 15 + Math.floor(i / 4) * 240,
      };
    }
  });
}

function setDesignerActiveView(view) {
  queryDesignerState.activeView = view;
  if (view === "datasheet" && (!queryDesignerState.datasheet || queryDesignerState.datasheetLoading)) {
    runDesignerQuery();
  } else {
    renderQueryDesigner();
  }
}

function toggleDesignerTotals() {
  queryDesignerState.showTotals = !queryDesignerState.showTotals;
  (queryDesignerState.columns || []).forEach(col => {
    if (queryDesignerState.showTotals) {
      if (!col.total || col.total === "None") col.total = "GroupBy";
    } else {
      col.total = "None";
    }
  });
  renderQueryDesigner();
}

function toggleDesignerDistinct() {
  queryDesignerState.distinct = !queryDesignerState.distinct;
  renderQueryDesigner();
}

function setDesignerTopLimit(limit) {
  queryDesignerState.topLimit = Number(limit) || 0;
  renderQueryDesigner();
}

function addDesignerTableFromPicker() {
  const picker = document.getElementById("designerTablePicker");
  if (picker && picker.value) {
    addDesignerTable(picker.value);
    picker.value = "";
  }
}

function addDesignerTable(tableName) {
  if (!tableName || queryDesignerState.selectedTables.includes(tableName)) return;
  queryDesignerState.selectedTables.push(tableName);
  if (!queryDesignerState.joins) queryDesignerState.joins = [];

  const existingTables = queryDesignerState.selectedTables.filter(t => t !== tableName);
  const addedJoins = [];

  for (const target of existingTables) {
    const found = findAllDesignerJoins(target, tableName);
    for (const rel of found) {
      const alreadyExists = queryDesignerState.joins.some(j =>
        (j.leftTable === rel.leftTable && j.rightTable === rel.rightTable && j.leftField === rel.leftField && j.rightField === rel.rightField) ||
        (j.leftTable === rel.rightTable && j.rightTable === rel.leftTable && j.leftField === rel.rightField && j.rightField === rel.leftField)
      );
      if (!alreadyExists) {
        const newJoin = {
          key: rel.leftTable + "." + rel.leftField + "->" + rel.rightTable + "." + rel.rightField + "-" + Date.now() + Math.random().toString(16).slice(2, 6),
          ...rel,
        };
        queryDesignerState.joins.push(newJoin);
        addedJoins.push(newJoin);
      }
    }
  }

  if (!queryDesignerState.tablePositions) queryDesignerState.tablePositions = {};
  const count = queryDesignerState.selectedTables.length - 1;
  queryDesignerState.tablePositions[tableName] = {
    x: 20 + (count % 4) * 280,
    y: 15 + Math.floor(count / 4) * 240,
  };

  renderQueryDesigner();
  if (addedJoins.length > 0) {
    showToast("Added table '" + tableName + "' (auto-connected " + addedJoins.length + " relationship" + (addedJoins.length > 1 ? "s" : "") + ")");
  } else {
    showToast("Added table '" + tableName + "' to visual canvas");
  }
}

function removeDesignerTable(tableName) {
  queryDesignerState.selectedTables = queryDesignerState.selectedTables.filter(t => t !== tableName);
  queryDesignerState.joins = (queryDesignerState.joins || []).filter(j => j.leftTable !== tableName && j.rightTable !== tableName);
  queryDesignerState.columns = (queryDesignerState.columns || []).filter(col => col.table !== tableName);
  renderQueryDesigner();
}

function autoJoinDesignerTables() {
  if (!currentSchema || !queryDesignerState.selectedTables || queryDesignerState.selectedTables.length < 2) {
    showToast("Add 2 or more tables to auto-detect joins");
    return;
  }
  const tables = queryDesignerState.selectedTables;
  let newCount = 0;
  if (!queryDesignerState.joins) queryDesignerState.joins = [];

  for (let i = 0; i < tables.length; i++) {
    for (let j = i + 1; j < tables.length; j++) {
      const t1 = tables[i];
      const t2 = tables[j];
      const rels = findAllDesignerJoins(t1, t2);
      for (const rel of rels) {
        const alreadyExists = queryDesignerState.joins.some(j =>
          (j.leftTable === rel.leftTable && j.rightTable === rel.rightTable && j.leftField === rel.leftField && j.rightField === rel.rightField) ||
          (j.leftTable === rel.rightTable && j.rightTable === rel.leftTable && j.leftField === rel.rightField && j.rightField === rel.leftField)
        );
        if (!alreadyExists) {
          queryDesignerState.joins.push({
            key: rel.leftTable + "." + rel.leftField + "->" + rel.rightTable + "." + rel.rightField + "-" + Date.now() + Math.random().toString(16).slice(2, 6),
            ...rel,
          });
          newCount++;
        }
      }
    }
  }

  if (queryDesignerState.joins.length === 0 && tables.length > 1) {
    queryDesignerState.joins = buildDesignerJoinPairs();
    newCount = queryDesignerState.joins.length;
  }

  renderQueryDesigner();
  if (newCount > 0) {
    showToast("⚡ Auto-detected & linked " + newCount + " relationship" + (newCount > 1 ? "s" : "") + " across " + tables.length + " tables");
  } else {
    showToast("All schema relationships across " + tables.length + " tables are already linked (" + queryDesignerState.joins.length + " active joins)");
  }
}

let currentEditingJoinKey = null;
let activeDraggingTable = null;
let dragStartX = 0;
let dragStartY = 0;
let cardStartLeft = 0;
let cardStartTop = 0;

function openJoinPropertiesModal(joinKey, preferredLeft, preferredRight, preferredLeftField, preferredRightField) {
  const modal = document.getElementById("accessJoinPropertiesModal");
  if (!modal) return;
  ensureQueryDesignerState();

  const selectedTables = queryDesignerState.selectedTables || [];
  if (selectedTables.length < 2) {
    showToast("Add at least 2 tables to the Query Designer first");
    return;
  }

  currentEditingJoinKey = joinKey || null;
  let leftTable = preferredLeft || selectedTables[0];
  let rightTable = preferredRight || selectedTables[1] || selectedTables[0];
  let leftField = preferredLeftField || "";
  let rightField = preferredRightField || "";
  let joinType = "INNER";

  if (currentEditingJoinKey) {
    const existing = (queryDesignerState.joins || []).find(j => j.key === currentEditingJoinKey);
    if (existing) {
      leftTable = existing.leftTable;
      rightTable = existing.rightTable;
      leftField = existing.leftField;
      rightField = existing.rightField;
      joinType = (existing.type || "INNER").toUpperCase();
    }
  }

  const leftSelect = document.getElementById("jpLeftTable");
  const rightSelect = document.getElementById("jpRightTable");
  if (leftSelect && rightSelect) {
    leftSelect.innerHTML = selectedTables.map(t => `<option value="${escapeHtml(t)}" ${t === leftTable ? 'selected' : ''}>${escapeHtml(t)}</option>`).join('');
    rightSelect.innerHTML = selectedTables.map(t => `<option value="${escapeHtml(t)}" ${t === rightTable ? 'selected' : ''}>${escapeHtml(t)}</option>`).join('');
  }

  onJoinPropTableChange("left", leftField);
  onJoinPropTableChange("right", rightField);

  selectJoinPropType(joinType);

  const delBtn = document.getElementById("btnDeleteJoinProp");
  if (delBtn) delBtn.style.display = currentEditingJoinKey ? "inline-flex" : "none";

  modal.classList.add("open");
}

function closeJoinPropertiesModal() {
  const modal = document.getElementById("accessJoinPropertiesModal");
  if (modal) modal.classList.remove("open");
  currentEditingJoinKey = null;
}

function onJoinPropTableChange(side, defaultField) {
  const tableSelect = document.getElementById(side === "left" ? "jpLeftTable" : "jpRightTable");
  const fieldSelect = document.getElementById(side === "left" ? "jpLeftField" : "jpRightField");
  if (!tableSelect || !fieldSelect) return;

  const tableName = tableSelect.value;
  const meta = getEntityMeta(tableName);
  const cols = meta && meta.columns ? meta.columns.map(c => c.name) : ["id"];

  let selectedCol = defaultField && cols.includes(defaultField) ? defaultField : "";
  if (!selectedCol) {
    const pkCol = meta && meta.columns ? meta.columns.find(c => c.pk) : null;
    selectedCol = pkCol ? pkCol.name : cols[0];
  }

  fieldSelect.innerHTML = cols.map(c => `<option value="${escapeHtml(c)}" ${c === selectedCol ? 'selected' : ''}>${escapeHtml(c)}</option>`).join('');

  updateJoinPropLabels();
  updateJoinPropVennDiagram(getSelectedJoinPropType(), document.getElementById("jpLeftTable")?.value || "Left", document.getElementById("jpRightTable")?.value || "Right");
  updateJoinPropPreview();
}

function updateJoinPropLabels() {
  const lt = document.getElementById("jpLeftTable")?.value || "Left";
  const rt = document.getElementById("jpRightTable")?.value || "Right";
  document.querySelectorAll(".jp-left-name").forEach(el => el.textContent = lt);
  document.querySelectorAll(".jp-right-name").forEach(el => el.textContent = rt);
}

function swapJoinPropDirection() {
  const leftTableSel = document.getElementById("jpLeftTable");
  const rightTableSel = document.getElementById("jpRightTable");
  const leftFieldSel = document.getElementById("jpLeftField");
  const rightFieldSel = document.getElementById("jpRightField");
  if (!leftTableSel || !rightTableSel || !leftFieldSel || !rightFieldSel) return;

  const oldLT = leftTableSel.value;
  const oldRT = rightTableSel.value;
  const oldLF = leftFieldSel.value;
  const oldRF = rightFieldSel.value;

  leftTableSel.value = oldRT;
  rightTableSel.value = oldLT;

  onJoinPropTableChange("left", oldRF);
  onJoinPropTableChange("right", oldLF);

  const curType = getSelectedJoinPropType();
  if (curType === "LEFT") selectJoinPropType("RIGHT");
  else if (curType === "RIGHT") selectJoinPropType("LEFT");
  else selectJoinPropType(curType);
}

function getSelectedJoinPropType() {
  const radio = document.querySelector('input[name="accessJoinType"]:checked');
  return radio ? radio.value.toUpperCase() : "INNER";
}

function selectJoinPropType(type) {
  const t = (type || "INNER").toUpperCase();
  const radio = document.querySelector(`input[name="accessJoinType"][value="${t}"]`);
  if (radio) radio.checked = true;

  document.querySelectorAll(".access-join-radio-card").forEach(c => c.classList.remove("selected"));
  const card = document.getElementById("cardJp" + (t === "FULL" ? "Full" : (t.charAt(0) + t.slice(1).toLowerCase())));
  if (card) card.classList.add("selected");

  const lt = document.getElementById("jpLeftTable")?.value || "Left";
  const rt = document.getElementById("jpRightTable")?.value || "Right";
  updateJoinPropVennDiagram(t, lt, rt);
  updateJoinPropPreview();
}

function onJoinPropTypeChange(type) {
  selectJoinPropType(type);
}

function updateJoinPropVennDiagram(type, leftName, rightName) {
  const svg = document.getElementById("jpVennSvg");
  const badge = document.getElementById("jpVennBadge");
  if (!svg) return;

  const t = (type || "INNER").toUpperCase();
  const truncL = leftName.length > 9 ? leftName.slice(0, 8) + "…" : leftName;
  const truncR = rightName.length > 9 ? rightName.slice(0, 8) + "…" : rightName;

  let leftFill = "rgba(255,255,255,0.06)";
  let rightFill = "rgba(255,255,255,0.06)";
  let lensFill = "rgba(255,255,255,0.06)";
  let badgeText = "INNER JOIN (Matching records)";
  let badgeColor = "var(--cyan)";

  if (t === "INNER") {
    lensFill = "#38bdf8";
    badgeText = "INNER JOIN (=)";
    badgeColor = "#38bdf8";
  } else if (t === "LEFT") {
    leftFill = "#10b981";
    lensFill = "#10b981";
    badgeText = "LEFT OUTER (All " + truncL + ")";
    badgeColor = "#10b981";
  } else if (t === "RIGHT") {
    rightFill = "#f59e0b";
    lensFill = "#f59e0b";
    badgeText = "RIGHT OUTER (All " + truncR + ")";
    badgeColor = "#f59e0b";
  } else if (t === "FULL" || t === "FULL OUTER") {
    leftFill = "#a855f7";
    lensFill = "#a855f7";
    rightFill = "#a855f7";
    badgeText = "FULL OUTER (All from Both - Native Postgres)";
    badgeColor = "#a855f7";
  } else if (t === "CROSS") {
    leftFill = "#ec4899";
    lensFill = "#ec4899";
    rightFill = "#ec4899";
    badgeText = "CROSS JOIN (Cartesian product)";
    badgeColor = "#ec4899";
  }

  if (badge) {
    badge.textContent = badgeText;
    badge.style.color = badgeColor;
  }

  svg.innerHTML = `
    <rect x="0" y="0" width="160" height="90" fill="none" />
    <!-- Left Crescent -->
    <path d="M 80,25 A 32 32 0 0 1 80,65 A 32 32 0 1 1 80,25 Z" fill="${leftFill}" fill-opacity="0.8" stroke="rgba(255,255,255,0.3)" stroke-width="1.5" />
    <!-- Right Crescent -->
    <path d="M 80,25 A 32 32 0 0 0 80,65 A 32 32 0 1 0 80,25 Z" fill="${rightFill}" fill-opacity="0.8" stroke="rgba(255,255,255,0.3)" stroke-width="1.5" />
    <!-- Intersection Lens -->
    <path d="M 80,25 A 32 32 0 0 1 80,65 A 32 32 0 0 1 80,25 Z" fill="${lensFill}" fill-opacity="0.9" stroke="${badgeColor}" stroke-width="2" />
    <!-- Table Labels -->
    <text x="48" y="14" fill="#94a3b8" font-size="9" font-weight="700" text-anchor="middle" font-family="sans-serif">${escapeHtml(truncL)}</text>
    <text x="112" y="14" fill="#94a3b8" font-size="9" font-weight="700" text-anchor="middle" font-family="sans-serif">${escapeHtml(truncR)}</text>
  `;
}

function updateJoinPropPreview() {
  const box = document.getElementById("jpSqlSnippet");
  if (!box) return;
  const lt = document.getElementById("jpLeftTable")?.value || "left_table";
  const rt = document.getElementById("jpRightTable")?.value || "right_table";
  const lf = document.getElementById("jpLeftField")?.value || "id";
  const rf = document.getElementById("jpRightField")?.value || "id";
  const type = getSelectedJoinPropType();

  let sql = "";
  if (type === "CROSS") {
    sql = "FROM " + quoteSqlIdentifier(lt) + " CROSS JOIN " + quoteSqlIdentifier(rt);
  } else {
    const effType = (type === "FULL" || type === "FULL OUTER") ? "FULL OUTER" : type;
    sql = "FROM " + quoteSqlIdentifier(lt) + " " + effType + " JOIN " + quoteSqlIdentifier(rt) + "\n  ON " + quoteSqlIdentifier(lt) + "." + quoteSqlIdentifier(lf) + " = " + quoteSqlIdentifier(rt) + "." + quoteSqlIdentifier(rf);
  }
  box.textContent = sql;
}

function saveJoinProperties() {
  const lt = document.getElementById("jpLeftTable")?.value;
  const rt = document.getElementById("jpRightTable")?.value;
  const lf = document.getElementById("jpLeftField")?.value;
  const rf = document.getElementById("jpRightField")?.value;
  const type = getSelectedJoinPropType();

  if (!lt || !rt || !lf || !rf) {
    showToast("Select tables and fields for both sides");
    return;
  }
  if (lt === rt && lf === rf) {
    showToast("Cannot join a field to itself");
    return;
  }

  if (!queryDesignerState.joins) queryDesignerState.joins = [];

  if (currentEditingJoinKey) {
    const idx = queryDesignerState.joins.findIndex(j => j.key === currentEditingJoinKey);
    if (idx !== -1) {
      queryDesignerState.joins[idx] = {
        key: lt + "." + lf + "->" + rt + "." + rf + "-" + Date.now(),
        leftTable: lt,
        leftField: lf,
        rightTable: rt,
        rightField: rf,
        type: type,
      };
    }
  } else {
    queryDesignerState.joins.push({
      key: lt + "." + lf + "->" + rt + "." + rf + "-" + Date.now(),
      leftTable: lt,
      leftField: lf,
      rightTable: rt,
      rightField: rf,
      type: type,
    });
  }

  closeJoinPropertiesModal();
  renderQueryDesigner();
  showToast("Updated relationship: " + lt + " ↔ " + rt + " (" + type + " JOIN)");
}

function deleteCurrentJoinFromProperties() {
  if (!currentEditingJoinKey) {
    closeJoinPropertiesModal();
    return;
  }
  queryDesignerState.joins = (queryDesignerState.joins || []).filter(j => j.key !== currentEditingJoinKey);
  closeJoinPropertiesModal();
  renderQueryDesigner();
  showToast("Deleted relationship");
}

function onDesignerFieldDragStart(e, table, field) {
  if (e.dataTransfer) {
    e.dataTransfer.setData("text/plain", JSON.stringify({ table, field }));
    e.dataTransfer.effectAllowed = "link";
  }
}

function onDesignerFieldDragOver(e) {
  e.preventDefault();
  if (e.dataTransfer) {
    e.dataTransfer.dropEffect = "link";
  }
}

function onDesignerFieldDragEnter(e, table, field) {
  e.preventDefault();
  const el = document.getElementById("qbeFieldRow_" + table + "_" + field);
  if (el) el.classList.add("qbe-field-drop-target");
}

function onDesignerFieldDragLeave(e) {
  const el = e.currentTarget;
  if (el) el.classList.remove("qbe-field-drop-target");
}

function onDesignerFieldDrop(e, targetTable, targetField) {
  e.preventDefault();
  const targetEl = document.getElementById("qbeFieldRow_" + targetTable + "_" + targetField);
  if (targetEl) targetEl.classList.remove("qbe-field-drop-target");

  try {
    const raw = e.dataTransfer.getData("text/plain");
    if (!raw) return;
    const source = JSON.parse(raw);
    if (!source || !source.table || !source.field) return;

    if (source.table === targetTable) {
      showToast("Cannot create relationship within the same table");
      return;
    }

    openJoinPropertiesModal(null, source.table, targetTable, source.field, targetField);
  } catch (err) {
    console.error("Drop relationship error:", err);
  }
}

function onDesignerTableHeaderMouseDown(e, tableName) {
  if (e.target && (e.target.tagName === 'BUTTON' || e.target.closest('button'))) return;
  e.preventDefault();
  activeDraggingTable = tableName;
  dragStartX = e.clientX;
  dragStartY = e.clientY;

  if (!queryDesignerState.tablePositions) queryDesignerState.tablePositions = {};
  const pos = queryDesignerState.tablePositions[tableName] || { x: 20, y: 15 };
  cardStartLeft = pos.x;
  cardStartTop = pos.y;

  const card = document.getElementById("qbeTableCard_" + tableName);
  if (card) card.classList.add("dragging");

  function onMouseMove(ev) {
    if (!activeDraggingTable) return;
    const zoom = queryDesignerState.canvasZoom || 1.0;
    const dx = (ev.clientX - dragStartX) / zoom;
    const dy = (ev.clientY - dragStartY) / zoom;
    const newX = Math.max(10, cardStartLeft + dx);
    const newY = Math.max(10, cardStartTop + dy);
    queryDesignerState.tablePositions[activeDraggingTable] = { x: newX, y: newY };
    const c = document.getElementById("qbeTableCard_" + activeDraggingTable);
    if (c) {
      c.style.left = newX + "px";
      c.style.top = newY + "px";
    }
    updateCanvasSvg();
  }

  function onMouseUp() {
    if (activeDraggingTable) {
      const c = document.getElementById("qbeTableCard_" + activeDraggingTable);
      if (c) {
        c.classList.remove("dragging");
      }
      activeDraggingTable = null;
    }
    window.removeEventListener("mousemove", onMouseMove);
    window.removeEventListener("mouseup", onMouseUp);
    updateCanvasSvg();
  }

  window.addEventListener("mousemove", onMouseMove);
  window.addEventListener("mouseup", onMouseUp);
}

function autoArrangeDesignerTables() {
  ensureQueryDesignerState();
  queryDesignerState.tablePositions = {};
  (queryDesignerState.selectedTables || []).forEach((t, i) => {
    queryDesignerState.tablePositions[t] = {
      x: 20 + i * 270,
      y: 15,
    };
  });
  renderQueryDesigner();
  showToast("Arranged tables across relationship canvas");
}

function setDesignerCanvasZoom(newZoom) {
  const clamped = Math.max(0.4, Math.min(2.5, Math.round(newZoom * 100) / 100));
  queryDesignerState.canvasZoom = clamped;
  const stage = document.getElementById("qbeCanvasStage");
  if (stage) {
    stage.style.transform = "scale(" + clamped + ")";
  }
  const select = document.getElementById("canvasZoomSelect");
  if (select) {
    select.value = clamped.toString();
    if (![0.5, 0.75, 0.9, 1.0, 1.25, 1.5, 2.0].includes(clamped)) {
      select.innerHTML = '<option value="' + clamped + '" selected>' + Math.round(clamped * 100) + '%</option>' +
        '<option value="0.5">50%</option><option value="0.75">75%</option><option value="0.9">90%</option><option value="1.0">100%</option><option value="1.25">125%</option><option value="1.5">150%</option><option value="2.0">200%</option>';
    }
  }
  updateCanvasSvg();
}

function zoomInDesignerCanvas() {
  setDesignerCanvasZoom((queryDesignerState.canvasZoom || 1.0) + 0.15);
}

function zoomOutDesignerCanvas() {
  setDesignerCanvasZoom((queryDesignerState.canvasZoom || 1.0) - 0.15);
}

function resetDesignerCanvasZoom() {
  setDesignerCanvasZoom(1.0);
}

function fitDesignerCanvasZoom() {
  const viewport = document.getElementById("qbeCanvasViewport");
  const tables = queryDesignerState.selectedTables || [];
  if (!viewport || tables.length === 0) return;

  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  tables.forEach(t => {
    const pos = (queryDesignerState.tablePositions && queryDesignerState.tablePositions[t]) || { x: 20, y: 15 };
    minX = Math.min(minX, pos.x);
    minY = Math.min(minY, pos.y);
    maxX = Math.max(maxX, pos.x + 240);
    maxY = Math.max(maxY, pos.y + 260);
  });

  const spanW = Math.max(200, maxX - minX + 60);
  const spanH = Math.max(200, maxY - minY + 60);
  const vW = viewport.clientWidth || 800;
  const vH = viewport.clientHeight || 400;

  const scaleX = vW / spanW;
  const scaleY = vH / spanH;
  const fitZoom = Math.min(1.4, Math.max(0.45, Math.min(scaleX, scaleY)));

  setDesignerCanvasZoom(fitZoom);
  viewport.scrollLeft = Math.max(0, (minX - 20) * fitZoom);
  viewport.scrollTop = Math.max(0, (minY - 20) * fitZoom);
  showToast("Canvas fitted to all " + tables.length + " tables (" + Math.round(fitZoom * 100) + "%)");
}

function setDesignerRoomMode(mode) {
  queryDesignerState.canvasViewMode = mode;
  const viewport = document.getElementById("qbeCanvasViewport");
  const grid = document.querySelector(".qbe-matrix-container");
  if (!viewport) return;

  let targetH = 480;
  if (mode === "canvas-max") {
    targetH = Math.max(550, (window.innerHeight || 800) - 320);
    if (grid) grid.style.maxHeight = "180px";
  } else if (mode === "grid-max") {
    targetH = 240;
    if (grid) grid.style.maxHeight = "none";
  } else {
    targetH = 480;
    if (grid) grid.style.maxHeight = "none";
  }

  queryDesignerState.canvasHeight = targetH;
  viewport.style.height = targetH + "px";
  viewport.style.maxHeight = targetH + "px";
  document.documentElement.style.setProperty("--qbe-canvas-height", targetH + "px");
  updateCanvasSvg();
  showToast("Room layout: " + (mode === "canvas-max" ? "Canvas Maximized" : mode === "grid-max" ? "Grid Focused" : "Balanced Split"));
}

function initResizerBar() {
  initQbeSplitter();
}

function initQbeSplitter() {
  const splitter = document.getElementById("qbeResizerBar");
  const viewport = document.getElementById("qbeCanvasViewport");
  if (!splitter || !viewport || splitter.dataset.splitterInitialized) return;
  splitter.dataset.splitterInitialized = "true";

  let isDragging = false;
  let startY = 0;
  let startH = 0;

  splitter.addEventListener("mousedown", (e) => {
    isDragging = true;
    startY = e.clientY;
    startH = viewport.offsetHeight;
    splitter.classList.add("resizing");
    document.body.style.cursor = "row-resize";
    e.preventDefault();
  });

  window.addEventListener("mousemove", (e) => {
    if (!isDragging) return;
    const delta = e.clientY - startY;
    const newH = Math.max(200, Math.min(1200, startH + delta));
    queryDesignerState.canvasHeight = newH;
    viewport.style.height = newH + "px";
    viewport.style.maxHeight = newH + "px";
    document.documentElement.style.setProperty("--qbe-canvas-height", newH + "px");
    updateCanvasSvg();
  });

  window.addEventListener("mouseup", () => {
    if (isDragging) {
      isDragging = false;
      splitter.classList.remove("resizing");
      document.body.style.cursor = "";
      updateCanvasSvg();
    }
  });
}

function initCanvasPanAndZoom() {
  const viewport = document.getElementById("qbeCanvasViewport");
  if (!viewport || viewport.dataset.zoomInitialized) return;
  viewport.dataset.zoomInitialized = "true";

  let isPanning = false;
  let startX = 0;
  let startY = 0;
  let scrollStartL = 0;
  let scrollStartT = 0;

  viewport.addEventListener("mousedown", (e) => {
    const target = e.target;
    if (target.closest(".qbe-table-card") || target.closest(".qbe-svg-join-badge") || target.closest("button") || target.closest("select") || target.closest("input")) {
      return;
    }
    isPanning = true;
    startX = e.clientX;
    startY = e.clientY;
    scrollStartL = viewport.scrollLeft;
    scrollStartT = viewport.scrollTop;
    viewport.classList.add("panning");
  });

  window.addEventListener("mousemove", (e) => {
    if (!isPanning) return;
    const dx = e.clientX - startX;
    const dy = e.clientY - startY;
    viewport.scrollLeft = scrollStartL - dx;
    viewport.scrollTop = scrollStartT - dy;
  });

  window.addEventListener("mouseup", () => {
    if (isPanning) {
      isPanning = false;
      viewport.classList.remove("panning");
    }
  });

  viewport.addEventListener("wheel", (e) => {
    if (e.ctrlKey || e.metaKey) {
      e.preventDefault();
      const delta = e.deltaY < 0 ? 0.12 : -0.12;
      const cur = queryDesignerState.canvasZoom || 1.0;
      setDesignerCanvasZoom(cur + delta);
    }
  }, { passive: false });
}

function setQbeGridDensity(density) {
  queryDesignerState.gridDensity = density;
  let fontSize = "11px";
  let padding = "4px 6px";
  if (density === "compact") {
    fontSize = "9.5px";
    padding = "2px 4px";
  } else if (density === "spacious") {
    fontSize = "13px";
    padding = "7px 10px";
  }
  document.documentElement.style.setProperty("--qbe-grid-font-size", fontSize);
  document.documentElement.style.setProperty("--qbe-grid-cell-padding", padding);
  renderQueryDesigner();
}

function adjustSqlFontSize(delta) {
  const cur = queryDesignerState.sqlFontSize || 13;
  const next = Math.max(10, Math.min(24, cur + delta));
  queryDesignerState.sqlFontSize = next;
  const area = document.getElementById("designerSqlPreview") || document.getElementById("customDesignerSqlArea");
  const badge = document.getElementById("sqlFontBadge");
  if (area) area.style.fontSize = next + "px";
  if (badge) badge.textContent = next + "px";
}

function toggleSqlEditorHeight() {
  const area = document.getElementById("designerSqlPreview") || document.getElementById("customDesignerSqlArea");
  if (!area) return;
  const curH = parseInt(area.style.height || "380", 10);
  const newH = curH > 450 ? 380 : 640;
  area.style.height = newH + "px";
}

function setDatasheetDensity(density) {
  queryDesignerState.datasheetDensity = density;
  let padding = "5px 8px";
  if (density === "compact") padding = "2px 6px";
  else if (density === "spacious") padding = "9px 12px";
  document.documentElement.style.setProperty("--ds-cell-padding", padding);
  renderQueryDesigner();
}

function adjustDatasheetFontSize(delta) {
  const cur = queryDesignerState.datasheetFontSize || 11;
  const next = Math.max(9, Math.min(20, cur + delta));
  queryDesignerState.datasheetFontSize = next;
  document.documentElement.style.setProperty("--ds-font-size", next + "px");
  const badge = document.getElementById("dsFontBadge");
  if (badge) badge.textContent = next + "px";
  renderQueryDesigner();
}

function toggleSidebarCollapse() {
  const aside = document.getElementById("mainSidebar");
  if (!aside) return;
  if (aside.style.display === "none") {
    aside.style.display = "flex";
  } else {
    aside.style.display = "none";
  }
  setTimeout(() => {
    if (activeTab === "designer") updateCanvasSvg();
  }, 40);
}

function updateCanvasSvg() {
  const canvas = document.getElementById("qbeCanvasViewport");
  const stage = document.getElementById("qbeCanvasStage") || canvas;
  const svg = document.getElementById("qbeCanvasSvg");
  if (!canvas || !svg) return;

  const joins = queryDesignerState.joins || [];
  if (!joins.length) {
    svg.innerHTML = "";
    return;
  }

  const zoom = queryDesignerState.canvasZoom || 1.0;
  const stageRect = stage.getBoundingClientRect();

  svg.style.width = Math.max(stage.scrollWidth, stage.offsetWidth, 3400) + "px";
  svg.style.height = Math.max(stage.scrollHeight, stage.offsetHeight, 2400) + "px";

  let svgContent = `
    <defs>
      <marker id="marker-arrow-emerald" markerWidth="8" markerHeight="8" refX="6" refY="4" orient="auto">
        <polygon points="0 1, 8 4, 0 7" fill="#10b981" />
      </marker>
      <marker id="marker-arrow-amber" markerWidth="8" markerHeight="8" refX="2" refY="4" orient="auto">
        <polygon points="8 1, 0 4, 8 7" fill="#f59e0b" />
      </marker>
      <marker id="marker-diamond-purple" markerWidth="8" markerHeight="8" refX="4" refY="4" orient="auto">
        <polygon points="4 1, 7 4, 4 7, 1 4" fill="#a855f7" />
      </marker>
    </defs>
  `;

  joins.forEach(j => {
    const fieldLeft = document.getElementById("qbeFieldRow_" + j.leftTable + "_" + j.leftField);
    const fieldRight = document.getElementById("qbeFieldRow_" + j.rightTable + "_" + j.rightField);
    const cardLeft = document.getElementById("qbeTableCard_" + j.leftTable);
    const cardRight = document.getElementById("qbeTableCard_" + j.rightTable);

    const targetL = fieldLeft || cardLeft;
    const targetR = fieldRight || cardRight;
    if (!targetL || !targetR) return;

    const rL = targetL.getBoundingClientRect();
    const rR = targetR.getBoundingClientRect();

    let x1, x2;
    if (rL.right <= rR.left) {
      x1 = (rL.right - stageRect.left) / zoom;
      x2 = (rR.left - stageRect.left) / zoom;
    } else if (rR.right <= rL.left) {
      x1 = (rL.left - stageRect.left) / zoom;
      x2 = (rR.right - stageRect.left) / zoom;
    } else {
      x1 = (rL.right - stageRect.left) / zoom;
      x2 = (rR.right - stageRect.left) / zoom;
    }

    const y1 = ((rL.top + rL.height / 2) - stageRect.top) / zoom;
    const y2 = ((rR.top + rR.height / 2) - stageRect.top) / zoom;

    const dx = Math.max(35, Math.abs(x2 - x1) * 0.45);
    const d = `M ${x1} ${y1} C ${x1 + (x2 >= x1 ? dx : -dx)} ${y1}, ${x2 + (x2 >= x1 ? -dx : dx)} ${y2}, ${x2} ${y2}`;

    const mx = (x1 + x2) / 2;
    const my = (y1 + y2) / 2;

    const type = (j.type || "INNER").toUpperCase();
    let stroke = "#38bdf8";
    let dash = "";
    let markerAttr = "";
    let badgeIcon = "=";

    if (type === "LEFT") {
      stroke = "#10b981";
      markerAttr = 'marker-end="url(#marker-arrow-emerald)"';
      badgeIcon = "⟵";
    } else if (type === "RIGHT") {
      stroke = "#f59e0b";
      markerAttr = 'marker-start="url(#marker-arrow-amber)"';
      badgeIcon = "⟶";
    } else if (type === "FULL" || type === "FULL OUTER") {
      stroke = "#a855f7";
      dash = 'stroke-dasharray="6,4"';
      markerAttr = 'marker-end="url(#marker-diamond-purple)" marker-start="url(#marker-diamond-purple)"';
      badgeIcon = "⟷";
    } else if (type === "CROSS") {
      stroke = "#f43f5e";
      dash = 'stroke-dasharray="3,3"';
      badgeIcon = "×";
    }

    svgContent += `
      <path d="${d}" class="qbe-svg-join-halo" onclick="openJoinPropertiesModal('${j.key}')" title="Click to edit Join Properties (${type} JOIN)"></path>
      <path d="${d}" class="qbe-svg-join-line" stroke="${stroke}" ${dash} ${markerAttr} onclick="openJoinPropertiesModal('${j.key}')" title="Click to edit Join Properties (${type} JOIN)"></path>
      <foreignObject x="${mx - 50}" y="${my - 13}" width="100" height="26" style="overflow: visible;">
        <div xmlns="http://www.w3.org/1999/xhtml" class="qbe-svg-join-badge" style="border-color:${stroke}; color:${stroke};" onclick="openJoinPropertiesModal('${j.key}')" title="Join Properties (${type} JOIN): Click to configure">
          <span>${badgeIcon}</span>
          <span>${type}</span>
        </div>
      </foreignObject>
    `;
  });

  svg.innerHTML = svgContent;
}

function promptAddDesignerJoin(preferredLeft, preferredRight) {
  if (queryDesignerState.selectedTables.length < 2) {
    showToast("Add at least 2 tables to create a join relationship");
    return;
  }
  openJoinPropertiesModal(null, preferredLeft, preferredRight);
}

function updateDesignerJoin(key, prop, value) {
  queryDesignerState.joins = (queryDesignerState.joins || []).map(j => {
    if (j.key === key) {
      return { ...j, [prop]: value };
    }
    return j;
  });
  renderQueryDesigner();
}

function updateDesignerJoinTable(key, side, newTableName) {
  const join = (queryDesignerState.joins || []).find(j => j.key === key);
  if (!join) return;
  if (side === "leftTable") {
    join.leftTable = newTableName;
    const otherTable = join.rightTable;
    const sugg = suggestDesignerJoin(newTableName, otherTable);
    if (sugg) {
      join.leftField = sugg.leftField;
      join.rightField = sugg.rightField;
    } else {
      const meta = getEntityMeta(newTableName);
      join.leftField = meta && meta.columns && meta.columns[0] ? meta.columns[0].name : "id";
    }
  } else {
    join.rightTable = newTableName;
    const otherTable = join.leftTable;
    const sugg = suggestDesignerJoin(otherTable, newTableName);
    if (sugg) {
      join.leftField = sugg.leftField;
      join.rightField = sugg.rightField;
    } else {
      const meta = getEntityMeta(newTableName);
      join.rightField = meta && meta.columns && meta.columns[0] ? meta.columns[0].name : "id";
    }
  }
  renderQueryDesigner();
}

function removeDesignerJoin(key) {
  queryDesignerState.joins = (queryDesignerState.joins || []).filter(j => j.key !== key);
  renderQueryDesigner();
}

function addDesignerQbeColumn(table, field) {
  if (!table) table = queryDesignerState.selectedTables[0] || "";
  if (!field) {
    const meta = getEntityMeta(table);
    field = meta && meta.columns && meta.columns[0] ? meta.columns[0].name : "*";
  }
  queryDesignerState.columns.push({
    id: "col-" + Date.now() + "-" + Math.random().toString(16).slice(2),
    table: table,
    field: field,
    alias: "",
    total: queryDesignerState.showTotals ? "GroupBy" : "None",
    sort: "",
    show: true,
    criteria: "",
    or1: "",
    or2: "",
  });
  renderQueryDesigner();
}

function updateDesignerQbeColumn(id, prop, value) {
  const col = (queryDesignerState.columns || []).find(c => c.id === id);
  if (!col) return;
  col[prop] = value;
  if (prop === "table") {
    const meta = getEntityMeta(value);
    if (meta && meta.columns && meta.columns.length) {
      col.field = meta.columns[0].name;
    }
  }
  renderQueryDesigner();
}

function moveDesignerQbeColumn(id, delta) {
  const idx = (queryDesignerState.columns || []).findIndex(c => c.id === id);
  if (idx === -1) return;
  const targetIdx = idx + delta;
  if (targetIdx < 0 || targetIdx >= queryDesignerState.columns.length) return;
  const temp = queryDesignerState.columns[idx];
  queryDesignerState.columns[idx] = queryDesignerState.columns[targetIdx];
  queryDesignerState.columns[targetIdx] = temp;
  renderQueryDesigner();
}

function removeDesignerQbeColumn(id) {
  queryDesignerState.columns = (queryDesignerState.columns || []).filter(c => c.id !== id);
  renderQueryDesigner();
}

function clearDesignerQbe() {
  queryDesignerState.columns = [];
  renderQueryDesigner();
  showToast("Cleared QBE grid columns");
}

function resetDesignerAll() {
  queryDesignerState.selectedTables = [];
  queryDesignerState.joins = [];
  queryDesignerState.columns = [];
  queryDesignerState.activeView = "design";
  queryDesignerState.datasheet = null;
  ensureQueryDesignerState();
  renderQueryDesigner();
  showToast("Reset Query Designer");
}

function runDesignerQuery() {
  const sql = buildDesignerSql();
  queryDesignerState.activeView = "datasheet";
  queryDesignerState.datasheetLoading = true;
  queryDesignerState.datasheetError = null;
  renderQueryDesigner();

  apiRequest('/api/query', 'POST', { sql }).then(res => {
    if (res && res.success) {
      queryDesignerState.datasheet = {
        rows: res.rows || [],
        columns: res.columns || [],
        latencyMs: res.latencyMs || 0,
        error: null,
      };
    } else {
      queryDesignerState.datasheet = {
        rows: [],
        columns: [],
        latencyMs: 0,
        error: res ? res.error : "Execution failed",
      };
    }
  }).catch(err => {
    queryDesignerState.datasheet = {
      rows: [],
      columns: [],
      latencyMs: 0,
      error: err.message,
    };
  }).finally(() => {
    queryDesignerState.datasheetLoading = false;
    renderQueryDesigner();
  });
}

function loadSavedQueriesFromStorage() {
  try {
    const raw = localStorage.getItem("postgres_studio_saved_queries");
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length) return parsed;
    }
  } catch (e) {}
  return [
    {
      name: "Top Customers by Spend",
      sql: 'SELECT "customers"."name" AS "Customer", "customers"."tier" AS "Tier", SUM("orders"."total_amount") AS "TotalSpend", COUNT("orders"."id") AS "OrdersCount"\nFROM "customers"\nINNER JOIN "orders" ON "customers"."id" = "orders"."customer_id"\nGROUP BY "customers"."name", "customers"."tier"\nHAVING SUM("orders"."total_amount") > 0\nORDER BY "TotalSpend" DESC\nLIMIT 25;',
      createdAt: new Date().toISOString()
    },
    {
      name: "Low Stock Inventory Alert",
      sql: 'SELECT "products"."name" AS "Product", "products"."category" AS "Category", "products"."stock" AS "UnitsInStock", "products"."price" AS "Price"\nFROM "products"\nWHERE "products"."stock" < 50\nORDER BY "products"."stock" ASC\nLIMIT 50;',
      createdAt: new Date().toISOString()
    }
  ];
}

function persistSavedQueries() {
  try {
    localStorage.setItem("postgres_studio_saved_queries", JSON.stringify(queryDesignerState.savedQueries || []));
  } catch (e) {}
}

function applyDesignerPreset(presetKey) {
  if (!presetKey) return;
  if (presetKey === "blank") {
    resetDesignerAll();
    return;
  }
  if (!currentSchema || !currentSchema.tables || !currentSchema.tables.length) {
    showToast("Load or seed a database first");
    return;
  }

  const tableNames = currentSchema.tables.map(t => t.name);

  if (presetKey === "ecommerce_multi") {
    if (tableNames.includes("customers") && tableNames.includes("orders") && tableNames.includes("order_items") && tableNames.includes("products")) {
      queryDesignerState.selectedTables = ["customers", "orders", "order_items", "products"];
      queryDesignerState.showTotals = true;
      queryDesignerState.distinct = false;
      queryDesignerState.topLimit = 50;
      queryDesignerState.joins = buildDesignerJoinPairs();

      queryDesignerState.columns = [
        { id: "p1", table: "customers", field: "name", alias: "Customer", total: "GroupBy", sort: "ASC", show: true, criteria: "", or1: "", or2: "" },
        { id: "p2", table: "products", field: "category", alias: "Category", total: "GroupBy", sort: "", show: true, criteria: "", or1: "", or2: "" },
        { id: "p3", table: "products", field: "name", alias: "Product", total: "GroupBy", sort: "", show: true, criteria: "", or1: "", or2: "" },
        { id: "p4", table: "order_items", field: "quantity", alias: "TotalUnits", total: "Sum", sort: "", show: true, criteria: "> 0", or1: "", or2: "" },
        { id: "p5", table: "orders", field: "total_amount", alias: "Revenue", total: "Sum", sort: "DESC", show: true, criteria: "", or1: "", or2: "" }
      ];
      renderQueryDesigner();
      showToast("Loaded 4-Table Enterprise Template (Customers, Orders, Items, Products)");
      return;
    }
  }

  if (presetKey === "top_spenders") {
    if (tableNames.includes("customers") && tableNames.includes("orders")) {
      queryDesignerState.selectedTables = ["customers", "orders"];
      queryDesignerState.showTotals = true;
      queryDesignerState.distinct = false;
      queryDesignerState.topLimit = 25;
      queryDesignerState.joins = buildDesignerJoinPairs();
      const custMeta = currentSchema.tables.find(t => t.name === "customers");
      const ordMeta = currentSchema.tables.find(t => t.name === "orders");
      const segField = custMeta && custMeta.columns.some(c => c.name === "segment") ? "segment" : (custMeta && custMeta.columns.some(c => c.name === "tier") ? "tier" : "email");
      const amtField = ordMeta && ordMeta.columns.some(c => c.name === "total_amount") ? "total_amount" : "amount";

      queryDesignerState.columns = [
        { id: "p1", table: "customers", field: "name", alias: "Customer", total: "GroupBy", sort: "ASC", show: true, criteria: "", or1: "", or2: "" },
        { id: "p2", table: "customers", field: segField, alias: "Segment", total: "GroupBy", sort: "", show: true, criteria: "", or1: "", or2: "" },
        { id: "p3", table: "orders", field: amtField, alias: "TotalSpend", total: "Sum", sort: "DESC", show: true, criteria: "> 0", or1: "", or2: "" },
        { id: "p4", table: "orders", field: "id", alias: "OrdersCount", total: "Count", sort: "", show: true, criteria: "", or1: "", or2: "" }
      ];
      renderQueryDesigner();
      showToast("Loaded Template: Top Customers by Spend");
      return;
    }
  } else if (presetKey === "join_left") {
    if (tableNames.includes("customers") && tableNames.includes("orders")) {
      queryDesignerState.selectedTables = ["customers", "orders"];
      queryDesignerState.showTotals = false;
      queryDesignerState.distinct = false;
      queryDesignerState.topLimit = 50;
      queryDesignerState.joins = [
        { key: "customers.id->orders.customer_id-left", leftTable: "customers", leftField: "id", rightTable: "orders", rightField: "customer_id", type: "LEFT" }
      ];
      queryDesignerState.columns = [
        { id: "jl1", table: "customers", field: "id", alias: "cust_id", total: "None", sort: "ASC", show: true, criteria: "", or1: "", or2: "" },
        { id: "jl2", table: "customers", field: "name", alias: "customer_name", total: "None", sort: "", show: true, criteria: "", or1: "", or2: "" },
        { id: "jl3", table: "orders", field: "id", alias: "order_id", total: "None", sort: "", show: true, criteria: "", or1: "", or2: "" },
        { id: "jl4", table: "orders", field: "total_amount", alias: "order_amount", total: "None", sort: "", show: true, criteria: "", or1: "", or2: "" }
      ];
      renderQueryDesigner();
      showToast("Loaded Access Option 2: LEFT OUTER JOIN (All Customers)");
      return;
    }
  } else if (presetKey === "join_right") {
    if (tableNames.includes("customers") && tableNames.includes("orders")) {
      queryDesignerState.selectedTables = ["customers", "orders"];
      queryDesignerState.showTotals = false;
      queryDesignerState.distinct = false;
      queryDesignerState.topLimit = 50;
      queryDesignerState.joins = [
        { key: "customers.id->orders.customer_id-right", leftTable: "customers", leftField: "id", rightTable: "orders", rightField: "customer_id", type: "RIGHT" }
      ];
      queryDesignerState.columns = [
        { id: "jr1", table: "customers", field: "name", alias: "customer_name", total: "None", sort: "", show: true, criteria: "", or1: "", or2: "" },
        { id: "jr2", table: "orders", field: "id", alias: "order_id", total: "None", sort: "ASC", show: true, criteria: "", or1: "", or2: "" },
        { id: "jr3", table: "orders", field: "total_amount", alias: "order_amount", total: "None", sort: "", show: true, criteria: "", or1: "", or2: "" }
      ];
      renderQueryDesigner();
      showToast("Loaded Access Option 3: RIGHT OUTER JOIN (All Orders)");
      return;
    }
  } else if (presetKey === "join_full") {
    if (tableNames.includes("customers") && tableNames.includes("orders")) {
      queryDesignerState.selectedTables = ["customers", "orders"];
      queryDesignerState.showTotals = false;
      queryDesignerState.distinct = false;
      queryDesignerState.topLimit = 50;
      queryDesignerState.joins = [
        { key: "customers.id->orders.customer_id-full", leftTable: "customers", leftField: "id", rightTable: "orders", rightField: "customer_id", type: "FULL" }
      ];
      queryDesignerState.columns = [
        { id: "jf1", table: "customers", field: "id", alias: "cust_id", total: "None", sort: "", show: true, criteria: "", or1: "", or2: "" },
        { id: "jf2", table: "customers", field: "name", alias: "customer_name", total: "None", sort: "", show: true, criteria: "", or1: "", or2: "" },
        { id: "jf3", table: "orders", field: "id", alias: "order_id", total: "None", sort: "", show: true, criteria: "", or1: "", or2: "" },
        { id: "jf4", table: "orders", field: "total_amount", alias: "order_amount", total: "None", sort: "", show: true, criteria: "", or1: "", or2: "" }
      ];
      renderQueryDesigner();
      showToast("Loaded Access Option 4: FULL OUTER JOIN (Native PostgreSQL)");
      return;
    }
  } else if (presetKey === "join_cross") {
    if (tableNames.includes("customers") && tableNames.includes("products")) {
      queryDesignerState.selectedTables = ["customers", "products"];
      queryDesignerState.showTotals = false;
      queryDesignerState.distinct = false;
      queryDesignerState.topLimit = 25;
      queryDesignerState.joins = [
        { key: "customers->products-cross", leftTable: "customers", leftField: "id", rightTable: "products", rightField: "id", type: "CROSS" }
      ];
      queryDesignerState.columns = [
        { id: "jc1", table: "customers", field: "name", alias: "customer_name", total: "None", sort: "", show: true, criteria: "", or1: "", or2: "" },
        { id: "jc2", table: "products", field: "name", alias: "product_name", total: "None", sort: "", show: true, criteria: "", or1: "", or2: "" },
        { id: "jc3", table: "products", field: "price", alias: "unit_price", total: "None", sort: "", show: true, criteria: "", or1: "", or2: "" }
      ];
      renderQueryDesigner();
      showToast("Loaded Access Option 5: CROSS JOIN (Cartesian Matrix)");
      return;
    }
  } else if (presetKey === "low_stock") {
    if (tableNames.includes("products")) {
      queryDesignerState.selectedTables = ["products"];
      queryDesignerState.showTotals = false;
      queryDesignerState.distinct = false;
      queryDesignerState.topLimit = 50;
      queryDesignerState.joins = [];
      const prodMeta = currentSchema.tables.find(t => t.name === "products");
      const stockField = prodMeta && prodMeta.columns.some(c => c.name === "stock_quantity") ? "stock_quantity" : "stock";

      queryDesignerState.columns = [
        { id: "p1", table: "products", field: "name", alias: "Product", total: "None", sort: "", show: true, criteria: "", or1: "", or2: "" },
        { id: "p2", table: "products", field: "category", alias: "Category", total: "None", sort: "", show: true, criteria: "", or1: "", or2: "" },
        { id: "p3", table: "products", field: stockField, alias: "UnitsInStock", total: "None", sort: "ASC", show: true, criteria: "< 50", or1: "", or2: "" },
        { id: "p4", table: "products", field: "price", alias: "Price", total: "None", sort: "", show: true, criteria: "", or1: "", or2: "" }
      ];
      renderQueryDesigner();
      showToast("Loaded Template: Low Stock Inventory Alert");
      return;
    }
  } else if (presetKey === "orders_status") {
    if (tableNames.includes("customers") && tableNames.includes("orders")) {
      queryDesignerState.selectedTables = ["customers", "orders"];
      queryDesignerState.showTotals = false;
      queryDesignerState.distinct = false;
      queryDesignerState.topLimit = 50;
      queryDesignerState.joins = buildDesignerJoinPairs();
      const ordMeta = currentSchema.tables.find(t => t.name === "orders");
      const amtField = ordMeta && ordMeta.columns.some(c => c.name === "total_amount") ? "total_amount" : "amount";

      queryDesignerState.columns = [
        { id: "p1", table: "orders", field: "id", alias: "OrderID", total: "None", sort: "DESC", show: true, criteria: "", or1: "", or2: "" },
        { id: "p2", table: "customers", field: "name", alias: "Customer", total: "None", sort: "", show: true, criteria: "", or1: "", or2: "" },
        { id: "p3", table: "orders", field: "status", alias: "Status", total: "None", sort: "", show: true, criteria: "<> 'cancelled'", or1: "", or2: "" },
        { id: "p4", table: "orders", field: amtField, alias: "Amount", total: "None", sort: "", show: true, criteria: "", or1: "", or2: "" }
      ];
      renderQueryDesigner();
      showToast("Loaded Template: Active Orders Pipeline");
      return;
    }
  }

  // Generic fallback for any user database
  queryDesignerState.selectedTables = [tableNames[0]];
  if (tableNames.length > 1) queryDesignerState.selectedTables.push(tableNames[1]);
  queryDesignerState.joins = buildDesignerJoinPairs();
  queryDesignerState.columns = [];
  queryDesignerState.showTotals = false;
  queryDesignerState.distinct = false;
  ensureQueryDesignerState();
  renderQueryDesigner();
  showToast("Initialized query layout for " + queryDesignerState.selectedTables.join(" & "));
}

function exportDesignerDatasheet(format) {
  if (!queryDesignerState.datasheet || !queryDesignerState.datasheet.rows.length) {
    showToast("No data to export. Run the query first.");
    return;
  }
  const rows = queryDesignerState.datasheet.rows;
  const cols = queryDesignerState.datasheet.columns;
  let content = "";
  let filename = "query_results." + format;
  let mime = "text/plain";

  if (format === "json") {
    content = JSON.stringify(rows, null, 2);
    mime = "application/json";
  } else {
    const header = cols.join(",");
    const body = rows.map(r => cols.map(c => {
      const val = r[c] !== null && r[c] !== undefined ? String(r[c]) : "";
      return val.includes(",") || val.includes('"') || val.includes("\n") ? '"' + val.replace(/"/g, '""') + '"' : val;
    }).join(",")).join("\n");
    content = header + "\n" + body;
    mime = "text/csv";
  }

  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
  showToast("Exported " + rows.length + " records as " + format.toUpperCase());
}

function copyDesignerDatasheetMarkdown() {
  if (!queryDesignerState.datasheet || !queryDesignerState.datasheet.rows.length) {
    showToast("No data to copy. Run the query first.");
    return;
  }
  const rows = queryDesignerState.datasheet.rows;
  const cols = queryDesignerState.datasheet.columns;
  const header = "| " + cols.join(" | ") + " |";
  const sep = "| " + cols.map(() => "---").join(" | ") + " |";
  const body = rows.map(r => "| " + cols.map(c => {
    const val = r[c] !== null && r[c] !== undefined ? String(r[c]) : "NULL";
    return val.replace(/\|/g, "\\|");
  }).join(" | ") + " |").join("\n");
  const md = header + "\n" + sep + "\n" + body;
  if (navigator.clipboard) {
    navigator.clipboard.writeText(md);
    showToast("Copied " + rows.length + " rows as Markdown table");
  }
}

function copyDesignerDatasheetSqlInsert() {
  if (!queryDesignerState.datasheet || !queryDesignerState.datasheet.rows.length) {
    showToast("No data to copy. Run the query first.");
    return;
  }
  const rows = queryDesignerState.datasheet.rows;
  const cols = queryDesignerState.datasheet.columns;
  const targetTable = queryDesignerState.selectedTables[0] || "results";
  const colList = cols.map(c => quoteSqlIdentifier(c)).join(", ");
  const inserts = rows.map(r => {
    const vals = cols.map(c => {
      const val = r[c];
      if (val === null || val === undefined) return "NULL";
      if (typeof val === "number") return val;
      return "'" + String(val).replace(/'/g, "''") + "'";
    }).join(", ");
    return "INSERT INTO " + quoteSqlIdentifier(targetTable) + " (" + colList + ") VALUES (" + vals + ");";
  }).join("\n");
  if (navigator.clipboard) {
    navigator.clipboard.writeText(inserts);
    showToast("Copied " + rows.length + " SQL INSERT statements");
  }
}

function filterDesignerDatasheet(query) {
  const container = document.querySelector(".qbe-datasheet-container tbody");
  if (!container) return;
  const q = (query || "").toLowerCase().trim();
  const rows = container.querySelectorAll("tr");
  rows.forEach(r => {
    if (!q) {
      r.style.display = "";
      return;
    }
    r.style.display = r.textContent.toLowerCase().includes(q) ? "" : "none";
  });
}

function toggleCriteriaHelp() {
  const banner = document.getElementById("criteriaHelpBanner");
  if (banner) {
    banner.style.display = banner.style.display === "none" ? "block" : "none";
  }
}

function loadDesignerSqlToEditor() {
  const value = buildDesignerSql();
  const editor = document.getElementById("sqlEditorTextarea") || document.getElementById("sqlEditor");
  if (editor) editor.value = value;
  showToast("Designer SQL loaded into editor");
}

function copyDesignerSql() {
  const value = buildDesignerSql();
  if (navigator.clipboard) {
    navigator.clipboard.writeText(value);
    showToast("SQL copied to clipboard");
  }
}

function explainDesignerQuery() {
  const sql = buildDesignerSql();
  const editor = document.getElementById("sqlEditorTextarea") || document.getElementById("sqlEditor");
  if (editor) editor.value = sql;
  explainCurrentQuery();
}
window.runExplainPlan = explainDesignerQuery;

function runCustomDesignerSql() {
  const preview = document.getElementById("designerSqlPreview");
  const sql = preview ? preview.value.trim() : buildDesignerSql();
  if (!sql) return;
  queryDesignerState.activeView = "datasheet";
  queryDesignerState.datasheetLoading = true;
  queryDesignerState.datasheetError = null;
  renderQueryDesigner();

  apiRequest('/api/query', 'POST', { sql }).then(res => {
    if (res && res.success) {
      queryDesignerState.datasheet = {
        rows: res.rows || [],
        columns: res.columns || [],
        latencyMs: res.latencyMs || 0,
        error: null,
      };
    } else {
      queryDesignerState.datasheet = {
        rows: [],
        columns: [],
        latencyMs: 0,
        error: res ? res.error : "Execution failed",
      };
    }
  }).catch(err => {
    queryDesignerState.datasheet = {
      rows: [],
      columns: [],
      latencyMs: 0,
      error: err.message,
    };
  }).finally(() => {
    queryDesignerState.datasheetLoading = false;
    renderQueryDesigner();
  });
}

function resetDesignerSqlToQbe() {
  const preview = document.getElementById("designerSqlPreview");
  if (preview) {
    preview.value = buildDesignerSql();
    showToast("Reset SQL to QBE Designer query");
  }
}

function saveDesignerQuery() {
  const preview = document.getElementById("designerSqlPreview");
  const sql = (queryDesignerState.activeView === "sql" && preview && preview.value.trim()) ? preview.value.trim() : buildDesignerSql();
  const defaultName = "Query " + ((queryDesignerState.savedQueries || []).length + 1);
  const name = prompt("Save this query as:", defaultName);
  if (!name) return;
  if (!queryDesignerState.savedQueries) queryDesignerState.savedQueries = [];
  queryDesignerState.savedQueries.unshift({ name, sql, createdAt: new Date().toISOString() });
  queryDesignerState.savedQueries = queryDesignerState.savedQueries.slice(0, 15);
  persistSavedQueries();
  showToast("Saved query: " + name);
  renderQueryDesigner();
}

async function saveDesignerAsView() {
  const preview = document.getElementById("designerSqlPreview");
  let querySql = (queryDesignerState.activeView === "sql" && preview && preview.value.trim()) ? preview.value.trim() : buildDesignerSql();
  querySql = querySql.replace(/;+$/, "").trim();
  if (!querySql || querySql.startsWith("--")) {
    showToast("Cannot create view from empty query");
    return;
  }

  const defaultViewName = "v_" + (queryDesignerState.selectedTables && queryDesignerState.selectedTables[0] ? queryDesignerState.selectedTables[0] : "custom") + "_view";
  const viewName = prompt("Save query as a permanent PostgreSQL VIEW (enter view name):", defaultViewName);
  if (!viewName) return;

  const sanitized = viewName.trim().replace(/[^a-zA-Z0-9_]/g, "");
  if (!sanitized) {
    showToast("Invalid view name. Use letters, numbers, and underscores.");
    return;
  }

  const ddl = "CREATE OR REPLACE VIEW " + quoteSqlIdentifier(sanitized) + " AS " + querySql + ";";
  try {
    const res = await apiRequest('/api/query', 'POST', { sql: ddl });
    if (res && res.error) {
      showToast("Error creating view: " + res.error);
    } else {
      showToast("View " + sanitized + " created successfully!");
      logAudit("[DDL] Created VIEW: " + sanitized);
      await refreshAll();
      selectTable(sanitized);
    }
  } catch (err) {
    showToast("Failed to create view: " + (err.message || String(err)));
  }
}

function loadSavedDesignerQuery(index) {
  const item = queryDesignerState.savedQueries && queryDesignerState.savedQueries[index];
  if (!item) return;
  const editor = document.getElementById("sqlEditorTextarea") || document.getElementById("sqlEditor");
  if (editor) editor.value = item.sql;
  const preview = document.getElementById("designerSqlPreview");
  if (preview) preview.value = item.sql;
  showToast("Loaded saved query: " + item.name);
}

function deleteSavedDesignerQuery(index) {
  if (!queryDesignerState.savedQueries || index < 0 || index >= queryDesignerState.savedQueries.length) return;
  const removed = queryDesignerState.savedQueries.splice(index, 1);
  persistSavedQueries();
  renderQueryDesigner();
  showToast("Deleted query: " + (removed[0] ? removed[0].name : ""));
}

function buildDesignerSql() {
  ensureQueryDesignerState();
  if (!queryDesignerState.selectedTables || !queryDesignerState.selectedTables.length) {
    return "-- Add a table from the toolbar to start building your query";
  }

  const selectedTables = queryDesignerState.selectedTables;
  const baseTable = selectedTables[0];
  const showTotals = queryDesignerState.showTotals;

  const selectItems = [];
  const groupByItems = [];
  const whereConditions = [];
  const havingConditions = [];
  const orderByItems = [];

  const activeColumns = (queryDesignerState.columns || []).filter(col => selectedTables.includes(col.table));

  if (!activeColumns.length) {
    selectItems.push("*");
  } else {
    activeColumns.forEach(col => {
      const qualified = quoteSqlIdentifier(col.table) + "." + (col.field === "*" ? "*" : quoteSqlIdentifier(col.field));
      const alias = col.alias ? quoteSqlIdentifier(col.alias) : (selectedTables.length > 1 ? quoteSqlIdentifier(col.table + "_" + col.field) : quoteSqlIdentifier(col.field));
      const total = col.total || (showTotals ? "GroupBy" : "None");

      let expr = qualified;
      let isAggregate = false;

      if (showTotals) {
        if (["Sum", "Avg", "Min", "Max", "Count"].includes(total)) {
          expr = total.toUpperCase() + "(" + qualified + ")";
          isAggregate = true;
        } else if (total === "Where") {
          expr = null;
        } else if (total === "Expression") {
          expr = col.field;
        }
      }

      if (col.show !== false && expr !== null) {
        selectItems.push(expr + (alias ? " AS " + alias : ""));
      }

      if (showTotals && (total === "GroupBy" || (!isAggregate && total !== "Where" && total !== "Expression" && col.show !== false))) {
        if (!groupByItems.includes(qualified) && col.field !== "*") {
          groupByItems.push(qualified);
        }
      }

      const conds = [];
      if (col.criteria && col.criteria.trim()) conds.push(formatAccessCriterion(isAggregate ? expr : qualified, col.criteria));
      if (col.or1 && col.or1.trim()) conds.push(formatAccessCriterion(isAggregate ? expr : qualified, col.or1));
      if (col.or2 && col.or2.trim()) conds.push(formatAccessCriterion(isAggregate ? expr : qualified, col.or2));

      if (conds.length > 0) {
        const combined = conds.length === 1 ? conds[0] : "(" + conds.join(" OR ") + ")";
        if (isAggregate) {
          havingConditions.push(combined);
        } else {
          whereConditions.push(combined);
        }
      }

      if (col.sort === "ASC" || col.sort === "DESC") {
        orderByItems.push((isAggregate ? expr : qualified) + " " + col.sort);
      }
    });
  }

  if (!selectItems.length) selectItems.push("*");

  const sqlLines = [];
  sqlLines.push("SELECT" + (queryDesignerState.distinct ? " DISTINCT" : ""));
  sqlLines.push("  " + selectItems.join(", "));

  // Multi-table topological join resolution:
  const joinedTables = new Set([baseTable]);
  sqlLines.push("FROM " + quoteSqlIdentifier(baseTable));

  const pendingJoins = [...(queryDesignerState.joins || []).filter(j => 
    selectedTables.includes(j.leftTable) && selectedTables.includes(j.rightTable)
  )];

  while (pendingJoins.length > 0) {
    let matchIdx = -1;
    let isReversed = false;

    for (let i = 0; i < pendingJoins.length; i++) {
      const j = pendingJoins[i];
      if (joinedTables.has(j.leftTable) && !joinedTables.has(j.rightTable)) {
        matchIdx = i;
        isReversed = false;
        break;
      } else if (joinedTables.has(j.rightTable) && !joinedTables.has(j.leftTable)) {
        matchIdx = i;
        isReversed = true;
        break;
      } else if (joinedTables.has(j.leftTable) && joinedTables.has(j.rightTable)) {
        matchIdx = i;
        isReversed = false;
        break;
      }
    }

    if (matchIdx !== -1) {
      const j = pendingJoins.splice(matchIdx, 1)[0];
      const rawJoinType = (j.type || "INNER").toUpperCase();

      if (joinedTables.has(j.leftTable) && joinedTables.has(j.rightTable)) {
        if (rawJoinType !== "CROSS") {
          whereConditions.push(quoteSqlIdentifier(j.leftTable) + "." + quoteSqlIdentifier(j.leftField) + " = " + quoteSqlIdentifier(j.rightTable) + "." + quoteSqlIdentifier(j.rightField));
        }
        continue;
      }

      if (isReversed) {
        let effType = "INNER";
        if (rawJoinType === "LEFT") effType = "RIGHT";
        else if (rawJoinType === "RIGHT") effType = "LEFT";
        else if (rawJoinType === "FULL" || rawJoinType === "FULL OUTER") effType = "FULL OUTER";
        else if (rawJoinType === "CROSS") effType = "CROSS";
        else effType = "INNER";

        if (effType === "CROSS") {
          sqlLines.push("CROSS JOIN " + quoteSqlIdentifier(j.leftTable));
        } else {
          sqlLines.push(effType + " JOIN " + quoteSqlIdentifier(j.leftTable) + " ON " + quoteSqlIdentifier(j.rightTable) + "." + quoteSqlIdentifier(j.rightField) + " = " + quoteSqlIdentifier(j.leftTable) + "." + quoteSqlIdentifier(j.leftField));
        }
        joinedTables.add(j.leftTable);
      } else {
        let effType = (rawJoinType === "FULL" || rawJoinType === "FULL OUTER") ? "FULL OUTER" : rawJoinType;
        if (effType === "CROSS") {
          sqlLines.push("CROSS JOIN " + quoteSqlIdentifier(j.rightTable));
        } else {
          sqlLines.push(effType + " JOIN " + quoteSqlIdentifier(j.rightTable) + " ON " + quoteSqlIdentifier(j.leftTable) + "." + quoteSqlIdentifier(j.leftField) + " = " + quoteSqlIdentifier(j.rightTable) + "." + quoteSqlIdentifier(j.rightField));
        }
        joinedTables.add(j.rightTable);
      }
    } else {
      const j = pendingJoins[0];
      sqlLines.push("CROSS JOIN " + quoteSqlIdentifier(j.leftTable));
      joinedTables.add(j.leftTable);
    }
  }

  selectedTables.forEach(t => {
    if (!joinedTables.has(t)) {
      sqlLines.push("CROSS JOIN " + quoteSqlIdentifier(t));
      joinedTables.add(t);
    }
  });

  if (whereConditions.length > 0) {
    sqlLines.push("WHERE " + whereConditions.join(" AND "));
  }

  if (showTotals && groupByItems.length > 0) {
    sqlLines.push("GROUP BY " + groupByItems.join(", "));
  }

  if (showTotals && havingConditions.length > 0) {
    sqlLines.push("HAVING " + havingConditions.join(" AND "));
  }

  if (orderByItems.length > 0) {
    sqlLines.push("ORDER BY " + orderByItems.join(", "));
  }

  if (queryDesignerState.topLimit && queryDesignerState.topLimit > 0) {
    sqlLines.push("LIMIT " + queryDesignerState.topLimit + ";");
  } else {
    sqlLines.push(";");
  }

  return sqlLines.join("\n");
}

function renderQueryDesigner() {
  const container = document.getElementById("designerContainer");
  if (!container) return;
  ensureQueryDesignerState();

  if (!currentSchema || (!currentSchema.tables && !currentSchema.views)) {
    container.innerHTML = '<div class="designer-empty">Load a schema from the sidebar to begin building a query.</div>';
    return;
  }

  const selectedTables = queryDesignerState.selectedTables || [];
  const tablesList = (currentSchema.tables || [])
    .map(t => t.name)
    .filter(name => !selectedTables.includes(name));
  const viewsList = (currentSchema.views || [])
    .map(v => v.name)
    .filter(name => !selectedTables.includes(name));

  // 1. Access Ribbon Toolbar
  const ribbonHtml = `
    <div class="qbe-ribbon">
      <div class="qbe-ribbon-group">
        <div class="qbe-view-switch">
          <button class="qbe-view-btn ${queryDesignerState.activeView === 'design' ? 'active' : ''}" onclick="setDesignerActiveView('design')" title="Design View (QBE Matrix & Relationships)">📐 Design</button>
          <button class="qbe-view-btn ${queryDesignerState.activeView === 'sql' ? 'active' : ''}" onclick="setDesignerActiveView('sql')" title="SQL View (Direct SQL Preview)">💻 SQL</button>
          <button class="qbe-view-btn ${queryDesignerState.activeView === 'datasheet' ? 'active' : ''}" onclick="setDesignerActiveView('datasheet')" title="Datasheet View (Live Data Results)">📋 Datasheet</button>
        </div>
        <div class="qbe-divider"></div>
        <button class="btn btn-sm qbe-btn-run" onclick="runDesignerQuery()" title="Run query and view Datasheet">! Run</button>
        <button class="qbe-btn-toggle ${queryDesignerState.showTotals ? 'active' : ''}" onclick="toggleDesignerTotals()" title="Toggle Totals (Group By, Sum, Avg, Count, etc.)">Σ Totals</button>
        <button class="qbe-btn-toggle ${queryDesignerState.distinct ? 'active' : ''}" onclick="toggleDesignerDistinct()" title="Unique Values (SELECT DISTINCT)">Distinct</button>
        <span style="font-size: 11px; color: var(--text-dim); margin-left: 2px;">Top:</span>
        <select class="qbe-select" onchange="setDesignerTopLimit(this.value)" style="width: 80px;">
          <option value="0" ${queryDesignerState.topLimit === 0 ? 'selected' : ''}>All</option>
          <option value="5" ${queryDesignerState.topLimit === 5 ? 'selected' : ''}>5</option>
          <option value="10" ${queryDesignerState.topLimit === 10 ? 'selected' : ''}>10</option>
          <option value="25" ${queryDesignerState.topLimit === 25 ? 'selected' : ''}>25</option>
          <option value="50" ${queryDesignerState.topLimit === 50 ? 'selected' : ''}>50</option>
          <option value="100" ${queryDesignerState.topLimit === 100 ? 'selected' : ''}>100</option>
          <option value="500" ${queryDesignerState.topLimit === 500 ? 'selected' : ''}>500</option>
          <option value="1000" ${queryDesignerState.topLimit === 1000 ? 'selected' : ''}>1000</option>
        </select>
        <select id="designerPresetSelect" class="qbe-select" onchange="applyDesignerPreset(this.value); this.value='';" style="max-width: 175px; font-weight: 600; color: var(--amber);">
          <option value="">⚡ Presets / Templates</option>
          <option value="ecommerce_multi">🛒 4-Table E-Commerce (Full Relational)</option>
          <option value="top_spenders">Top Spenders (Aggregated)</option>
          <option value="join_left">Access 2: Customers (LEFT JOIN)</option>
          <option value="join_right">Access 3: Orders (RIGHT JOIN)</option>
          <option value="join_full">Access 4: Customers & Orders (FULL OUTER)</option>
          <option value="join_cross">Access 5: Cross Cartesian Product</option>
          <option value="low_stock">Low Stock Restock Alerts</option>
          <option value="orders_status">Active Orders Pipeline</option>
          <option value="blank">Blank Query (Reset)</option>
        </select>
      </div>
      <div class="qbe-ribbon-group">
        <select id="designerTablePicker" class="qbe-select" style="max-width: 155px;">
          <option value="">+ Add Table / View</option>
          ${tablesList.length ? `<optgroup label="📋 Tables">${tablesList.map(name => `<option value="${escapeHtml(name)}">${escapeHtml(name)}</option>`).join('')}</optgroup>` : ''}
          ${viewsList.length ? `<optgroup label="👁️ Views">${viewsList.map(name => `<option value="${escapeHtml(name)}">${escapeHtml(name)} (View)</option>`).join('')}</optgroup>` : ''}
        </select>
        <button class="btn btn-sm" onclick="addDesignerTableFromPicker()">Add</button>
        <button class="btn btn-sm" onclick="openJoinPropertiesModal()" title="Open Microsoft Access Join Properties dialog">+ Link / Join</button>
        <button class="btn btn-sm" onclick="autoJoinDesignerTables()" title="Auto-detect relationships between tables across full schema graph">⚡ Auto-Detect Joins</button>
        <button class="btn btn-sm" onclick="autoArrangeDesignerTables()" title="Auto-arrange table layout on relationship canvas">📐 Auto-Arrange</button>
        <button class="btn btn-sm" onclick="addDesignerQbeColumn()" title="Add custom column to QBE grid">+ Column</button>
        <button class="btn btn-sm" onclick="clearDesignerQbe()" title="Clear QBE columns">Clear</button>
        <button class="btn btn-sm" onclick="toggleSidebarCollapse()" title="Toggle sidebar to maximize screen room for visual designer">◀▶ Sidebar</button>
        <button class="btn btn-sm" onclick="saveDesignerQuery()" title="Save query in workspace memory">💾 Save</button>
        <button class="btn btn-sm" onclick="saveDesignerAsView()" title="Persist this query as a permanent SQL VIEW in the database">👁️ Create View</button>
      </div>
    </div>
  `;

  // 2. View: SQL View
  if (queryDesignerState.activeView === "sql") {
    const sqlPreview = buildDesignerSql();
    const savedList = (queryDesignerState.savedQueries || []).map((item, idx) => `
      <div class="qbe-saved-chip">
        <button class="btn btn-sm" onclick="loadSavedDesignerQuery(${idx})" title="Click to load saved SQL">${escapeHtml(item.name)}</button>
        <button class="sidebar-mini-btn" onclick="deleteSavedDesignerQuery(${idx})" title="Delete saved query">✕</button>
      </div>
    `).join('') || '<span style="color: var(--text-dim); font-size: 11px;">No saved queries yet.</span>';

    container.innerHTML = ribbonHtml + `
      <div class="designer-sql-panel">
        <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap: wrap; gap: 6px;">
          <div style="display: flex; align-items: center; gap: 8px;">
            <div class="card-title" style="margin-bottom:0;">Generated Microsoft Access-Compatible SQL (PostgreSQL Pro)</div>
            <div style="display: flex; align-items: center; gap: 4px; background: rgba(0,0,0,0.3); padding: 2px 6px; border-radius: 4px; border: 1px solid var(--border-subtle);">
              <span style="font-size: 10px; color: var(--text-dim);">Text:</span>
              <button class="btn btn-sm" onclick="adjustSqlFontSize(-1)" title="Decrease font size" style="padding: 1px 5px; font-size: 10px;">A−</button>
              <span id="sqlFontBadge" style="font-size: 10px; color: var(--cyan); font-family: var(--font-mono);">${queryDesignerState.sqlFontSize || 13}px</span>
              <button class="btn btn-sm" onclick="adjustSqlFontSize(1)" title="Increase font size" style="padding: 1px 5px; font-size: 10px;">A+</button>
              <button class="btn btn-sm" onclick="toggleSqlEditorHeight()" title="Expand / shrink editor height" style="padding: 1px 6px; font-size: 10px;">↕ Resize Editor</button>
            </div>
          </div>
          <div style="display:flex; gap:6px;">
            <button class="btn btn-sm btn-primary" onclick="runCustomDesignerSql()" title="Execute SQL directly in Datasheet">! Run Edited SQL</button>
            <button class="btn btn-sm" onclick="resetDesignerSqlToQbe()" title="Reset SQL back to QBE generated SQL">🔄 Reset from QBE</button>
            <button class="btn btn-sm" onclick="loadDesignerSqlToEditor()">Load into Editor</button>
            <button class="btn btn-sm" onclick="copyDesignerSql()">Copy SQL</button>
            <button class="btn btn-sm" onclick="explainDesignerQuery()">Explain Plan</button>
          </div>
        </div>
        <textarea class="designer-sql-preview" id="designerSqlPreview" style="font-size: ${queryDesignerState.sqlFontSize || 13}px;" placeholder="Write or edit SQL statement..." onkeydown="if((event.metaKey||event.ctrlKey)&&event.key==='Enter') runCustomDesignerSql()">${escapeHtml(sqlPreview)}</textarea>
        <div style="margin-top: 8px;">
          <div style="font-size: 11px; color: var(--text-dim); margin-bottom: 6px; font-weight: 600;">Saved Queries:</div>
          <div style="display: flex; flex-wrap: wrap; gap: 6px;">${savedList}</div>
        </div>
      </div>
    `;
    return;
  }

  // 3. View: Datasheet View
  if (queryDesignerState.activeView === "datasheet") {
    const ds = queryDesignerState.datasheet;
    let contentHtml = "";

    if (queryDesignerState.datasheetLoading) {
      contentHtml = `
        <div class="designer-empty">
          <div style="display: flex; flex-direction: column; align-items: center; gap: 10px;">
            <div style="font-size: 20px;">⚡</div>
            <div>Executing query against PostgreSQL database...</div>
          </div>
        </div>
      `;
    } else if (ds && ds.error) {
      contentHtml = `
        <div style="padding: 20px;">
          <div class="card" style="border-color: var(--rose);">
            <div class="card-title" style="color: var(--rose);">⚠️ Query Execution Error</div>
            <div style="font-family: var(--font-mono); font-size: 12px; color: var(--text-main); margin: 8px 0;">${ds.error}</div>
            <button class="btn btn-sm btn-primary" onclick="setDesignerActiveView('design')">Return to Design View</button>
          </div>
        </div>
      `;
    } else if (ds && ds.rows) {
      const rows = ds.rows;
      const cols = ds.columns || (rows.length ? Object.keys(rows[0]) : []);

      contentHtml = `
        <div class="grid-table-container" style="flex: 1;">
          <table class="data-grid">
            <thead>
              <tr>
                <th style="width: 40px; text-align: center;">#</th>
                ${cols.map(c => `<th>${c}</th>`).join('')}
              </tr>
            </thead>
            <tbody>
              ${rows.length === 0 ? '<tr><td colspan="' + (cols.length + 1) + '" style="text-align:center; color:var(--text-dim); padding:20px;">0 records returned</td></tr>' : rows.map((r, idx) => `
                <tr>
                  <td style="color: var(--text-dim); font-size: 10px; text-align: center;">${idx + 1}</td>
                  ${cols.map(c => `<td>${r[c] !== null && r[c] !== undefined ? escapeHtml(String(r[c])) : '<span style="color:var(--text-dim);">NULL</span>'}</td>`).join('')}
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
      `;
    } else {
      contentHtml = `
        <div class="designer-empty">
          <div>Click <strong>! Run</strong> to execute your query and view live data.</div>
        </div>
      `;
    }

    container.innerHTML = ribbonHtml + `
      <div class="qbe-datasheet-container">
        <div class="qbe-datasheet-toolbar">
          <div style="display: flex; align-items: center; gap: 8px; flex-wrap: wrap;">
            <span style="font-weight: 700; color: var(--cyan);">📋 Datasheet View</span>
            ${ds ? `<span style="font-size: 10px; background: rgba(56, 189, 248, 0.15); color: var(--cyan); padding: 2px 6px; border-radius: 4px; font-family: var(--font-mono);">${ds.rows.length} rows (${ds.latencyMs}ms)</span>` : ''}
            <input type="text" placeholder="🔍 Filter rows..." oninput="filterDesignerDatasheet(this.value)" style="padding: 4px 8px; font-size: 11px; background: rgba(0,0,0,0.3); border: 1px solid var(--border-subtle); border-radius: 4px; color: var(--text-main); width: 130px; outline: none;">
            <!-- Datasheet Density & Font -->
            <div style="display: flex; align-items: center; gap: 4px; background: rgba(0,0,0,0.3); padding: 2px 6px; border-radius: 4px; border: 1px solid var(--border-subtle);">
              <span style="font-size: 10px; color: var(--text-dim);">Density:</span>
              <button class="btn btn-sm ${queryDesignerState.datasheetDensity === 'compact' ? 'btn-primary' : ''}" onclick="setDatasheetDensity('compact')" style="padding: 1px 5px; font-size: 10px;">Compact</button>
              <button class="btn btn-sm ${!queryDesignerState.datasheetDensity || queryDesignerState.datasheetDensity === 'normal' ? 'btn-primary' : ''}" onclick="setDatasheetDensity('normal')" style="padding: 1px 5px; font-size: 10px;">Normal</button>
              <button class="btn btn-sm ${queryDesignerState.datasheetDensity === 'spacious' ? 'btn-primary' : ''}" onclick="setDatasheetDensity('spacious')" style="padding: 1px 5px; font-size: 10px;">Spacious</button>
              <span style="font-size: 10px; color: var(--text-dim); margin-left: 4px;">Text:</span>
              <button class="btn btn-sm" onclick="adjustDatasheetFontSize(-1)" style="padding: 1px 5px; font-size: 10px;">A−</button>
              <span id="dsFontBadge" style="font-size: 10px; color: var(--cyan); font-family: var(--font-mono);">${queryDesignerState.datasheetFontSize || 11}px</span>
              <button class="btn btn-sm" onclick="adjustDatasheetFontSize(1)" style="padding: 1px 5px; font-size: 10px;">A+</button>
            </div>
          </div>
          <div style="display: flex; gap: 6px;">
            <button class="btn btn-sm" onclick="exportDesignerDatasheet('csv')" title="Download as CSV">Export CSV</button>
            <button class="btn btn-sm" onclick="exportDesignerDatasheet('json')" title="Download as JSON">Export JSON</button>
            <button class="btn btn-sm" onclick="copyDesignerDatasheetMarkdown()" title="Copy as Markdown table">📋 Markdown</button>
            <button class="btn btn-sm" onclick="copyDesignerDatasheetSqlInsert()" title="Copy as SQL INSERT statements">📥 SQL Inserts</button>
            <button class="btn btn-sm btn-primary" onclick="setDesignerActiveView('design')">📐 Design View</button>
          </div>
        </div>
        ${contentHtml}
      </div>
    `;
    return;
  }

  // 4. View: Design View (Access Workbench + QBE Grid)
  const tableCardsHtml = selectedTables.map(tableName => {
    const meta = getEntityMeta(tableName);
    if (!meta) return "";
    const isView = (currentSchema.views || []).some(v => v.name === tableName);
    const icon = isView ? '👁️' : '🗄️';
    const pos = (queryDesignerState.tablePositions && queryDesignerState.tablePositions[tableName]) || { x: 20, y: 15 };
    const cardStyle = `position: absolute; left: ${pos.x}px; top: ${pos.y}px; width: 230px;`;
    const columnsHtml = (meta.columns || []).map(c => {
      const typeDisplay = formatPgTypeShort(c.type || 'ANY');
      return `
      <div class="qbe-field-row" id="qbeFieldRow_${tableName}_${c.name}" draggable="true" ondragstart="onDesignerFieldDragStart(event, '${tableName}', '${c.name}')" ondragover="onDesignerFieldDragOver(event)" ondragenter="onDesignerFieldDragEnter(event, '${tableName}', '${c.name}')" ondragleave="onDesignerFieldDragLeave(event)" ondrop="onDesignerFieldDrop(event, '${tableName}', '${c.name}')" onclick="addDesignerQbeColumn('${tableName}', '${c.name}')" title="Drag to another field to link, or click to add to QBE Grid (${c.type || 'ANY'})">
        <div style="display: flex; align-items: center; gap: 6px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; flex: 1; min-width: 0;">
          <span class="qbe-field-connector" title="Drag to link this field">●</span>
          <span style="overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${c.pk ? '🔑 ' : ''}${c.name}</span>
        </div>
        <div style="display: flex; align-items: center; gap: 4px; flex-shrink: 0;">
          <span style="font-size: 9px; color: var(--text-dim); max-width: 65px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; display: inline-block;" title="${c.type || 'ANY'}">${typeDisplay}</span>
          <span class="qbe-field-add-icon">+</span>
        </div>
      </div>
    `;
    }).join('');

    return `
      <div class="qbe-table-card" id="qbeTableCard_${tableName}" style="${cardStyle}">
        <div class="qbe-table-card-header" onmousedown="onDesignerTableHeaderMouseDown(event, '${tableName}')" title="Drag header to move table on canvas">
          <span style="pointer-events: none;">${icon} ${tableName}${isView ? ' <span style="font-size: 9px; opacity: 0.7; font-weight: normal;">(view)</span>' : ''}</span>
          <button class="sidebar-mini-btn" onclick="removeDesignerTable('${tableName}')" title="Remove table">✕</button>
        </div>
        <div class="qbe-table-card-fields">${columnsHtml}</div>
      </div>
    `;
  }).join('') || `
    <div style="display: flex; flex-direction: column; align-items: center; justify-content: center; padding: 22px 16px; background: rgba(255, 255, 255, 0.02); border: 1px dashed var(--border-subtle); border-radius: 8px; text-align: center; width: 100%;">
      <div style="font-size: 22px; margin-bottom: 6px;">🗂️</div>
      <div style="font-weight: 700; font-size: 13px; color: var(--text-main); margin-bottom: 4px;">Relationship Canvas Ready</div>
      <div style="font-size: 11px; color: var(--text-dim); max-width: 440px; margin-bottom: 12px;">Add tables using the &quot;+ Add Table&quot; selector above or load a pre-configured template:</div>
      <div style="display: flex; gap: 8px; flex-wrap: wrap; justify-content: center;">
        <button class="btn btn-sm" onclick="applyDesignerPreset('ecommerce_multi')" title="Load 4-table relational e-commerce query">🛒 4-Table E-Commerce</button>
        <button class="btn btn-sm" onclick="applyDesignerPreset('top_spenders')" title="Load Customer + Orders join query">🌟 Top Spenders</button>
        <button class="btn btn-sm" onclick="applyDesignerPreset('join_left')" title="Access 2: Customers (LEFT JOIN)">Access 2: Customers (LEFT)</button>
        <button class="btn btn-sm" onclick="applyDesignerPreset('join_right')" title="Access 3: Orders (RIGHT JOIN)">Access 3: Orders (RIGHT)</button>
        <button class="btn btn-sm" onclick="applyDesignerPreset('join_full')" title="Access 4: Customers & Orders (FULL JOIN)">Access 4: Customers & Orders (FULL)</button>
        <button class="btn btn-sm" onclick="applyDesignerPreset('low_stock')" title="Load Products restock alert">📦 Low Stock Alerts</button>
        <button class="btn btn-sm" onclick="applyDesignerPreset('orders_status')" title="Load Orders pipeline">📈 Orders Pipeline</button>
      </div>
    </div>
  `;

  // Multi-table Topology Status
  const activeJoins = queryDesignerState.joins || [];
  const tablesInJoins = new Set();
  activeJoins.forEach(j => {
    tablesInJoins.add(j.leftTable);
    tablesInJoins.add(j.rightTable);
  });
  const unconnectedTables = selectedTables.filter(t => !tablesInJoins.has(t) && selectedTables.length > 1);

  let topologyStatusHtml = "";
  if (selectedTables.length > 1) {
    if (unconnectedTables.length === 0) {
      topologyStatusHtml = `
        <div style="display: inline-flex; align-items: center; gap: 5px; font-size: 10px; color: var(--emerald); background: rgba(16, 185, 129, 0.1); padding: 2px 8px; border-radius: 4px; border: 1px solid rgba(16, 185, 129, 0.3);">
          <span style="display:inline-block; width:6px; height:6px; border-radius:50%; background:var(--emerald);"></span>
          <span>All ${selectedTables.length} tables connected in relational graph</span>
        </div>
      `;
    } else {
      topologyStatusHtml = `
        <div style="display: inline-flex; align-items: center; gap: 6px; font-size: 10px; color: var(--amber); background: rgba(245, 158, 11, 0.1); padding: 2px 8px; border-radius: 4px; border: 1px solid rgba(245, 158, 11, 0.3);">
          <span>⚠️ ${unconnectedTables.join(', ')} unconnected</span>
          <button class="btn btn-sm" onclick="autoJoinDesignerTables()" style="padding: 1px 6px; font-size: 9px;">⚡ Auto-Detect Joins</button>
        </div>
      `;
    }
  }

  // Active Joins Strip with Editable Tables & Fields
  const joinsHtml = activeJoins.map(join => {
    const leftMeta = getEntityMeta(join.leftTable);
    const rightMeta = getEntityMeta(join.rightTable);
    const leftFields = leftMeta && leftMeta.columns ? leftMeta.columns.map(c => c.name) : [];
    const rightFields = rightMeta && rightMeta.columns ? rightMeta.columns.map(c => c.name) : [];
    const joinTypes = [
      { val: "INNER", label: "1: Only matching rows (INNER)" },
      { val: "LEFT", label: "2: ALL records from " + join.leftTable + " (LEFT)" },
      { val: "RIGHT", label: "3: ALL records from " + join.rightTable + " (RIGHT)" },
      { val: "FULL", label: "4: ALL records from BOTH (FULL OUTER)" },
      { val: "CROSS", label: "5: Cartesian product (CROSS)" },
    ];

    return `
      <div class="qbe-join-badge">
        <button class="btn btn-sm" onclick="openJoinPropertiesModal('${join.key}')" title="Configure in Microsoft Access Join Properties dialog" style="padding: 2px 7px; font-size: 10px; font-weight: 700; color: var(--cyan); border-color: rgba(56, 189, 248, 0.4);">📐 Properties</button>
        <select class="qbe-select" onchange="updateDesignerJoin('${join.key}', 'type', this.value)" style="font-weight: 600; color: var(--cyan);">
          ${joinTypes.map(j => `<option value="${j.val}" ${join.type === j.val ? 'selected' : ''}>${j.label}</option>`).join('')}
        </select>
        <select class="qbe-select" onchange="updateDesignerJoinTable('${join.key}', 'leftTable', this.value)" style="font-weight: 700; color: var(--text-main);">
          ${selectedTables.map(t => `<option value="${t}" ${join.leftTable === t ? 'selected' : ''}>${t}</option>`).join('')}
        </select>
        <span style="color: var(--text-dim); font-weight: bold;">.</span>
        <select class="qbe-select" onchange="updateDesignerJoin('${join.key}', 'leftField', this.value)">
          ${leftFields.map(f => `<option value="${f}" ${join.leftField === f ? 'selected' : ''}>${f}</option>`).join('')}
        </select>
        <span style="color: var(--cyan); font-weight: bold; margin: 0 4px;">=</span>
        <select class="qbe-select" onchange="updateDesignerJoinTable('${join.key}', 'rightTable', this.value)" style="font-weight: 700; color: var(--text-main);">
          ${selectedTables.map(t => `<option value="${t}" ${join.rightTable === t ? 'selected' : ''}>${t}</option>`).join('')}
        </select>
        <span style="color: var(--text-dim); font-weight: bold;">.</span>
        <select class="qbe-select" onchange="updateDesignerJoin('${join.key}', 'rightField', this.value)">
          ${rightFields.map(f => `<option value="${f}" ${join.rightField === f ? 'selected' : ''}>${f}</option>`).join('')}
        </select>
        <button class="sidebar-mini-btn" onclick="removeDesignerJoin('${join.key}')" title="Delete join">✕</button>
      </div>
    `;
  }).join('') || '<div style="color: var(--text-dim); font-size: 11px;">No relationships active. Click <strong>⚡ Auto-Detect Joins</strong> or <strong>+ Link / Join</strong>.</div>';

  // Lower Pane: Classic Microsoft Access QBE Matrix
  const columns = queryDesignerState.columns || [];
  const totalsList = ["GroupBy", "Sum", "Avg", "Min", "Max", "Count", "Where", "Expression"];

  // Generate rows of the matrix
  const headerRow = `
    <tr>
      <td class="qbe-matrix-header-cell">Field:</td>
      ${columns.map(col => {
        const tableMeta = getEntityMeta(col.table);
        const fields = tableMeta && tableMeta.columns ? tableMeta.columns.map(c => c.name) : [];
        return `
          <td class="qbe-matrix-col-cell">
            <select onchange="updateDesignerQbeColumn('${col.id}', 'field', this.value)" style="font-weight: 600; color: var(--cyan);">
              <option value="*" ${col.field === '*' ? 'selected' : ''}>* (All Fields)</option>
              ${fields.map(f => `<option value="${f}" ${col.field === f ? 'selected' : ''}>${f}</option>`).join('')}
            </select>
          </td>
        `;
      }).join('')}
      <td class="qbe-matrix-col-cell" style="width: 60px; min-width: 60px; text-align: center;"></td>
    </tr>
  `;

  const tableRow = `
    <tr>
      <td class="qbe-matrix-header-cell">Table:</td>
      ${columns.map(col => `
        <td class="qbe-matrix-col-cell">
          <select onchange="updateDesignerQbeColumn('${col.id}', 'table', this.value)">
            ${selectedTables.map(t => `<option value="${t}" ${col.table === t ? 'selected' : ''}>${t}</option>`).join('')}
          </select>
        </td>
      `).join('')}
      <td class="qbe-matrix-col-cell"></td>
    </tr>
  `;

  const totalRow = queryDesignerState.showTotals ? `
    <tr style="background: rgba(56, 189, 248, 0.03);">
      <td class="qbe-matrix-header-cell" style="color: var(--emerald);">Σ Total:</td>
      ${columns.map(col => `
        <td class="qbe-matrix-col-cell">
          <select onchange="updateDesignerQbeColumn('${col.id}', 'total', this.value)" style="font-weight: 600; color: ${col.total === 'GroupBy' ? 'var(--cyan)' : (['Sum', 'Count', 'Avg'].includes(col.total) ? 'var(--emerald)' : 'var(--text-main)')};">
            ${totalsList.map(tot => `<option value="${tot}" ${col.total === tot ? 'selected' : ''}>${tot}</option>`).join('')}
          </select>
        </td>
      `).join('')}
      <td class="qbe-matrix-col-cell"></td>
    </tr>
  ` : "";

  const sortRow = `
    <tr>
      <td class="qbe-matrix-header-cell">Sort:</td>
      ${columns.map(col => `
        <td class="qbe-matrix-col-cell">
          <select onchange="updateDesignerQbeColumn('${col.id}', 'sort', this.value)">
            <option value="" ${!col.sort ? 'selected' : ''}>(not sorted)</option>
            <option value="ASC" ${col.sort === 'ASC' ? 'selected' : ''}>Ascending</option>
            <option value="DESC" ${col.sort === 'DESC' ? 'selected' : ''}>Descending</option>
          </select>
        </td>
      `).join('')}
      <td class="qbe-matrix-col-cell"></td>
    </tr>
  `;

  const showRow = `
    <tr>
      <td class="qbe-matrix-header-cell">Show:</td>
      ${columns.map(col => `
        <td class="qbe-matrix-col-cell qbe-show-checkbox">
          <input type="checkbox" ${col.show !== false ? 'checked' : ''} onchange="updateDesignerQbeColumn('${col.id}', 'show', this.checked)">
        </td>
      `).join('')}
      <td class="qbe-matrix-col-cell"></td>
    </tr>
  `;

  const criteriaRow = `
    <tr>
      <td class="qbe-matrix-header-cell">Criteria:</td>
      ${columns.map(col => `
        <td class="qbe-matrix-col-cell">
          <input value="${(col.criteria || '').replace(/"/g, '&quot;')}" placeholder="e.g. > 100, VIP" onchange="updateDesignerQbeColumn('${col.id}', 'criteria', this.value)">
        </td>
      `).join('')}
      <td class="qbe-matrix-col-cell"></td>
    </tr>
  `;

  const or1Row = `
    <tr>
      <td class="qbe-matrix-header-cell" style="color: var(--text-dim); font-size: 10px;">or:</td>
      ${columns.map(col => `
        <td class="qbe-matrix-col-cell">
          <input value="${(col.or1 || '').replace(/"/g, '&quot;')}" placeholder="or condition" onchange="updateDesignerQbeColumn('${col.id}', 'or1', this.value)">
        </td>
      `).join('')}
      <td class="qbe-matrix-col-cell"></td>
    </tr>
  `;

  const or2Row = `
    <tr>
      <td class="qbe-matrix-header-cell" style="color: var(--text-dim); font-size: 10px;">or:</td>
      ${columns.map(col => `
        <td class="qbe-matrix-col-cell">
          <input value="${(col.or2 || '').replace(/"/g, '&quot;')}" placeholder="or condition" onchange="updateDesignerQbeColumn('${col.id}', 'or2', this.value)">
        </td>
      `).join('')}
      <td class="qbe-matrix-col-cell"></td>
    </tr>
  `;

  const actionsRow = `
    <tr>
      <td class="qbe-matrix-header-cell" style="color: var(--text-dim); font-size: 10px;">Order / Del:</td>
      ${columns.map((col, idx) => `
        <td class="qbe-matrix-col-cell" style="text-align: center;">
          <button class="sidebar-mini-btn" onclick="moveDesignerQbeColumn('${col.id}', -1)" ${idx === 0 ? 'disabled' : ''} title="Move left">◀</button>
          <button class="sidebar-mini-btn" onclick="moveDesignerQbeColumn('${col.id}', 1)" ${idx === columns.length - 1 ? 'disabled' : ''} title="Move right">▶</button>
          <button class="sidebar-mini-btn" onclick="removeDesignerQbeColumn('${col.id}')" title="Remove column">✕</button>
        </td>
      `).join('')}
      <td class="qbe-matrix-col-cell" style="text-align: center;">
        <button class="btn btn-sm btn-primary" onclick="addDesignerQbeColumn()" title="Add column">+ Add</button>
      </td>
    </tr>
  `;

  const maxCanvasWidth = Math.max(
    800,
    selectedTables.reduce((max, t) => {
      const p = (queryDesignerState.tablePositions && queryDesignerState.tablePositions[t]) || { x: 20 };
      return Math.max(max, p.x + 280);
    }, 600)
  );

  container.innerHTML = ribbonHtml + `
    <!-- Upper Relationship Workbench -->
    <div class="qbe-workbench">
      <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 6px; flex-wrap: wrap; gap: 6px;">
        <div style="display: flex; align-items: center; gap: 8px;">
          <span style="font-size: 11px; font-weight: 700; color: var(--text-dim); text-transform: uppercase; letter-spacing: 0.5px;">Microsoft Access Relationship Canvas</span>
          <span style="font-size: 10px; color: var(--text-dim);">(Drag headers to position, drag field to field to join, scroll or Ctrl+Wheel to zoom, drag empty space to pan)</span>
        </div>
        <div style="display: flex; align-items: center; gap: 8px; flex-wrap: wrap;">
          <!-- Zoom Controls -->
          <div class="qbe-zoom-controls" style="background: rgba(0,0,0,0.3); padding: 2px 6px; border-radius: 4px; border: 1px solid var(--border-subtle);">
            <span style="font-size: 10px; color: var(--text-dim); margin-right: 2px;">Zoom:</span>
            <button class="btn btn-sm" onclick="zoomOutDesignerCanvas()" title="Zoom out canvas (Ctrl + Wheel Down)" style="padding: 1px 6px; font-size: 11px;">🔍−</button>
            <select id="canvasZoomSelect" class="qbe-select" onchange="setDesignerCanvasZoom(parseFloat(this.value))" style="padding: 1px 4px; font-size: 10px; width: 62px; height: 22px;">
              <option value="0.5" ${queryDesignerState.canvasZoom === 0.5 ? 'selected' : ''}>50%</option>
              <option value="0.75" ${queryDesignerState.canvasZoom === 0.75 ? 'selected' : ''}>75%</option>
              <option value="0.9" ${queryDesignerState.canvasZoom === 0.9 ? 'selected' : ''}>90%</option>
              <option value="1" ${!queryDesignerState.canvasZoom || queryDesignerState.canvasZoom === 1 ? 'selected' : ''}>100%</option>
              <option value="1.25" ${queryDesignerState.canvasZoom === 1.25 ? 'selected' : ''}>125%</option>
              <option value="1.5" ${queryDesignerState.canvasZoom === 1.5 ? 'selected' : ''}>150%</option>
              <option value="2" ${queryDesignerState.canvasZoom === 2 ? 'selected' : ''}>200%</option>
            </select>
            <button class="btn btn-sm" onclick="zoomInDesignerCanvas()" title="Zoom in canvas (Ctrl + Wheel Up)" style="padding: 1px 6px; font-size: 11px;">🔍+</button>
            <button class="btn btn-sm" onclick="resetDesignerCanvasZoom()" title="Reset zoom to 100%" style="padding: 1px 6px; font-size: 10px;">1:1</button>
            <button class="btn btn-sm" onclick="fitDesignerCanvasZoom()" title="Fit all tables into viewport" style="padding: 1px 6px; font-size: 10px;">🎯 Fit</button>
          </div>

          <!-- Room Controls -->
          <div class="qbe-room-controls" style="background: rgba(0,0,0,0.3); padding: 2px 6px; border-radius: 4px; border: 1px solid var(--border-subtle);">
            <span style="font-size: 10px; color: var(--text-dim); margin-right: 2px;">Room:</span>
            <button id="btnRoomCanvas" class="btn btn-sm ${queryDesignerState.canvasViewMode === 'canvas-max' ? 'btn-primary' : ''}" onclick="setDesignerRoomMode('canvas-max')" title="Maximize Canvas room" style="padding: 1px 6px; font-size: 10px;">⤢ Canvas</button>
            <button id="btnRoomSplit" class="btn btn-sm ${!queryDesignerState.canvasViewMode || queryDesignerState.canvasViewMode === 'split' ? 'btn-primary' : ''}" onclick="setDesignerRoomMode('split')" title="Balanced Split room" style="padding: 1px 6px; font-size: 10px;">⤡ Split</button>
            <button id="btnRoomGrid" class="btn btn-sm ${queryDesignerState.canvasViewMode === 'grid-max' ? 'btn-primary' : ''}" onclick="setDesignerRoomMode('grid-max')" title="Maximize Grid room" style="padding: 1px 6px; font-size: 10px;">⤢ Grid</button>
          </div>

          <button class="btn btn-sm" onclick="autoArrangeDesignerTables()" style="padding: 1px 7px; font-size: 10px;" title="Reset and arrange cards neatly">📐 Reset</button>
          <span style="font-size: 10px; color: var(--cyan); font-weight: 600;">${selectedTables.length} Tables Active</span>
        </div>
      </div>
      <div class="qbe-canvas-viewport qbe-viewport" id="qbeCanvasViewport" onscroll="updateCanvasSvg()" style="height: ${queryDesignerState.canvasHeight || 480}px; max-height: ${queryDesignerState.canvasHeight || 480}px;">
        <div class="qbe-canvas-stage" id="qbeCanvasStage" style="transform: scale(${queryDesignerState.canvasZoom || 1.0});">
          <svg class="qbe-canvas-svg" id="qbeCanvasSvg"></svg>
          <div class="qbe-tables-canvas" id="qbeTablesCanvas" style="min-width: ${maxCanvasWidth}px;">
            ${tableCardsHtml}
          </div>
        </div>
      </div>
      <div class="qbe-joins-bar">
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 4px;">
          <div style="font-size: 10px; font-weight: 700; color: var(--text-dim);">JOIN PROPERTIES &amp; RELATIONSHIPS (${activeJoins.length} Active):</div>
          ${topologyStatusHtml}
        </div>
        ${joinsHtml}
      </div>
    </div>

    <!-- Draggable Resizer Splitter -->
    <div class="qbe-resizer-bar" id="qbeResizerBar" title="Drag to resize Canvas vs Grid room (200px - 1200px)">
      <div class="qbe-resizer-handle"></div>
    </div>

    <!-- Lower QBE Design Grid -->
    <div style="display: flex; justify-content: space-between; align-items: center; margin-top: 4px; flex-wrap: wrap; gap: 6px;">
      <div style="display: flex; align-items: center; gap: 8px;">
        <span style="font-size: 11px; font-weight: 700; color: var(--text-dim);">QUERY BY EXAMPLE (QBE) DESIGN GRID</span>
        <button class="btn btn-sm" onclick="toggleCriteriaHelp()" style="padding: 2px 8px; font-size: 10px;" title="View Microsoft Access &amp; PostgreSQL Criteria Syntax">💡 Syntax Help</button>
      </div>
      <div style="display: flex; align-items: center; gap: 8px;">
        <div style="display: flex; align-items: center; gap: 4px; background: rgba(0,0,0,0.3); padding: 2px 6px; border-radius: 4px; border: 1px solid var(--border-subtle);">
          <span style="font-size: 10px; color: var(--text-dim);">Grid Density:</span>
          <button class="btn btn-sm ${queryDesignerState.gridDensity === 'compact' ? 'btn-primary' : ''}" onclick="setQbeGridDensity('compact')" style="padding: 1px 5px; font-size: 10px;">Compact</button>
          <button class="btn btn-sm ${!queryDesignerState.gridDensity || queryDesignerState.gridDensity === 'normal' ? 'btn-primary' : ''}" onclick="setQbeGridDensity('normal')" style="padding: 1px 5px; font-size: 10px;">Normal</button>
          <button class="btn btn-sm ${queryDesignerState.gridDensity === 'spacious' ? 'btn-primary' : ''}" onclick="setQbeGridDensity('spacious')" style="padding: 1px 5px; font-size: 10px;">Spacious</button>
        </div>
        <span style="font-size: 10px; color: var(--text-dim);">${columns.length} columns defined</span>
      </div>
    </div>
    <div id="criteriaHelpBanner" style="display: none; background: rgba(15, 23, 42, 0.95); border: 1px solid var(--border-subtle); border-radius: 6px; padding: 8px 12px; margin: 4px 0 8px; font-size: 11px; color: var(--text-muted); line-height: 1.6;">
      <strong style="color: var(--cyan);">Access &amp; PostgreSQL Criteria Cheat Sheet:</strong><br>
      • <strong>Comparison:</strong> <code>&gt; 100</code>, <code>&lt;= 50</code>, <code>&lt;&gt; 'cancelled'</code>, <code>!= 'inactive'</code><br>
      • <strong>Ranges:</strong> <code>BETWEEN 10 AND 50</code><br>
      • <strong>Pattern Matches:</strong> <code>LIKE 'A%'</code> (starts with A), <code>ILIKE '%corp%'</code> (case-insensitive contains corp)<br>
      • <strong>Sets &amp; Nulls:</strong> <code>IN ('VIP', 'Enterprise')</code>, <code>IS NULL</code>, <code>IS NOT NULL</code><br>
      • <strong>Text Literals:</strong> <code>VIP</code> or <code>'VIP'</code> (quotes auto-formatted if omitted)
    </div>
    <div class="qbe-matrix-container">
      <table class="qbe-matrix-table">
        <tbody>
          ${headerRow}
          ${tableRow}
          ${totalRow}
          ${sortRow}
          ${showRow}
          ${criteriaRow}
          ${or1Row}
          ${or2Row}
          ${actionsRow}
        </tbody>
      </table>
    </div>
  `;
  setTimeout(() => {
    updateCanvasSvg();
    initQbeSplitter();
    initCanvasPanAndZoom();
  }, 35);
}
