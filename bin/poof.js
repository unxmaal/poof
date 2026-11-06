#!/usr/bin/env node
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { appKey, isRunning, quit, resolveApp } from '../src/app.js';
import { Cdp } from '../src/cdp.js';
import { attachBrowser } from '../src/inject.js';
import { poofHome, Store } from '../src/store.js';

const USAGE = `poof launch [app] [--restart] [-- app args]   start the app with poof attached
poof list [app]                               show hidden elements
poof rm <n|all> [app]                         unhide (live if the app is running)

app defaults to discord; give a name in /Applications or a path to a .app.
In the app: Ctrl+Option+P to pick, click to hide, scroll for parent/child,
Esc to cancel, Ctrl+Option+Z to undo.`;

async function run(ref, extra) {
  const app = resolveApp(ref);
  const log = (m) => console.log(`${new Date().toISOString()} ${m}`);
  const child = spawn(app.binary, ['--remote-debugging-pipe', ...extra], {
    stdio: ['ignore', 'ignore', 'ignore', 'pipe', 'pipe'],
  });
  const cdp = new Cdp(child.stdio[3], child.stdio[4]);
  cdp.on('close', () => log('pipe closed'));
  child.on('exit', (code) => {
    log(`${app.name} exited (${code})`);
    process.exit(0);
  });
  await attachBrowser(cdp, new Store(app.key), log);
  log(`attached to ${app.binary}`);
}

async function launch(ref, restart, extra) {
  const app = resolveApp(ref);
  if (isRunning(app.binary)) {
    if (!restart) throw new Error(`${app.name} is already running without poof. Quit it, or pass --restart.`);
    await quit(app);
  }
  const logFile = path.join(poofHome(), `${app.key}.log`);
  fs.mkdirSync(poofHome(), { recursive: true });
  const out = fs.openSync(logFile, 'a');
  spawn(process.execPath, [fileURLToPath(import.meta.url), '_run', ref, '--', ...extra], {
    detached: true,
    stdio: ['ignore', out, out],
  }).unref();
  console.log(`${app.name} launching with poof. Ctrl+Option+P to pick. Log: ${logFile}`);
}

const [cmd, ...rest] = process.argv.slice(2);
const dash = rest.indexOf('--');
const extra = dash >= 0 ? rest.slice(dash + 1) : [];
const args = (dash >= 0 ? rest.slice(0, dash) : rest).filter((a) => a !== '--restart');
const restart = rest.includes('--restart');

try {
  if (cmd === '_run') await run(args[0], extra);
  else if (cmd === 'launch') await launch(args[0] ?? 'discord', restart, extra);
  else if (cmd === 'list') {
    const rules = new Store(appKey(args[0] ?? 'discord')).read();
    rules.forEach((r, i) => console.log(`${i + 1}. ${r.selector}${r.label ? `  (${r.label})` : ''}`));
    if (!rules.length) console.log('nothing hidden');
  } else if (cmd === 'rm' && args[0]) {
    const store = new Store(appKey(args[1] ?? 'discord'));
    if (args[0] === 'all') store.clear();
    else store.remove(Number(args[0]));
  } else {
    console.log(USAGE);
    if (cmd && cmd !== 'help') process.exitCode = 1;
  }
} catch (e) {
  console.error(`poof: ${e.message}`);
  process.exitCode = 1;
}
