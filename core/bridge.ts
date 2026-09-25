/**
 * The socket an agent outside the browser speaks through, and the whole of it.
 *
 * One connection to a server on the loopback address, one command at a time, and every
 * answer carrying back the id the server put on the question.
 */

import type { AgentCommand, CdpAxNode, Snapshot } from './types';
import type { TabRow } from '../utils/messaging';
import { act } from './act';
import { attach, attachedTabs, detach, isAttached } from './attach';
import { COLOURS, group, groups, ungroup, type Colour } from './groups';
import { query, type Ask } from './query';
import { sensitive } from './sensitive';
import { flatten, read } from './tree';
import { settled, stale } from './watched';

const DEFAULT_WS_URL = 'ws://127.0.0.1:8765';

/** Where the bridge's shared secret is kept, and the whole of what a user configures. */
export const TOKEN_KEY = 'bridgeToken';

const BEARER = 'bearer.';

const POLL_MS = 1000;

const NEEDS_TAB = new Set(['attach', 'detach', 'snapshot', 'query', 'act']);

const DIRECTIONS = new Set(['up', 'down', 'left', 'right']);

type Status = 'connected' | 'connecting' | 'offline';

type Msg = Record<string, unknown>;

type Result = { ok: true; data: unknown } | { ok: false; error: string };

let ws: WebSocket | null = null;
let currentStatus: Status = 'offline';
let configuredUrl = DEFAULT_WS_URL;
let pollTimer: ReturnType<typeof setTimeout> | null = null;
let panelTabs: (() => Promise<TabRow[]>) | null = null;

const held = new Map<number, Snapshot>();

function notifyPanel(): void {
  void chrome.runtime.sendMessage({ type: 'changed' }).catch(() => undefined);
}

function setStatus(status: Status): void {
  if (status === currentStatus) return;
  currentStatus = status;
  notifyPanel();
}

async function tabOf(msg: Msg): Promise<number | null> {
  if (typeof msg.tabId === 'number') return msg.tabId;
  const [here] = await chrome.tabs.query({ active: true, currentWindow: true });
  return here?.id ?? null;
}

async function build(tabId: number): Promise<Snapshot | { error: string }> {
  const tab = await chrome.tabs.get(tabId).catch(() => null);
  if (!tab) return { error: `no tab ${tabId}` };
  if (!isAttached(tabId) && !(await attach(tabId, tab.url))) {
    return { error: `tab ${tabId} cannot be read` };
  }
  const got = (await chrome.debugger.sendCommand({ tabId }, 'Accessibility.getFullAXTree')) as
    | { nodes?: CdpAxNode[] }
    | undefined;
  const sealed = await sensitive(tabId);
  const snapshot = read(tabId, (held.get(tabId)?.version ?? 0) + 1, got?.nodes ?? [], tab.url, sealed);
  // why: a tree nobody holds a debugger on is a page this is no longer reading.
  for (const id of held.keys()) if (!isAttached(id)) held.delete(id);
  held.set(tabId, snapshot);
  settled(tab);
  return snapshot;
}

/** The tree this holds for a tab, rebuilt when the page has moved under it. */
export async function standing(tabId: number): Promise<Snapshot | { error: string }> {
  const kept = held.get(tabId);
  return kept && !stale(tabId) ? kept : build(tabId);
}

function asking(msg: Msg): Ask {
  const ask: Ask = {};
  if (typeof msg.depth === 'number') ask.depth = msg.depth;
  if (Array.isArray(msg.roles)) ask.roles = msg.roles.map(String);
  if (typeof msg.text === 'string') ask.text = msg.text;
  if (msg.interactiveOnly === true) ask.interactiveOnly = true;
  return ask;
}

function commanded(raw: unknown): AgentCommand | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const said = raw as { action?: unknown; nodeId?: unknown; value?: unknown; direction?: unknown };
  if (typeof said.nodeId !== 'number') return null;
  if (said.action === 'click') return { action: 'click', nodeId: said.nodeId };
  if (said.action === 'focus') return { action: 'focus', nodeId: said.nodeId };
  if (said.action === 'setValue' && typeof said.value === 'string') {
    return { action: 'setValue', nodeId: said.nodeId, value: said.value };
  }
  if (said.action === 'scroll' && DIRECTIONS.has(String(said.direction))) {
    const direction = said.direction as 'up' | 'down' | 'left' | 'right';
    return { action: 'scroll', nodeId: said.nodeId, direction };
  }
  return null;
}

function wanted(msg: Msg): [number, ...number[]] | null {
  const said = Array.isArray(msg.tabIds) ? msg.tabIds.filter((one) => typeof one === 'number') : [];
  const [first, ...rest] = said as number[];
  return first === undefined ? null : [first, ...rest];
}

