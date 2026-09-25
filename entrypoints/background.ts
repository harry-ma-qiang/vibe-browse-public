/**
 * The one long-lived process: it watches tabs and says when a tree went stale.
 *
 * It holds no tree and builds none. A reader asking for a snapshot gets one built
 * on demand; a reader holding an old version learns that it is old.
 */

import type { WatchedTab } from '../core/types';
import type { Answer, Ask, PanelState, TabRow } from '../utils/messaging';
import { attach, detach, isAttached, release } from '../core/attach';

declare function defineBackground(main: () => void): unknown;
import { readable, redact, redactUrl } from '../core/redact';

const KEEPALIVE_MINUTES = 1;

const watched = new Map<number, WatchedTab>();

function watch(tab: chrome.tabs.Tab): void {
  // why: a tab nobody attached to is a page nobody asked this to read.
  if (tab.id === undefined || !isAttached(tab.id) || !readable(tab.url)) return;
  const held = watched.get(tab.id);
  watched.set(tab.id, {
    tabId: tab.id,
    url: redactUrl(tab.url ?? '').text,
    title: redact(tab.title ?? '').text,
    stale: true,
    version: (held?.version ?? 0) + 1,
    lastEventAt: Date.now(),
  });
}

function invalidate(tabId: number): void {
  const held = watched.get(tabId);
  if (!held) return;
  // why: the reader keeps its old tree; the number is how it learns it is old.
  held.stale = true;
  held.version += 1;
  held.lastEventAt = Date.now();
}

function forget(tabId: number): void {
  release(tabId);
  watched.delete(tabId);
}

/** Every tab worth watching, newest event first. */
export function watchedTabs(): WatchedTab[] {
  return [...watched.values()].sort((a, b) => b.lastEventAt - a.lastEventAt);
}

async function panel(): Promise<PanelState> {
  const rows = new Map<number, TabRow>();
  const here = await chrome.tabs.query({ active: true, currentWindow: true });
  for (const tab of here) {
    if (tab.id === undefined || !readable(tab.url)) continue;
    rows.set(tab.id, {
      tabId: tab.id,
      title: redact(tab.title ?? '').text,
      url: redactUrl(tab.url ?? '').text,
      attached: isAttached(tab.id),
      stale: watched.get(tab.id)?.stale ?? false,
    });
  }
  for (const held of watchedTabs()) {
    rows.set(held.tabId, {
      tabId: held.tabId,
      title: held.title,
      url: held.url,
      attached: isAttached(held.tabId),
      stale: held.stale,
    });
  }
  return { tabs: [...rows.values()], bridge: 'offline' };
}

function asked(message: unknown): Ask | null {
  if (typeof message !== 'object' || message === null) return null;
  const said = message as { type?: unknown; tabId?: unknown };
  if (said.type === 'state') return { type: 'state' };
  if (typeof said.tabId !== 'number') return null;
  if (said.type === 'attach') return { type: 'attach', tabId: said.tabId };
  if (said.type === 'detach') return { type: 'detach', tabId: said.tabId };
  return null;
}

async function answer(said: Ask): Promise<Answer> {
  if (said.type === 'state') return { ok: true, data: await panel() };
  if (said.type === 'detach') {
    await detach(said.tabId);
    watched.delete(said.tabId);
    return { ok: true, data: null };
  }
  const tab = await chrome.tabs.get(said.tabId).catch(() => null);
  if (!tab || !(await attach(said.tabId, tab.url))) return { ok: false, error: 'refused' };
  watch(tab);
  return { ok: true, data: null };
}

function mine(sender: chrome.runtime.MessageSender): boolean {
  return sender.id === chrome.runtime.id && sender.tab === undefined;
}

/** The background process itself: every listener this extension owns, and no other. */
export default defineBackground(() => {
  chrome.runtime.onMessage.addListener((message: unknown, sender, reply) => {
    const said = mine(sender) ? asked(message) : null;
    if (!said) {
      reply({ ok: false, error: 'refused' });
      return false;
    }
    void answer(said).then(reply);
    return true;
  });

  chrome.debugger.onEvent.addListener((source, method, params) => {
    if (source.tabId === undefined || method !== 'Runtime.bindingCalled') return;
    const named = (params as { name?: unknown } | undefined)?.name;
    if (named === 'axChanged') invalidate(source.tabId);
  });

  chrome.debugger.onDetach.addListener((source) => {
    if (source.tabId !== undefined) forget(source.tabId);
  });

  chrome.tabs.onRemoved.addListener((tabId) => forget(tabId));

  chrome.tabs.onUpdated.addListener((tabId, changed, tab) => {
    if (isAttached(tabId) && !readable(tab.url)) {
      void detach(tabId);
      watched.delete(tabId);
      return;
    }
    if (changed.status === 'loading' || changed.url !== undefined) watch(tab);
    else if (changed.status === 'complete') invalidate(tabId);
  });

  chrome.alarms.create('keepalive', { periodInMinutes: KEEPALIVE_MINUTES });
  chrome.alarms.onAlarm.addListener((alarm) => {
    if (alarm.name === 'keepalive') void watched.size;
  });
});
