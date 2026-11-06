import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { after, before, beforeEach, test } from 'node:test';
import { Cdp } from '../src/cdp.js';
import { attachBrowser } from '../src/inject.js';
import { Store } from '../src/store.js';

const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const FIXTURE = fs.readFileSync(new URL('./fixture.html', import.meta.url), 'utf8');
const HASHES = ['a1b2c3', 'd4e5f6', '0a1b2c', '3d4e5f', '6a7b8c', '9d0e1f'];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

let dir, chrome, cdp, store, session, targetId, unwatch;

const fixture = (salt = 0) => {
  const html = FIXTURE.replace(/HASH(\d)/g, (_, n) => HASHES[(Number(n) - 1 + salt) % 6]);
  const file = path.join(dir, `fixture-${salt}.html`);
  fs.writeFileSync(file, html);
  return `file://${file}`;
};

const main = async (expression) =>
  (await cdp.send('Runtime.evaluate', { expression, returnByValue: true }, session)).result.value;

const until = async (expression) => {
  for (let i = 0; i < 100; i++) {
    if (await main(expression)) return;
    await sleep(20);
  }
  assert.fail(`timed out waiting for ${expression}`);
};

const shown = (sel) => `getComputedStyle(document.querySelector(${JSON.stringify(sel)})).display !== 'none'`;
const hidden = (sel) => `!(${shown(sel)})`;

const key = async (code, modifiers = 3) => {
  await cdp.send('Input.dispatchKeyEvent', { type: 'rawKeyDown', code, key: code, modifiers }, session);
  await cdp.send('Input.dispatchKeyEvent', { type: 'keyUp', code, key: code, modifiers }, session);
};
const move = (x, y) => cdp.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y }, session);
const click = async (x, y, modifiers = 0) => {
  await move(x, y);
  for (const type of ['mousePressed', 'mouseReleased']) {
    await cdp.send('Input.dispatchMouseEvent', { type, x, y, button: 'left', clickCount: 1, modifiers }, session);
  }
};
const zap = async (x, y, modifiers) => {
  await key('KeyP');
  await click(x, y, modifiers);
};
const open = async (url) => {
  await cdp.send('Page.navigate', { url }, session);
  await until(`document.readyState === 'complete' && !!document.querySelector('button')`);
  await sleep(100);
};

before(async () => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'poof-test-'));
  chrome = spawn(CHROME, [
    '--headless=new', '--remote-debugging-pipe', '--no-first-run', '--window-size=1000,800',
    `--user-data-dir=${path.join(dir, 'profile')}`, 'about:blank',
  ], { stdio: ['ignore', 'ignore', 'ignore', 'pipe', 'pipe'] });
  cdp = new Cdp(chrome.stdio[3], chrome.stdio[4]);
  store = new Store('test', path.join(dir, 'rules'));
  unwatch = await attachBrowser(cdp, store, () => {});
  ({ targetId } = await cdp.send('Target.createTarget', { url: 'about:blank' }));
  ({ sessionId: session } = await cdp.send('Target.attachToTarget', { targetId, flatten: true }));
  await cdp.send('Page.enable', {}, session);
});

after(async () => {
  unwatch?.();
  const gone = new Promise((r) => chrome.once('exit', r));
  chrome.kill('SIGKILL');
  await gone;
  fs.rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
});

beforeEach(async () => {
  store.clear();
  await open(fixture());
});

test('picking the icon inside a button hides the button, by aria-label', async () => {
  await zap(20, 20);
  await until(hidden('[aria-label="Send a gift"]'));
  assert.equal(store.read()[0].selector, 'button[aria-label="Send a gift"]');
  assert.ok(await main(shown('[aria-label="Super React"]')));
});

test('a repeated control is hidden everywhere it appears', async () => {
  await zap(110, 20);
  await until(`[...document.querySelectorAll('[aria-label="Super React"]')].every(e => getComputedStyle(e).display === 'none')`);
});

test('a class-only rule survives a build that rehashes every class', async () => {
  await zap(40, 80);
  await until(hidden('[class^="promo_"]'));
  assert.ok(await main(shown('[class^="other_"]')));
  await open(fixture(2));
  await until(hidden('[class^="promo_"]'));
  assert.ok(await main(shown('[class^="other_"]')));
});

test('rules come back after a reload', async () => {
  await zap(20, 20);
  await until(hidden('[aria-label="Send a gift"]'));
  await open(fixture());
  await until(hidden('[aria-label="Send a gift"]'));
});

test('undo restores the last element', async () => {
  await zap(20, 20);
  await until(hidden('[aria-label="Send a gift"]'));
  await key('KeyZ');
  await until(shown('[aria-label="Send a gift"]'));
  assert.deepEqual(store.read(), []);
});

test('editing the rules file applies live', async () => {
  await zap(20, 20);
  await until(hidden('[aria-label="Send a gift"]'));
  new Store('test', store.dir).remove(1);
  await until(shown('[aria-label="Send a gift"]'));
});

test('an element covering most of the window needs shift-click', async () => {
  await zap(500, 500);
  await sleep(150);
  assert.deepEqual(store.read(), []);
  await click(500, 500, 8);
  await until(hidden('[class^="huge_"]'));
});

test('picking swallows the click and Esc cancels', async () => {
  await key('KeyP');
  await click(20, 20);
  await until(hidden('[aria-label="Send a gift"]'));
  assert.equal(await main('window.clicks'), 0);
  await key('KeyP');
  await key('Escape');
  await click(110, 20);
  await sleep(150);
  assert.equal(await main('window.clicks'), 1);
  assert.equal(store.read().length, 1);
});

test('the page cannot see poof', async () => {
  assert.equal(await main('typeof window.poofSend + typeof window.__poof + typeof window.__poofApply'), 'undefinedundefinedundefined');
});

test('a malformed rule in the file does not take down the others', async () => {
  store.write([{ selector: 'button[' }, { selector: 'a{}body' }, { selector: '[aria-label="Send a gift"]' }]);
  await until(hidden('[aria-label="Send a gift"]'));
  assert.ok(await main(shown('[aria-label="Super React"]')));
});
