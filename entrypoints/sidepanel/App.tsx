/**
 * The panel: which tabs this is reading, and the one control that decides.
 *
 * Attaching is the only thing a person does here, and it is deliberately the only
 * thing, because a page nobody attached is a page this has never read.
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
  offline: 'no bridge',
};

function Row({ tab, onToggle }: { tab: TabRow; onToggle: (tab: TabRow) => void }) {
  return (
    <li className="flex items-center gap-2 rounded-md px-2 py-1.5 hover:bg-neutral-100 dark:hover:bg-neutral-800">
      <button
        onClick={() => onToggle(tab)}
        className={`shrink-0 rounded px-2 py-0.5 text-[10px] font-medium transition-colors ${
          tab.attached
            ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300'
            : 'bg-neutral-200 text-neutral-600 dark:bg-neutral-700 dark:text-neutral-300'
        }`}
      >
        {tab.attached ? 'reading' : 'attach'}
      </button>
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
  const reading = state?.tabs.filter((tab) => tab.attached).length ?? 0;

  return (
    <div className="flex h-screen flex-col bg-white text-neutral-800 dark:bg-neutral-900 dark:text-neutral-200">
      <header className="flex items-center justify-between border-b border-neutral-200 px-3 py-2 dark:border-neutral-800">
        <span className="text-xs font-semibold tracking-tight">vibe-browse</span>
        <span className="flex items-center gap-1.5 text-[10px] text-neutral-500">
          <span className={`inline-block h-1.5 w-1.5 rounded-full ${LAMP[bridge]}`} />
          {SAID[bridge]}
        </span>
      </header>

      <p className="px-3 py-2 text-[10px] leading-relaxed text-neutral-500">
        Nothing is read until you attach it. {reading} of {state?.tabs.length ?? 0} tabs.
      </p>

      <ul className="flex-1 overflow-y-auto px-1 pb-2">
        {state?.tabs.map((tab) => <Row key={tab.tabId} tab={tab} onToggle={toggle} />)}
      </ul>
    </div>
  );
}
