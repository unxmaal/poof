import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const plist = (bundle, key) =>
  execFileSync('defaults', ['read', path.join(bundle, 'Contents', 'Info'), key], { encoding: 'utf8' }).trim();

export const appKey = (ref) => path.basename(ref, '.app').toLowerCase().replace(/[^a-z0-9-]+/g, '-');

export function resolveApp(ref) {
  const candidates = ref.includes('/')
    ? [path.resolve(ref)]
    : fs.readdirSync('/Applications')
        .filter((n) => n.toLowerCase() === `${ref.toLowerCase()}.app`)
        .map((n) => path.join('/Applications', n));
  const bundle = candidates.find((c) => fs.existsSync(c));
  if (!bundle) throw new Error(`cannot find an app called ${ref}`);
  if (!bundle.endsWith('.app')) return { key: appKey(ref), binary: bundle, name: path.basename(bundle) };
  const name = path.basename(bundle, '.app');
  return { key: appKey(bundle), binary: path.join(bundle, 'Contents', 'MacOS', plist(bundle, 'CFBundleExecutable')), name };
}

export function isRunning(binary) {
  const pattern = `^${binary.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}( |$)`;
  try {
    return execFileSync('pgrep', ['-f', pattern], { encoding: 'utf8' }).trim().length > 0;
  } catch {
    return false;
  }
}

export async function quit(app) {
  execFileSync('osascript', ['-e', `quit app "${app.name}"`]);
  for (let i = 0; i < 100 && isRunning(app.binary); i++) await new Promise((r) => setTimeout(r, 100));
  if (isRunning(app.binary)) throw new Error(`${app.name} did not quit`);
}
