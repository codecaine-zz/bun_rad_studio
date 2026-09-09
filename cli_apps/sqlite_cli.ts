#!/usr/bin/env bun
import { SimpleCLI } from '../src/index.ts';

const app = SimpleCLI.newApp('sqlite-cli', '1.0.0')
  .setDescription('SQLite Database Explorer & Table Formatter');

app.addFlagString('db', 'd', 'app.db', 'SQLite database file path');

if (!app.parseCli()) process.exit(0);

app.banner('SQLite Database Studio', 'v1.0.0 - Database Explorer');

app.table(
  ['Table Name', 'Row Count', 'Columns', 'Storage Size'],
  [
    ['users', '1,420', 'id, email, role, created_at', '64 KB'],
    ['sessions', '850', 'id, user_id, token, expires_at', '48 KB'],
    ['audit_logs', '12,940', 'id, action, timestamp, ip', '512 KB'],
  ]
);