async function executeAction(msg: Msg): Promise<Result> {
  const action = String(msg.action ?? '');
  let tid = 0;
  if (NEEDS_TAB.has(action)) {
    const found = await tabOf(msg);
    if (found === null) return { ok: false, error: 'no tabId, and no active tab' };
    tid = found;
  }

  switch (action) {
    case 'health':
      return { ok: true, data: { attached: attachedTabs(), bridge: currentStatus } };

    case 'tabs':
      return { ok: true, data: panelTabs ? await panelTabs() : [] };

    case 'attach': {
      const tab = await chrome.tabs.get(tid).catch(() => null);
      if (!tab || !(await attach(tid, tab.url))) {
        return { ok: false, error: `tab ${tid} cannot be read` };
      }
      return { ok: true, data: { ok: true } };
    }

    case 'detach': {
      await detach(tid);
      held.delete(tid);
      return { ok: true, data: { ok: true } };
    }

    case 'snapshot': {
      const snapshot = await build(tid);
      return 'error' in snapshot ? { ok: false, error: snapshot.error } : { ok: true, data: snapshot };
    }

    case 'query': {
      const snapshot = await standing(tid);
      if ('error' in snapshot) return { ok: false, error: snapshot.error };
      return { ok: true, data: { ...query(snapshot.root, asking(msg)), degraded: snapshot.degraded } };
    }

    case 'act': {
      const command = commanded(msg.command);
      if (!command) return { ok: false, error: 'no command, or one this does not carry out' };
      const snapshot = await standing(tid);
      if ('error' in snapshot) return { ok: false, error: snapshot.error };
      const done = await act(tid, command, flatten(snapshot.root));
      return done.ok ? { ok: true, data: done } : { ok: false, error: done.error ?? 'refused' };
    }

    case 'group': {
      const tabIds = wanted(msg);
      if (!tabIds) return { ok: false, error: 'tabIds required' };
      const colour = COLOURS.includes(msg.colour as Colour) ? (msg.colour as Colour) : 'blue';
      const title = typeof msg.title === 'string' ? msg.title : 'agent';
      return { ok: true, data: { groupId: await group(tabIds, title, colour) } };
    }

    case 'ungroup': {
      const tabIds = wanted(msg);
      if (!tabIds) return { ok: false, error: 'tabIds required' };
      await ungroup(tabIds);
      return { ok: true, data: { ok: true } };
    }

    case 'groups':
      return { ok: true, data: await groups() };

    default:
      return { ok: false, error: `no action ${action}` };
  }
}

async function handleMessage(raw: string): Promise<string> {
  let msg: Msg;
  try {
    msg = JSON.parse(raw) as Msg;
  } catch {
    return JSON.stringify({ id: '', ok: false, error: 'the command is not json' });
  }
  const id = typeof msg.id === 'string' ? msg.id : '';
  let result: Result;
  try {
    result = await executeAction(msg);
  } catch (err) {
    result = { ok: false, error: String(err) };
  }
  notifyPanel();
  return JSON.stringify({ id, ...result });
}

function loopback(url: string): boolean {
  // why: a bridge on another host would carry the page off this machine.
  try {
    const said = new URL(url);
    return said.protocol === 'ws:' && (said.hostname === '127.0.0.1' || said.hostname === 'localhost');
  } catch {
    return false;
  }
}

function schedulePoll(): void {
  if (pollTimer) return;
  pollTimer = setTimeout(() => {
    pollTimer = null;
    void poll();
  }, POLL_MS);
}

async function secret(): Promise<string> {
  const held = (await chrome.storage.local.get(TOKEN_KEY).catch(() => ({}))) as Record<
    string,
    unknown
  >;
  const said = held[TOKEN_KEY];
  return typeof said === 'string' ? said.trim() : '';
}

async function poll(): Promise<void> {
  if (ws) return;
  if (!loopback(configuredUrl)) {
    setStatus('offline');
    return;
  }
  const token = await secret();
  if (!token) {
    setStatus('offline');
    schedulePoll();
    return;
  }
  setStatus('connecting');
  const socket = new WebSocket(configuredUrl, [`${BEARER}${token}`]);
  ws = socket;
  socket.onopen = () => setStatus('connected');
  socket.onmessage = (event: MessageEvent<string>) => {
    void handleMessage(event.data).then((answer) => {
      if (socket.readyState === WebSocket.OPEN) socket.send(answer);
    });
  };
  socket.onclose = () => {
    if (ws === socket) ws = null;
    setStatus('offline');
    schedulePoll();
  };
  socket.onerror = () => undefined;
}

/** Start dialling the bridge, and keep dialling while it is not there. */
export function initBridge(url?: string, tabs?: () => Promise<TabRow[]>): void {
  if (url) configuredUrl = url;
  if (tabs) panelTabs = tabs;
  void poll();
}

/** Whether the bridge is connected, being dialled, or not there. */
export function getBridgeStatus(): Status {
  return currentStatus;
}

/** The websocket address currently dialled. */
export function getConfiguredWsUrl(): string {
  return configuredUrl;
}
