// Copyright (C) 2026 harry-ma-qiang
// SPDX-License-Identifier: AGPL-3.0-or-later

/**
 * What the extension passes between its halves.
 *
 * Two trees appear here. Chrome sends `CdpAxNode`, whose fields are wrappers and whose
 * children are ids to look up. `AxNode` is what this extension keeps and hands out.
 */

/** A tab being watched, and whether its tree still describes the page. */
export interface WatchedTab {
  tabId: number;
  url: string;
  title: string;
  stale: boolean;
  version: number;
  lastEventAt: number;
}

/** One value as the protocol wraps it, a type beside the thing itself. */
export interface CdpAxValue {
  type: string;
  value: string;
}

/** One property of a protocol node. */
export interface CdpAxProperty {
  name: string;
  value?: CdpAxValue;
}

/** One node as the protocol sends it, children named by id rather than held. */
export interface CdpAxNode {
  nodeId: string;
  ignored?: boolean;
  role?: CdpAxValue;
  name?: CdpAxValue;
  value?: CdpAxValue;
  description?: CdpAxValue;
  properties?: CdpAxProperty[];
  childIds?: string[];
  backendDOMNodeId?: number;
}

/** One node as this extension keeps it: unwrapped, children held, one small id. The
 *  id is small because an agent reads it aloud and types it back. */
export interface AxNode {
  id: number;
  role: string;
  name: string;
  value: string;
  description: string;
  level: number | null;
  backendDomNodeId: number | null;
  children: AxNode[];
}

/** Which nodes the document says hold a secret, and whether that lookup fell back. */
export interface Sealed {
  ids: ReadonlySet<number>;
  degraded: boolean;
}

/** One tree as built, held between the building of it and the reading of it. */
export interface Snapshot {
  tabId: number;
  version: number;
  root: AxNode;
  replaced: Record<string, number>;
  builtAt: number;
  degraded: boolean;
}

/** What an agent may ask for, whole. No command finds anything: finding is reading
 *  the tree the agent already holds. */
export type AgentCommand =
  | { action: 'click'; nodeId: number }
  | { action: 'setValue'; nodeId: number; value: string }
  | { action: 'focus'; nodeId: number }
  | { action: 'scroll'; nodeId: number; direction: 'up' | 'down' | 'left' | 'right' };

/** What a command produced, in the form the bridge puts on the wire. */
export interface CommandResult {
  ok: boolean;
  error?: string;
}
