import fs from 'node:fs';

const SOURCE = fs.readFileSync(new URL('./page.js', import.meta.url), 'utf8');
const WORLD = 'poof';

export async function attachBrowser(cdp, store, log = () => {}) {
  const contexts = new Map();
  const targets = new Map();

  const push = (sessionId, contextId, rules) =>
    cdp
      .send('Runtime.evaluate', { expression: `__poofApply(${JSON.stringify(rules)})`, contextId }, sessionId)
      .catch((e) => log(`push failed: ${e.message}`));

  const broadcast = (rules) => {
    for (const [sessionId, contextId] of contexts) push(sessionId, contextId, rules);
  };

  const attachPage = async (sessionId) => {
    const run = (method, params) => cdp.send(method, params, sessionId);
    // A paused target answers nothing until released, so these must not be awaited one by one.
    await Promise.all([
      run('Runtime.enable'),
      run('Runtime.addBinding', { name: 'poofSend', executionContextName: WORLD }),
      run('Page.enable'),
      run('Page.addScriptToEvaluateOnNewDocument', { source: SOURCE, worldName: WORLD }),
      run('Runtime.runIfWaitingForDebugger'),
    ]);
    const { frameTree } = await run('Page.getFrameTree');
    const { executionContextId } = await run('Page.createIsolatedWorld', {
      frameId: frameTree.frame.id,
      worldName: WORLD,
    });
    await run('Runtime.evaluate', { expression: SOURCE, contextId: executionContextId });
  };

  const onBinding = (params, sessionId) => {
    if (params.name !== 'poofSend') return;
    const msg = JSON.parse(params.payload);
    if (msg.type === 'ready') {
      contexts.set(sessionId, params.executionContextId);
      push(sessionId, params.executionContextId, store.read());
    } else if (msg.type === 'add' && typeof msg.selector === 'string') {
      log(`add ${msg.selector}`);
      broadcast(store.add(msg.selector, String(msg.label ?? '')));
    } else if (msg.type === 'undo') {
      log('undo');
      broadcast(store.undo());
    }
  };

  cdp.on('event', (method, params, sessionId) => {
    if (method === 'Target.attachedToTarget' && params.targetInfo.type === 'page') {
      if (targets.has(params.targetInfo.targetId)) return;
      targets.set(params.targetInfo.targetId, params.sessionId);
      attachPage(params.sessionId).catch((e) => log(`attach failed: ${e.message}`));
    } else if (method === 'Target.detachedFromTarget') {
      contexts.delete(params.sessionId);
      if (targets.get(params.targetId) === params.sessionId) targets.delete(params.targetId);
    } else if (method === 'Runtime.bindingCalled') {
      onBinding(params, sessionId);
    }
  });

  const unwatch = store.watch(broadcast);
  await cdp.send('Target.setAutoAttach', {
    autoAttach: true,
    waitForDebuggerOnStart: true,
    flatten: true,
    filter: [{ type: 'page' }, { exclude: true }],
  });
  return unwatch;
}
