#!/usr/bin/env node
import { mkdir, cp, writeFile, access } from 'node:fs/promises';
import { constants as fsConstants } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const projectRoot = resolve(__dirname, '..');
const srcDir = resolve(projectRoot, 'src');
const distDir = resolve(projectRoot, 'dist');

async function pathExists(path) {
  try {
    await access(path, fsConstants.F_OK);
    return true;
  } catch {
    return false;
  }
}

async function build() {
  await mkdir(distDir, { recursive: true });

  // Simple ESM copy build (no transpile). Extend later if needed.
  await cp(srcDir, distDir, { recursive: true });

  // Minimal type stub so consumers with TS don't error on "types" field
  const dtsPath = resolve(distDir, 'index.d.ts');
  if (!(await pathExists(dtsPath))) {
    await writeFile(dtsPath, 'export function run(argv?: string[]): Promise<void>;\n');
  }
}

build().catch((err) => {
  console.error(err);
  process.exit(1);
});


