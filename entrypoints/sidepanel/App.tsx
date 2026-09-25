/**
 * The panel: which tabs this is reading, and the one control that decides.
 *
 * Attaching is the only thing a person does here, and it is deliberately the only
 * thing. It is not the only way a tab is attached: the bridge attaches them too, and
 * those show in this list beside the ones clicked.
 */

import { useCallback, useEffect, useState } from 'react';
import { ask, type PanelState, type TabRow } from '../../utils/messaging';

const LAMP = {
  connected: 'bg-emerald-500',
  connecting: 'bg-amber-400 animate-pulse',
  offline: 'bg-neutral-300 dark:bg-neutral-600',
};

const SAID = {
  connected: 'bridge up',
  connecting: 'connecting',
  offline: 'bridge offline',
};

function Button({ tab, onToggle }: { tab: TabRow; onToggle: (tab: TabRow) => void }) {
  if (!tab.readable) {
    return (
      <span className="shrink-0 rounded px-2 py-0.5 text-[10px] font-medium text-neutral-400 dark:text-neutral-500">
        not readable
      </span>
    );
  }
  return (
    <button
      onClick={() => onToggle(tab)}
      className={`shrink-0 rounded px-2 py-0.5 text-[10px] font-medium transition-colors ${
        tab.attached
          ? 'bg-emerald-100 text-emerald-800 hover:bg-emerald-200 dark:bg-emerald-900/40 dark:text-emerald-300'
          : 'bg-neutral-200 text-neutral-700 hover:bg-neutral-300 dark:bg-neutral-700 dark:text-neutral-200'
      }`}
    >
      {tab.attached ? 'detach' : 'attach'}
    </button>
  );
}

function Row({ tab, onToggle }: { tab: TabRow; onToggle: (tab: TabRow) => void }) {
  return (
    <li className="flex items-center gap-2 rounded-md px-2 py-1.5 hover:bg-neutral-100 dark:hover:bg-neutral-800">
      <Button tab={tab} onToggle={onToggle} />
      <div className="min-w-0 flex-1">
        <div className="truncate text-[11px] text-neutral-800 dark:text-neutral-100">
          {tab.title || '(no title)'}
        </div>
        <div className="truncate text-[10px] text-neutral-400">{tab.url}</div>
      </div>
      {tab.attached && tab.stale ? (
        <span className="shrink-0 text-[10px] text-amber-600 dark:text-amber-400">stale</span>
      ) : null}
    </li>
  );
}

/** The whole panel, redrawn whenever the background says something changed. */
export function App() {
  const [state, setState] = useState<PanelState | null>(null);

  const refresh = useCallback(async () => {
    const answer = await ask<PanelState>({ type: 'state' });
    if (answer.ok) setState(answer.data);
  }, []);

  useEffect(() => {
    void refresh();
    const timer = setInterval(refresh, 1500);
    return () => clearInterval(timer);
  }, [refresh]);

  const toggle = useCallback(
    async (tab: TabRow) => {
      await ask({ type: tab.attached ? 'detach' : 'attach', tabId: tab.tabId });
      void refresh();
    },
    [refresh],
  );

  const bridge = state?.bridge ?? 'offline';
  const tabs = state?.tabs ?? [];

  return (
    <div className="flex h-screen flex-col bg-white text-neutral-800 dark:bg-neutral-900 dark:text-neutral-200">
      <header className="flex items-center justify-between border-b border-neutral-200 px-3 py-2 dark:border-neutral-800">
        <span className="text-xs font-semibold tracking-tight">vibe-browse</span>
        <span className="flex items-center gap-1.5 text-[10px] text-neutral-500">
          <span className={`inline-block h-1.5 w-1.5 rounded-full ${LAMP[bridge]}`} />
          {SAID[bridge]}
        </span>
      </header>

      {bridge === 'offline' ? (
        <p className="border-b border-neutral-200 px-3 py-2 text-[10px] leading-relaxed text-neutral-500 dark:border-neutral-800">
          No agent can reach this yet. Start the bridge with{' '}
          <code className="rounded bg-neutral-100 px-1 py-0.5 text-[10px] text-neutral-700 dark:bg-neutral-800 dark:text-neutral-200">
            uv run server.py
          </code>{' '}
          in the project&apos;s <span className="font-medium">bridge</span> folder, then store
          its token as the README describes. Without a stored token this does not dial at all.
        </p>
      ) : null}

      <p className="px-3 py-2 text-[10px] leading-relaxed text-neutral-500">
        Nothing is read until it is attached. Every tab the bridge attaches appears here
        too, and whoever holds the bridge token can attach one without clicking.
      </p>

      <ul className="flex-1 overflow-y-auto px-1 pb-2">
        {tabs.map((tab) => (
          <Row key={tab.tabId} tab={tab} onToggle={toggle} />
        ))}
        {tabs.length === 0 ? (
          <li className="px-2 py-1.5 text-[10px] text-neutral-400">
            Open a web page in this window and it appears here to attach.
          </li>
        ) : null}
      </ul>
    </div>
  );
}
