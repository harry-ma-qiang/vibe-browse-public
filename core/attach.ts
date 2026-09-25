/**
 * Attaching the protocol to one tab, and letting go of it.
 *
 * Nothing attaches on its own. A tab is watched because someone asked for it, and
 * the asking is what separates this from a tool that reads every page you open.
 */

import { readable } from './redact';
import { forget, WORLD } from './sensitive';

/** How long to wait after a page reports a change. The page waits too, so this is
 *  the second of two. */
export const SETTLE_MS = 150;

/** The domains turned on, and the whole of what is needed. Runtime is here for the
 *  change binding, so its console events arrive and are never read. */
export const DOMAINS = ['Accessibility', 'DOM', 'Page', 'Runtime'];

/** Injected so the page reports its own changes rather than being polled. It waits out
 *  a burst first: one keystroke in an editor is a hundred mutations. */
export const OBSERVER = `(function(){
  if (window.__axWatching) return;
  var root = document.documentElement;
  if (!root) return;
  var Observer = MutationObserver, later = setTimeout, sooner = clearTimeout;
  var pending = null;
  new Observer(function () {
    if (pending) sooner(pending);
    pending = later(function () { pending = null; window.axChanged('1'); }, 200);
  }).observe(root, { childList: true, subtree: true, attributes: true, characterData: true });
  window.__axWatching = true;
})()`;

const attached = new Set<number>();

/** Every tab the protocol is currently attached to. */
export function attachedTabs(): number[] {
  return [...attached];
}

/** Whether the protocol is attached to this tab. */
export function isAttached(tabId: number): boolean {
  return attached.has(tabId);
}

/** Attach to one tab and ask its page to report changes. Refused on a page not readable. */
export async function attach(tabId: number, url: string | undefined): Promise<boolean> {
  if (attached.has(tabId)) return true;
  if (!readable(url)) return false;
  try {
    await chrome.debugger.attach({ tabId }, '1.3');
    attached.add(tabId);
    await Promise.all(DOMAINS.map((d) => chrome.debugger.sendCommand({ tabId }, `${d}.enable`)));
    // why: named to an isolated world, the page cannot call it and cannot forge a change.
    await chrome.debugger.sendCommand({ tabId }, 'Runtime.addBinding', {
      name: 'axChanged',
      executionContextName: WORLD,
    });
    await chrome.debugger.sendCommand({ tabId }, 'Page.addScriptToEvaluateOnNewDocument', {
      source: OBSERVER,
      worldName: WORLD,
      runImmediately: true,
    });
    return true;
  } catch {
    await chrome.debugger.detach({ tabId }).catch(() => undefined);
    attached.delete(tabId);
    return false;
  }
}

/** Forget a tab whose session Chrome already ended, without asking it to end again. */
export function release(tabId: number): void {
  attached.delete(tabId);
  forget(tabId);
}

/** Let go of one tab, whether or not it is still there. */
export async function detach(tabId: number): Promise<void> {
  forget(tabId);
  if (!attached.delete(tabId)) return;
  try {
    await chrome.debugger.detach({ tabId });
  } catch {
    // why: the tab closing is the ordinary way this ends, and it is not a failure.
  }
}
