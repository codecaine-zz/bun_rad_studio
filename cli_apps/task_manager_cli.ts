#!/usr/bin/env bun
import { SimpleCLI, TaskStatus } from '../src/index.ts';

const app = SimpleCLI.newApp('taskmanager-cli', '1.0.0')
  .setDescription('Terminal Task Checklist & Productivity Manager');

app.addFlagString('add', 'a', '', 'Add new task item');
app.addFlagBool('list', 'l', true, 'List all tasks');

if (!app.parseCli()) process.exit(0);

app.banner('Task Manager CLI', 'v1.0.0 - Productivity Checklist');

app.taskItem('Set up TypeScript Bun workspace', TaskStatus.DONE, 120);
app.taskItem('Implement ANSI TrueColor styling', TaskStatus.DONE, 85);
app.taskItem('Build zero-dependency prompt suite', TaskStatus.DONE, 140);
app.taskItem('Port 49 production CLI tools', TaskStatus.DONE, 210);
app.taskItem('Run full automated test suite', TaskStatus.RUNNING, 0);
