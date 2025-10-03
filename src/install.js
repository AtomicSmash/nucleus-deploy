#!/usr/bin/env node
import { readFile, writeFile, access, mkdir, cp } from 'node:fs/promises';
import { constants as fsConstants } from 'node:fs';
import { dirname, resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as YAML from 'yaml';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

async function pathExists(path) {
  try {
    await access(path, fsConstants.F_OK);
    return true;
  } catch {
    return false;
  }
}

function getConsumerRoot() {
  // npm sets INIT_CWD to the original cwd of the user when running install
  const initCwd = process.env.INIT_CWD;
  if (initCwd) return initCwd;
  // fallback: best-effort parent of node_modules/<pkg>
  const pkgDir = resolve(__dirname, '..');
  return resolve(pkgDir, '..', '..');
}

async function readJson(filePath) {
  const data = await readFile(filePath, 'utf8');
  return JSON.parse(data);
}

async function writeJson(filePath, obj) {
  const data = JSON.stringify(obj, null, 2) + '\n';
  await writeFile(filePath, data, 'utf8');
}

function deepMerge(target, source) {
  if (Array.isArray(target) && Array.isArray(source)) {
    // do not duplicate entries; prefer union by value
    const set = new Set([...target, ...source]);
    return Array.from(set);
  }
  if (typeof target === 'object' && target && typeof source === 'object' && source) {
    const out = { ...target };
    for (const [key, value] of Object.entries(source)) {
      if (key in out) {
        out[key] = deepMerge(out[key], value);
      } else {
        out[key] = value;
      }
    }
    return out;
  }
  return target ?? source;
}

async function ensureNucleusConfig(consumerRoot, summary) {
  const templatePath = resolve(__dirname, 'templates', 'nucleus.yaml');
  const destPath = resolve(consumerRoot, 'nucleus.yaml');
  const hasDest = await pathExists(destPath);

  const templateRaw = await readFile(templatePath, 'utf8');
  const templateDoc = YAML.parse(templateRaw) ?? {};

  if (!hasDest) {
    await writeFile(destPath, YAML.stringify(templateDoc), 'utf8');
    summary.actions.push(`Created nucleus.yaml`);
  } else {
    try {
      const existingRaw = await readFile(destPath, 'utf8');
      const existingDoc = YAML.parse(existingRaw) ?? {};
      const merged = deepMerge(existingDoc, templateDoc);
      const mergedRaw = YAML.stringify(merged);
      if (mergedRaw !== existingRaw) {
        await writeFile(destPath, mergedRaw, 'utf8');
        summary.actions.push(`Updated nucleus.yaml with missing defaults`);
      } else {
        summary.actions.push(`nucleus.yaml already up to date`);
      }
    } catch (e) {
      // If parsing fails, back up and write fresh template
      const backupPath = resolve(consumerRoot, 'nucleus.yaml.bak');
      await writeFile(backupPath, await readFile(destPath, 'utf8'));
      await writeFile(destPath, YAML.stringify(templateDoc), 'utf8');
      summary.actions.push(`Backed up invalid nucleus.yaml to nucleus.yaml.bak and wrote a fresh template`);
      summary.notes.push(`Your previous nucleus.yaml could not be parsed. Please manually merge from nucleus.yaml.bak.`);
    }
  }
}

async function ensureScripts(consumerRoot, summary) {
  const pkgJsonPath = resolve(consumerRoot, 'package.json');
  if (!(await pathExists(pkgJsonPath))) {
    summary.notes.push(`No package.json found at ${pkgJsonPath}. Skipped adding scripts.`);
    return;
  }

  const pkg = await readJson(pkgJsonPath);
  const existingScripts = pkg.scripts || {};

  // Provide a small set of useful scripts that call the package entry
  const recommended = {
    'nucleus:help': "node -e \"import('nucleus-deploy').then(m=>m.run(['help']))\"",
    'nucleus:hello': "node -e \"import('nucleus-deploy').then(m=>m.run(['hello']))\"",
    'nucleus:deploy': "node -e \"import('nucleus-deploy').then(m=>m.run(['deploy']))\"",
  };

  const toAdd = {};
  for (const [name, cmd] of Object.entries(recommended)) {
    if (!Object.prototype.hasOwnProperty.call(existingScripts, name)) {
      toAdd[name] = cmd;
    }
  }

  if (Object.keys(toAdd).length > 0) {
    pkg.scripts = { ...existingScripts, ...toAdd };
    await writeJson(pkgJsonPath, pkg);
    const addedList = Object.keys(toAdd).join(', ');
    summary.actions.push(`Added package.json scripts: ${addedList}`);
  } else {
    summary.actions.push(`All recommended package.json scripts already present`);
  }
}

async function main() {
  const consumerRoot = getConsumerRoot();
  const summary = { actions: [], notes: [] };

  try {
    // Ensure template folder exists in dist if needed (no-op when built via copy)
    const templatesDir = resolve(__dirname, 'templates');
    if (!(await pathExists(templatesDir))) {
      // In dev installs, copy from src/templates if running from transpiled layout
      const srcTemplates = resolve(dirname(__dirname), 'src', 'templates');
      if (await pathExists(srcTemplates)) {
        await mkdir(templatesDir, { recursive: true });
        await cp(srcTemplates, templatesDir, { recursive: true });
      }
    }

    await ensureNucleusConfig(consumerRoot, summary);
    await ensureScripts(consumerRoot, summary);

    // Print summary
    const lines = [];
    lines.push('nucleus-deploy installation summary');
    lines.push('-----------------------------------');
    for (const a of summary.actions) lines.push(`- ${a}`);
    if (summary.notes.length) {
      lines.push('Notes:');
      for (const n of summary.notes) lines.push(`- ${n}`);
    }
    lines.push('Next steps:');
    lines.push('- Review nucleus.yaml and fill in required fields like projectName, environments.');
    lines.push("- Run 'npm run nucleus:help' to see available commands.");
    console.log(lines.join('\n'));
  } catch (err) {
    console.error('nucleus-deploy postinstall failed:', err);
    // Do not fail installation for non-critical setup issues
  }
}

main();


