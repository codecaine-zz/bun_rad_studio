# 🔄 Data Converter Studio -- User Guide

**Data Converter Studio** is a multi-format bidirectional data transformer. Designed for data engineering, migrations, and developer file interchange, it supports conversions across CSV, TSV, JSON, YAML, Base64, and Markdown tables.

---

## ⚡ Quick Start

```bash
# Launch Data Converter Studio
bun run app:convert

# Launch backwards-compatible alias
bun run app:dataconvert
```

---

## 🖥️ User Interface Overview

1. **Format Selector & Conversion Presets**:
   - **Source Format**: `CSV`, `TSV`, `JSON`, `YAML`, `Base64`, `Markdown Table`.
   - **Target Format**: `JSON`, `CSV`, `TSV`, `YAML`, `Base64`, `Markdown Table`.
   - **Preset One-Click Buttons**:
     - `CSV ➔ JSON`
     - `JSON ➔ CSV`
     - `JSON ➔ YAML`
     - `YAML ➔ JSON`
     - `JSON ➔ Markdown Table`
     - `Base64 Encode / Decode`
2. **Data Manipulation Controls**:
   - **⚡ Convert**: Executes the transformation engine with validation and row/item counts.
   - **Load Sample Data**: Loads a structured dataset matching the selected source format.
   - **Swap Directions**: Instantly switches input and output formats and moves output data to input.
   - **Copy Output**: Copies converted data to clipboard.
   - **💾 Save to File**: Saves the converted payload directly to disk.
3. **Dual Editor Workspaces**:
   - **Source Data Input**: Text area for pasting or typing raw input data.
   - **Converted Result Output**: Formatted and syntax-verified target output.
4. **Status & Telemetry**:
   - Displays input byte size, output byte size, line count, and transformation execution time.

---

## 📖 Practical Tutorials

### 1. Converting a CSV File to JSON for API Usage
1. Click **CSV ➔ JSON**.
2. Paste your CSV content into the source pane:
   ```csv
   id,name,role,active
   101,Sarah Jenkins,Engineering Lead,true
   102,David Miller,DevOps Engineer,true
   103,Emma Watson,Security Analyst,false
   ```
3. Click **⚡ Convert**.
4. The output pane generates clean, strongly typed JSON:
   ```json
   [
     { "id": 101, "name": "Sarah Jenkins", "role": "Engineering Lead", "active": true },
     { "id": 102, "name": "David Miller", "role": "DevOps Engineer", "active": true },
     { "id": 103, "name": "Emma Watson", "role": "Security Analyst", "active": false }
   ]
   ```

### 2. Generating Markdown Tables for Documentation
1. With JSON or CSV in the input editor, select **Target Format: Markdown Table**.
2. Click **⚡ Convert**.
3. A properly aligned GitHub-flavored markdown table is generated:
   ```markdown
   | id | name | role | active |
   | --- | --- | --- | --- |
   | 101 | Sarah Jenkins | Engineering Lead | true |
   | 102 | David Miller | DevOps Engineer | true |
   | 103 | Emma Watson | Security Analyst | false |
   ```
4. Click **Copy Output** and paste directly into your project `README.md` or user documentation.

---

## 🛡️ Enterprise Resilience Features
- **Smart Type Ingestion**: Automatic parsing of booleans, floating-point numbers, and integer values rather than coercing everything to strings.
- **Escaped CSV / Delimiter Support**: Accurately handles quoted strings with commas and escaped quotes within CSV/TSV inputs.
- **Pure Native Execution**: Zero external parser dependencies. Zero data sent to external servers or cloud services.
