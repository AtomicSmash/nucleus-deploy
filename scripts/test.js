#!/usr/bin/env node
import { spawn } from 'node:child_process';

const child = spawn(process.execPath, ['src/cli.js', 'hello', 'test'], {
  stdio: 'inherit'
});

child.on('exit', (code) => process.exit(code ?? 0));


