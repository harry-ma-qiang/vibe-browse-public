/**
 * What the panel and the background say to each other, and the whole of it.
 *
 * Every message names one thing the background can do. There is none for a screenshot,
 * a console line or a stored setting, because none of those is done here.
 */

/** What a panel may ask the background for. */
export type Ask =
  | { type: 'state' }
  | { type: 'attach'; tabId: number }
  | { type: 'detach'; tabId: number };

/** What the background answers: the thing asked for, or why not. */
export type Answer<T = unknown> = { ok: true; data: T } | { ok: false; error: string };

/** One tab as the panel shows it. */
export interface TabRow {
  tabId: number;
  title: string;
  url: string;
  attached: boolean;
  stale: boolean;
  readable: boolean;
}

/** Everything the panel draws, fetched in one call. */
export interface PanelState {
  tabs: TabRow[];
  bridge: 'connected' | 'connecting' | 'offline';
}

/** Ask the background something, and wait for its answer. */
export function ask<T>(message: Ask): Promise<Answer<T>> {
  return new Promise((resolve) => {
    chrome.runtime.sendMessage(message, (answer: Answer<T>) => {
      const failed = chrome.runtime.lastError;
      resolve(failed ? { ok: false, error: failed.message ?? 'no answer' } : answer);
    });
  });
}
