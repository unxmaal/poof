import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { Cdp } from '../src/cdp.js';
import { attachBrowser } from '../src/inject.js';
import { Store } from '../src/store.js';

const electron = createRequire(import.meta.url)('electron');
const appDir = fileURLToPath(new URL('./electron-app', import.meta.url));

test('a window opened after attach loads, and its rules apply', { timeout: 30000 }, async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'poof-electron-'));
  const store = new Store('fixture', dir);
  store.add('[aria-label="Junk"]');
  const child = spawn(electron, [appDir, '--remote-debugging-pipe', `--user-data-dir=${path.join(dir, 'profile')}`], {
    stdio: ['ignore', 'pipe', 'ignore', 'pipe', 'pipe'],
  });
  let out = '';
  child.stdout.on('data', (d) => (out += d));
  const gone = new Promise((r) => child.once('exit', r));
  const unwatch = await attachBrowser(new Cdp(child.stdio[3], child.stdio[4]), store);
  const timer = setTimeout(() => child.kill('SIGKILL'), 12000);
  await gone;
  clearTimeout(timer);
  unwatch();
  fs.rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
  const line = out.split('\n').find((l) => l.startsWith('{'));
  assert.ok(line, 'the second window never finished loading');
  assert.deepEqual(JSON.parse(line), { junk: 'none', keep: 'inline-block' });
});
