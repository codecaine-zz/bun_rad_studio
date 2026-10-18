# Complete Databases & Cross-Engine Cloning Masterclass (10:32)

## YouTube title

All 4 Databases in the Codecaine File Manager: SQLite, MySQL, PostgreSQL, Redis, Cloning, Bun JS Macros & Studio IDE v2

## YouTube description (copy and paste)

```text
Master every database capability in the Codecaine File Manager (part of Bun RAD Studio). Discover SQLite files by magic bytes in the file list, generate synthetic sample databases in one click, auto-detect .env connections for SQLite, MySQL / MariaDB, PostgreSQL and Redis with OS keychain security, inspect Effective Settings, and run live connection tests. Clone entire databases, selected tables, views, secondary indexes, foreign keys, and Redis Hash key groups seamlessly between SQLite, PostgreSQL, MySQL, Redis, and brand-new SQLite files. Run Access-style DAO/DoCmd scripts and visual action macros in the Bun JavaScript & Visual Macro Studio across any connection with dry-run rollback and .ts/.bas/.sql export. Load 15 file formats through the 5-step Staging Import Wizard, and explore Studio IDE v2: Data Grid Pro with per-column filters, Side Row/JSON Inspector, FK ↗ jump links, multi-tab SQL worksheets, Format SQL, Query History, Transaction & Read-Only Guard, Full ER Diagram, Schema Diff & Migration DDL, 5-language Code Generation (Bun.sql, TypeScript, Python, V), and the live PostgreSQL, MySQL, and Redis Studios.

Free and open source: https://github.com/codecaine-zz/bun_rad_studio
Complete Databases Guide: https://github.com/codecaine-zz/bun_rad_studio/blob/main/docs/databases/complete-databases-guide.md
File Manager Guide: https://github.com/codecaine-zz/bun_rad_studio/blob/main/docs/userguides/43_file_manager.md

Chapters
0:00 The Unified Databases Hub & Cross-Engine Cloning
0:27 SQLite files in the file list & one-click sample databases
1:21 Connecting SQLite, MySQL, PostgreSQL and Redis
2:10 Cloning databases and tables across SQLite, PostgreSQL and MySQL
3:36 Cloning SQL tables into Redis Hashes & back into a new SQLite file
4:31 The Bun JavaScript & Visual Macro Studio across all engines
5:56 Universal 15-format import & the 5-step Staging Wizard
6:57 Per-column filter bar, Side Row Inspector, FK jump & backups
7:51 Multi-tab SQL IDE, Full ER Diagram, Schema Diff & Code Generation
9:08 Live PostgreSQL, MySQL and Redis Studios & the Open Studios Switcher
10:00 One Hub. Four Engines. Zero Friction.
```

## Tags (comma separated)

sqlite, mysql, postgresql, redis, database cloning, cross engine database migration, bun js macros, visual macro builder, er diagram, schema diff, code generation, bun sql, staging import, database gui, database manager, file manager, codecaine file manager, bun, bun runtime, typescript, bun rad studio, sqlite studio, mysql studio, postgres studio, redis studio, sql tutorial, database tools, macos

## Hashtags

#SQLite #PostgreSQL #MySQL #Redis #Database #Bun #TypeScript #FileManager #DevTools #OpenSource #DataEngineering

## Notes

- Recorded live in headless Chrome against real throwaway instances of **SQLite** (`bun:sqlite`), **MySQL** (port 3399), **PostgreSQL** (port 5499), and **Redis** (port 6399) in `youtube_production/databases_masterclass_tutorial/_work`.
- Uses `scripts/lib/mysql_tutorial_nokeychain.ts` preload so no real macOS Keychain entry or repository `.env` secret is ever read or modified.
- Narration: Edge neural voice (en-US-AvaMultilingualNeural).
- Rebuild: `bun scripts/tutorial_databases_masterclass.ts all`.
