# `rip` / `rip2`: Safe File Removal with Graveyard API

A safe, fast alternative to `rm` that sends targets to a graveyard directory with metadata tracking and instant undo support.

---

## 1. CLI Usage

```bash
# Safely bury files or directories
bun run rip <targets...>

# Common Flags
-u, --unbury [item]     Restore the last buried item (or item matching query)
-s, --seance            Inspect buried files in the graveyard
-i, --info <id|path>    Inspect metadata detail for a specific buried item
    --size              Show total disk space occupied by graveyard
-n, --dry-run           Show what would be buried without modifying disk
    --prune <days>      Permanently purge buried items older than N days
-d, --decompose         Permanently purge all files in the graveyard
-p, --permanent         Permanently delete target files without burying
-g, --graveyard <dir>   Specify custom graveyard directory
-v, --verbose           Verbose output
-h, --help              Show help information
```

---

## 2. Type Definitions

```typescript
export interface GraveyardRecord {
  id: string;             // Unique timestamped ID
  originalPath: string;   // Absolute original path
  graveyardPath: string;  // Path inside graveyard folder
  deletedAt: string;      // ISO timestamp
  isDirectory: boolean;
  size: number;           // Size in bytes
}

export interface GraveyardManifest {
  version: number;
  records: GraveyardRecord[];
}

export interface RipOptions {
  targets: string[];
  unbury: boolean;
  unburyTarget?: string;
  seance: boolean;
  decompose: boolean;
  permanent: boolean;
  verbose: boolean;
  graveyardDir?: string;
  infoTarget?: string;
  pruneDays?: number;
  dryRun?: boolean;
  showSize?: boolean;
}
```

---

## 3. Comprehensive Code Examples

### Example 1: Bury a File Safely into the Graveyard
```typescript
import { buryTarget } from "./ripCoordinator.ts";
import { resolveGraveyardDir } from "./ripDoers.ts";

const graveyard = resolveGraveyardDir();
const record = await buryTarget("./logs/error.log", graveyard);

console.log(`Bury successful:`);
console.log(`- Original path: ${record.originalPath}`);
console.log(`- Graveyard ID: ${record.id}`);
console.log(`- Size: ${record.size} bytes`);
```

### Example 2: Restore / Unbury the Most Recently Deleted File
```typescript
import { unburyTarget } from "./ripCoordinator.ts";
import { resolveGraveyardDir } from "./ripDoers.ts";

const graveyard = resolveGraveyardDir();
const restored = await unburyTarget(graveyard);
console.log(`Restored item back to: ${restored.originalPath}`);
```

### Example 3: Restore a Specific Item by Filename Query
```typescript
import { unburyTarget } from "./ripCoordinator.ts";
import { resolveGraveyardDir } from "./ripDoers.ts";

const graveyard = resolveGraveyardDir();
// Finds and restores the most recent buried record matching "important_doc"
const restored = await unburyTarget(graveyard, "important_doc.pdf");
console.log(`Restored: ${restored.originalPath}`);
```

### Example 4: List Buried Files in Graveyard (Seance)
```typescript
import { readManifest, resolveGraveyardDir } from "./ripDoers.ts";

const graveyard = resolveGraveyardDir();
const manifest = await readManifest(graveyard);

console.log(`Total buried items: ${manifest.records.length}`);
for (const item of manifest.records) {
  console.log(`[${item.deletedAt}] ${item.originalPath} (${item.size} bytes)`);
}
```

### Example 5: Permanently Decompose Graveyard
```typescript
import { decomposeGraveyard } from "./ripCoordinator.ts";
import { resolveGraveyardDir } from "./ripDoers.ts";

const graveyard = resolveGraveyardDir();
const purgedCount = await decomposeGraveyard(graveyard);
console.log(`Permanently purged ${purgedCount} items from disk.`);
```

### Example 6: Prune Graveyard, Compute Size & Inspect Record Details
```typescript
import { getRecordInfo, pruneGraveyard } from "./ripCoordinator.ts";
import {
  resolveGraveyardDir,
  computeGraveyardSize,
  formatGraveyardSummary,
  formatRecordDetail,
} from "./ripDoers.ts";

const graveyard = resolveGraveyardDir();

// Inspect detailed record metadata
const record = await getRecordInfo(graveyard, "0");
if (record) {
  console.log(formatRecordDetail(record));
}

// Compute total graveyard disk consumption
const { totalBytes, count } = await computeGraveyardSize(graveyard);
console.log(formatGraveyardSummary(totalBytes, count));

// Prune items deleted more than 30 days ago
const pruned = await pruneGraveyard(graveyard, 30);
console.log(`Pruned ${pruned} stale graveyard records.`);
```

