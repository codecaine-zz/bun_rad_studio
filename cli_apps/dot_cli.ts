#!/usr/bin/env bun
import { SimpleCLI, TreeNode, sys } from '../src/index.ts';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';

const app = SimpleCLI.newApp('dot-cli', '1.0.0')
  .setDescription('Dotfiles Manager & Symlink Synchronizer');

app.addFlagString('dir', 'd', '~/.dotfiles', 'Path to dotfiles repository');
app.addFlagBool('sync', 's', false, 'Create symlinks in user home directory');

if (!app.parseCli()) process.exit(0);

app.banner('Dotfiles Manager CLI', 'v1.0.0 - Config Symlink Pilot');

const dotDir = sys.expandTilde(app.getFlagString('dir'));
const home = os.homedir();

const root = new TreeNode(`dotfiles (${dotDir})`);
const commonConfigs = ['.zshrc', '.bashrc', '.gitconfig', '.tmux.conf', '.vimrc', '.config/nvim'];

for (const cfg of commonConfigs) {
  const src = path.join(dotDir, cfg);
  const dst = path.join(home, cfg);
  const exists = fs.existsSync(src);
  root.addChild(`${cfg} -> ${exists ? app.green('[READY]') : app.dim('[MISSING]')}`);
}

app.tree(root);
