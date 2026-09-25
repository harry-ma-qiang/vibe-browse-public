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

const PROBE = `(function () {
  var out = [];
  var all = document.querySelectorAll('${SELECTOR}');
  var named = /pass|otp|secret|token|recovery|cvv|cvc|pin|ssn/i;
  for (var i = 0; i < all.length; i++) {
    var el = all[i];
    var style = getComputedStyle(el);
    var masked = !!style.webkitTextSecurity && style.webkitTextSecurity !== 'none';
    var hint = (el.getAttribute('autocomplete') || '').toLowerCase();
    var called = (el.getAttribute('name') || '') + ' ' + (el.getAttribute('id') || '');
    var say = el.type === 'password' || masked || hint === 'one-time-code' ||
      hint.indexOf('password') !== -1 || named.test(called);
    if (say) out.push(i);
  }
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

async function handles(tabId: number): Promise<number[]> {
  const doc = await send<{ root?: { nodeId?: number } }>(tabId, 'DOM.getDocument', { depth: 0 });
  const nodeId = doc?.root?.nodeId;
  if (nodeId === undefined) throw new Error('no document');
  const found = await send<{ nodeIds?: number[] }>(tabId, 'DOM.querySelectorAll', {
    nodeId,
    selector: SELECTOR,
  });
  const out: number[] = [];
  for (const one of found?.nodeIds ?? []) {
    const said = await send<{ node?: { backendNodeId?: number } }>(tabId, 'DOM.describeNode', {
      nodeId: one,
    });
    out.push(said?.node?.backendNodeId ?? 0);
  }
  return out;
}

async function look(tabId: number): Promise<number[]> {
  const backend = await handles(tabId);
  const contextId = await world(tabId);
  const said = await send<{ result?: { value?: unknown } }>(tabId, 'Runtime.evaluate', {
    expression: PROBE,
    contextId,
    returnByValue: true,
  });
  const indices = said?.result?.value;
  if (!Array.isArray(indices)) throw new Error('the page answered nothing');
  const out: number[] = [];
  for (const one of indices) {
    const id = backend[Number(one)];
    if (id) out.push(id);
  }
  return out;
}

/** The backend node ids to seal on this tab, and whether the lookup fell back. */
export async function sensitive(tabId: number): Promise<Sealed> {
  const kept = sticky.get(tabId) ?? new Set<number>();
  sticky.set(tabId, kept);
  try {
    // why: a field that was ever a password stays sealed after its type flips.
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
