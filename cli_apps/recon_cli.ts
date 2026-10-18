#!/usr/bin/env bun
import { SimpleCLI, sys } from '../src/index.ts';

const app = SimpleCLI.newApp('recon-cli', '1.0.0')
  .setDescription('Security & Network Reconnaissance Suite');

app.addFlagString('target', 't', '127.0.0.1', 'Target host or IP address');

if (!app.parseCli()) process.exit(0);

app.banner('Security Reconnaissance Suite', 'v1.0.0 - Network Mapper');

const target = app.getFlagString('target');
app.step(1, `Pinging Target ${target}`);
sys.pingCheck(target).then(isUp => {
  app.printKv({
    'Host': target,
    'Status': isUp ? app.green('HOST ONLINE') : app.red('HOST OFFLINE'),
  });
});
