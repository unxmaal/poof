import { EventEmitter } from 'node:events';

export class Cdp extends EventEmitter {
  #id = 0;
  #pending = new Map();
  #buf = Buffer.alloc(0);

  constructor(writable, readable) {
    super();
    this.writable = writable;
    readable.on('data', (d) => this.#read(d));
    readable.on('close', () => this.#closed());
    readable.on('error', () => this.#closed());
    writable.on('error', () => this.#closed());
  }

  #read(chunk) {
    this.#buf = Buffer.concat([this.#buf, chunk]);
    let end;
    while ((end = this.#buf.indexOf(0)) >= 0) {
      const msg = JSON.parse(this.#buf.subarray(0, end).toString('utf8'));
      this.#buf = this.#buf.subarray(end + 1);
      const call = msg.id && this.#pending.get(msg.id);
      if (call) {
        this.#pending.delete(msg.id);
        if (msg.error) call.reject(new Error(`${call.method}: ${msg.error.message}`));
        else call.resolve(msg.result);
      } else if (msg.method) {
        this.emit('event', msg.method, msg.params, msg.sessionId);
      }
    }
  }

  #closed() {
    for (const call of this.#pending.values()) call.reject(new Error('CDP pipe closed'));
    this.#pending.clear();
    this.emit('close');
  }

  send(method, params = {}, sessionId) {
    const id = ++this.#id;
    return new Promise((resolve, reject) => {
      this.#pending.set(id, { method, resolve, reject });
      this.writable.write(JSON.stringify({ id, method, params, sessionId }) + '\0');
    });
  }
}
