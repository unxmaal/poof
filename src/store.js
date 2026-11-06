import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

export const poofHome = () => process.env.POOF_HOME || path.join(os.homedir(), '.config', 'poof');

export class Store {
  constructor(app, dir = poofHome()) {
    this.dir = dir;
    this.file = path.join(dir, `${app}.json`);
    fs.mkdirSync(dir, { recursive: true });
  }

  read() {
    try {
      return JSON.parse(fs.readFileSync(this.file, 'utf8')).rules ?? [];
    } catch (e) {
      if (e.code === 'ENOENT') return [];
      throw e;
    }
  }

  write(rules) {
    const tmp = `${this.file}.${process.pid}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify({ rules }, null, 2) + '\n');
    fs.renameSync(tmp, this.file);
    return rules;
  }

  add(selector, label = '') {
    const rules = this.read();
    if (rules.some((r) => r.selector === selector)) return rules;
    return this.write([...rules, { selector, label, added: new Date().toISOString() }]);
  }

  undo() {
    return this.write(this.read().slice(0, -1));
  }

  remove(index) {
    const rules = this.read();
    if (!Number.isInteger(index) || index < 1 || index > rules.length) {
      throw new Error(`no rule ${index}; there are ${rules.length}`);
    }
    rules.splice(index - 1, 1);
    return this.write(rules);
  }

  clear() {
    return this.write([]);
  }

  watch(onChange) {
    const base = path.basename(this.file);
    let timer;
    const watcher = fs.watch(this.dir, (_, name) => {
      if (name && name !== base) return;
      clearTimeout(timer);
      timer = setTimeout(() => {
        let rules;
        try {
          rules = this.read();
        } catch {
          return;
        }
        onChange(rules);
      }, 50);
    });
    return () => {
      clearTimeout(timer);
      watcher.close();
    };
  }
}
