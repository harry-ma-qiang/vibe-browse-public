// Copyright (C) 2026 harry-ma-qiang
// SPDX-License-Identifier: AGPL-3.0-or-later

/**
 * Which tabs are being watched, and whether the tree last built still describes one.
 *
 * One record per tab. The background writes it when a page moves; the bridge reads it
 * before handing an agent a tree it built earlier, so there is one staleness and not two.
 */

import type { WatchedTab } from './types';
import { isAttached } from './attach';
import { readable, redact, redactUrl } from './redact';

const watched = new Map<number, WatchedTab>();

function row(tab: chrome.tabs.Tab, stale: boolean, version: number): WatchedTab {
  return {
    tabId: tab.id ?? 0,
    url: redactUrl(tab.url ?? '').text,
    title: redact(tab.title ?? '').text,
    stale,
    version,
    lastEventAt: Date.now(),
  };
}

/** Note a tab whose page moved, so any tree built from it counts as old. */
export function watch(tab: chrome.tabs.Tab): void {
  // why: a tab nobody attached to is a page nobody asked this to read.
  if (tab.id === undefined || !isAttached(tab.id) || !readable(tab.url)) return;
  watched.set(tab.id, row(tab, true, (watched.get(tab.id)?.version ?? 0) + 1));
}

/** Note a tree just built for a tab, reusable until that page moves again. */
export function settled(tab: chrome.tabs.Tab): void {
  if (tab.id === undefined) return;
  watched.set(tab.id, row(tab, false, watched.get(tab.id)?.version ?? 1));
}

/** Say that a tab's page changed under whatever tree was built from it. */
export function invalidate(tabId: number): void {
  const held = watched.get(tabId);
  if (!held) return;
  // why: the reader keeps its old tree; the number is how it learns it is old.
  held.stale = true;
  held.version += 1;
  held.lastEventAt = Date.now();
}

/** Whether the tree last built for a tab has been overtaken by its page. */
export function stale(tabId: number): boolean {
  return watched.get(tabId)?.stale ?? false;
}

/** Stop watching one tab, whose tree nobody should be handed again. */
export function drop(tabId: number): void {
  watched.delete(tabId);
}

/** Every tab worth watching, newest event first. */
export function watchedTabs(): WatchedTab[] {
  return [...watched.values()].sort((a, b) => b.lastEventAt - a.lastEventAt);
}
