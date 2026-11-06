(() => {
  if (window !== window.top || window.__poof) return;
  window.__poof = true;

  const send = (msg) => globalThis.poofSend(JSON.stringify(msg));
  const sheet = new CSSStyleSheet();
  document.adoptedStyleSheets = [...document.adoptedStyleSheets, sheet];

  const valid = (selector) => {
    try {
      document.querySelector(selector);
      return !/[{}]/.test(selector);
    } catch {
      return false;
    }
  };
  window.__poofApply = (rules) => {
    sheet.replaceSync(
      rules.filter((r) => valid(r.selector)).map((r) => `${r.selector}{display:none!important}`).join('\n'),
    );
  };

  const count = (sel) => {
    try {
      return document.querySelectorAll(sel).length;
    } catch {
      return Infinity;
    }
  };
  const quote = (v) => `"${v.replace(/["\\]/g, '\\$&')}"`;
  const HASHED = /^(.+?[_-]{1,2})([0-9a-z]{5,8})$/i;

  const classPart = (c) => {
    const m = c.match(HASHED);
    if (m && /\d/.test(m[2])) {
      const p = quote(m[1]).slice(1, -1);
      return `:is([class^="${p}"],[class*=" ${p}"])`;
    }
    return /\d{4,}/.test(c) ? '' : `.${CSS.escape(c)}`;
  };

  const structural = (el) => {
    const parts = [...el.classList].map(classPart).filter(Boolean).slice(0, 3);
    return el.localName.includes(':') ? parts.join('') || '*' : el.localName + parts.join('');
  };

  const stableValue = (v) => v && v.length <= 80 && !/[\u0000-\u001f]/.test(v) && !/\d{6,}/.test(v);

  const semantic = (el) => {
    const tag = el.localName.includes(':') ? '' : el.localName;
    const label = el.getAttribute('aria-label');
    if (stableValue(label) && !/\d/.test(label)) return `${tag}[aria-label=${quote(label)}]`;
    if (el.id && !/\d{3,}|:/.test(el.id)) return `#${CSS.escape(el.id)}`;
    for (const { name, value } of el.attributes) {
      if (name.startsWith('data-') && !/react|radix|state|poof/.test(name) && stableValue(value)) {
        return `${tag}[${name}=${quote(value)}]`;
      }
    }
    return '';
  };

  const selectorFor = (el) => {
    const own = semantic(el);
    if (own) return own;
    let sel = structural(el);
    let node = el.parentElement;
    for (let depth = 0; depth < 5 && count(sel) > 1 && node && node !== document.documentElement; depth++) {
      sel = `${semantic(node) || structural(node)} > ${sel}`;
      node = node.parentElement;
    }
    if (count(sel) > 1) {
      const peers = [...el.parentElement.children].filter((c) => c.localName === el.localName);
      sel += `:nth-of-type(${peers.indexOf(el) + 1})`;
    }
    return el.matches(sel) ? sel : '';
  };
  window.__poofSelectorFor = selectorFor;

  const tooBig = (sel) => {
    const limit = innerWidth * innerHeight * 0.7;
    return [...document.querySelectorAll(sel)].some((e) => {
      const r = e.getBoundingClientRect();
      return e === document.body || e === document.documentElement || r.width * r.height > limit;
    });
  };

  const box = (css) => {
    const d = document.createElement('div');
    d.style.cssText = `position:fixed;z-index:2147483647;pointer-events:none;${css}`;
    return d;
  };
  const frame = box('background:rgba(235,69,90,.25);outline:2px solid #eb455a;display:none');
  const tag = box(
    'background:#111;color:#fff;font:12px/1.4 ui-monospace,monospace;padding:3px 6px;border-radius:3px;max-width:60vw;overflow:hidden;white-space:nowrap;text-overflow:ellipsis;display:none',
  );
  const toastEl = box(
    'left:50%;bottom:24px;transform:translateX(-50%);background:#111;color:#fff;font:13px/1.4 system-ui,sans-serif;padding:8px 12px;border-radius:6px;display:none',
  );
  let toastTimer;
  const toast = (text) => {
    toastEl.textContent = text;
    toastEl.style.display = 'block';
    document.documentElement.append(toastEl);
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => (toastEl.style.display = 'none'), 3000);
  };

  const INTERACTIVE = 'button,a,[role="button"],[role="link"],[role="tab"],[role="menuitem"]';
  let picking = false;
  let chain = [];
  let index = 0;
  let selector = '';

  const draw = () => {
    const el = chain[index];
    if (!el) return;
    const r = el.getBoundingClientRect();
    selector = selectorFor(el);
    Object.assign(frame.style, {
      display: 'block', left: `${r.left}px`, top: `${r.top}px`, width: `${r.width}px`, height: `${r.height}px`,
    });
    const n = selector ? count(selector) : 0;
    tag.textContent = `${selector || 'no selector'}${n > 1 ? `  x${n}` : ''}${selector && tooBig(selector) ? '  (too big: shift-click)' : ''}`;
    Object.assign(tag.style, {
      display: 'block', left: `${Math.max(4, r.left)}px`, top: `${r.top > 28 ? r.top - 26 : r.bottom + 4}px`,
    });
  };

  const hover = (x, y) => {
    const raw = document.elementFromPoint(x, y);
    if (!raw || raw === chain[0]) return;
    chain = [];
    for (let n = raw; n && n !== document.documentElement; n = n.parentElement) chain.push(n);
    index = Math.max(0, chain.indexOf(raw.closest(INTERACTIVE)));
    draw();
  };

  const stopPicking = () => {
    picking = false;
    chain = [];
    frame.remove();
    tag.remove();
    frame.style.display = tag.style.display = 'none';
    document.documentElement.style.removeProperty('cursor');
  };
  const startPicking = () => {
    picking = true;
    document.documentElement.append(frame, tag);
    document.documentElement.style.setProperty('cursor', 'crosshair', 'important');
    toast('Click to hide. Scroll for parent or child. Esc to cancel.');
  };

  const swallow = (e) => {
    e.preventDefault();
    e.stopImmediatePropagation();
  };
  for (const type of ['mousedown', 'mouseup', 'pointerdown', 'pointerup', 'contextmenu', 'auxclick', 'dblclick']) {
    window.addEventListener(type, (e) => picking && swallow(e), true);
  }
  window.addEventListener('mousemove', (e) => picking && hover(e.clientX, e.clientY), true);
  window.addEventListener('wheel', (e) => {
    if (!picking) return;
    swallow(e);
    index = Math.min(chain.length - 1, Math.max(0, index + (e.deltaY < 0 ? 1 : -1)));
    draw();
  }, { capture: true, passive: false });
  window.addEventListener('click', (e) => {
    if (!picking) return;
    swallow(e);
    hover(e.clientX, e.clientY);
    if (!selector) return toast('No usable selector for that element.');
    if (tooBig(selector) && !e.shiftKey) return toast('That covers most of the window. Shift-click if you mean it.');
    send({ type: 'add', selector, label: (chain[index].getAttribute('aria-label') || chain[index].textContent || '').trim().slice(0, 60) });
    stopPicking();
    toast('Poof. Ctrl+Option+Z to undo.');
  }, true);
  window.addEventListener('keydown', (e) => {
    if (e.ctrlKey && e.altKey && e.code === 'KeyP') {
      swallow(e);
      picking ? stopPicking() : startPicking();
    } else if (e.ctrlKey && e.altKey && e.code === 'KeyZ') {
      swallow(e);
      send({ type: 'undo' });
      toast('Restored the last hidden element.');
    } else if (picking && e.code === 'Escape') {
      swallow(e);
      stopPicking();
    }
  }, true);

  send({ type: 'ready' });
})();
