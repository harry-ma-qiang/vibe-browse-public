/**
 * Asking the document which fields hold a secret, because the tree will not say.
 *
 * Chrome's accessibility tree carries no input type, so the type, the computed style
 * and the autocomplete hint are read from the DOM and joined by backend node id.
 */

import type { Sealed } from './types';

/** The isolated world the page cannot reach, shared with the change watcher. */
export const WORLD = 'axWatcher';

const SELECTOR = 'input,textarea';

const WORDS = [
  'pass',
  'passcode',
  'passphrase',
  'passwd',
  'password',
  'otp',
  'secret',
  'token',
  'recovery',
  'cvv',
  'cvc',
  'pin',
  'ssn',
];

/** The probe, run in the isolated world: the fields the document says hold a secret.
 *  It walks open shadow roots and returns elements, not indices into a second lookup. */
export const PROBE = `(function () {
  var words = ${JSON.stringify(WORDS)};
  function parts(said) {
    return said.replace(/([a-z0-9])([A-Z])/g, '$1 $2')
      .replace(/([A-Z]+)([A-Z][a-z])/g, '$1 $2')
      .split(/[^A-Za-z]+/);
  }
  function named(said) {
    var got = parts(said);
    for (var i = 0; i < got.length; i++) {
      if (got[i] && words.indexOf(got[i].toLowerCase()) !== -1) return true;
    }
    return false;
  }
  function secret(el) {
    var style = getComputedStyle(el);
    var masked = !!style.webkitTextSecurity && style.webkitTextSecurity !== 'none';
    var hint = (el.getAttribute('autocomplete') || '').toLowerCase();
    var called = (el.getAttribute('name') || '') + ' ' + (el.getAttribute('id') || '');
    return el.type === 'password' || masked || hint === 'one-time-code' ||
      hint.indexOf('password') !== -1 || named(called);
  }
  var out = [];
  var seen = [];
  function scan(root) {
    if (!root || seen.indexOf(root) !== -1) return;
    seen.push(root);
    var fields = root.querySelectorAll('${SELECTOR}');
    for (var i = 0; i < fields.length; i++) {
      if (secret(fields[i])) out.push(fields[i]);
    }
    var every = root.querySelectorAll('*');
    for (var j = 0; j < every.length; j++) {
      if (every[j].shadowRoot) scan(every[j].shadowRoot);
    }
  }
  scan(document);
  return out;
})()`;

const sticky = new Map<number, Set<number>>();

async function send<T>(
  tabId: number,
  method: string,
  params?: Record<string, unknown>,
): Promise<T | undefined> {
  return (await chrome.debugger.sendCommand({ tabId }, method, params)) as T | undefined;
}

async function world(tabId: number): Promise<number> {
  const tree = await send<{ frameTree?: { frame?: { id?: string } } }>(tabId, 'Page.getFrameTree');
  const frameId = tree?.frameTree?.frame?.id;
  if (frameId === undefined) throw new Error('no frame');
  const made = await send<{ executionContextId?: number }>(tabId, 'Page.createIsolatedWorld', {
    frameId,
    worldName: WORLD,
  });
  const contextId = made?.executionContextId;
  if (contextId === undefined) throw new Error('no isolated world');
  return contextId;
}

async function members(tabId: number, objectId: string): Promise<string[]> {
  const said = await send<{ result?: { name: string; value?: { objectId?: string } }[] }>(
    tabId,
    'Runtime.getProperties',
    { objectId, ownProperties: true },
  );
  const out: string[] = [];
  for (const one of said?.result ?? []) {
    const held = /^\d+$/.test(one.name) ? one.value?.objectId : undefined;
    if (held) out.push(held);
  }
  return out;
}

async function backends(tabId: number, objectIds: string[]): Promise<number[]> {
  const out: number[] = [];
  for (const objectId of objectIds) {
    const asked = await send<{ nodeId?: number }>(tabId, 'DOM.requestNode', { objectId });
    if (!asked?.nodeId) continue;
    const said = await send<{ node?: { backendNodeId?: number } }>(tabId, 'DOM.describeNode', {
      nodeId: asked.nodeId,
    });
    const id = said?.node?.backendNodeId;
    if (id) out.push(id);
  }
  return out;
}

async function look(tabId: number): Promise<number[]> {
  // why: the node ids the probe's elements are asked for live in the document's space.
  await send(tabId, 'DOM.getDocument', { depth: 0 });
  const contextId = await world(tabId);
  const said = await send<{ result?: { objectId?: string } }>(tabId, 'Runtime.evaluate', {
    expression: PROBE,
    contextId,
    returnByValue: false,
  });
  const objectId = said?.result?.objectId;
  if (objectId === undefined) throw new Error('the page answered nothing');
  try {
    return await backends(tabId, await members(tabId, objectId));
  } finally {
    await send(tabId, 'Runtime.releaseObject', { objectId }).catch(() => undefined);
  }
}

/** The backend node ids to seal on this tab, and whether the lookup fell back. */
export async function sensitive(tabId: number): Promise<Sealed> {
  const kept = sticky.get(tabId) ?? new Set<number>();
  sticky.set(tabId, kept);
  try {
    for (const id of await look(tabId)) kept.add(id);
    return { ids: new Set(kept), degraded: false };
  } catch {
    // why: a heuristic snapshot beats a refused one, so the miss is reported, not thrown.
    return { ids: new Set(kept), degraded: true };
  }
}

/** Drop what was learned about a tab, once it is no longer held. */
export function forget(tabId: number): void {
  sticky.delete(tabId);
}
