/**
 * Turning the protocol's tree into the one an agent reads.
 *
 * The protocol sends every node it knows, most of which describe layout rather than
 * anything a person could act on. What comes out here is the part worth a token.
 */

import type { AxNode, CdpAxNode, Sealed, Snapshot } from './types';
import { isPassword, readable, redactNode } from './redact';

/** Roles that describe layout rather than anything a reader could act on. */
export const NOISE = new Set(['none', 'presentation', 'LineBreak', 'InlineTextBox', 'generic']);

/** Roles kept even when the protocol ignored them, because they can still be acted on. */
export const RESCUED = new Set(['button', 'link', 'textbox', 'checkbox', 'radio', 'combobox', 'menuitem']);

interface Building {
  by: Map<string, CdpAxNode>;
  next: () => number;
  replaced: Record<string, number>;
  sealed: ReadonlySet<number>;
}

function shut(node: CdpAxNode, held: Building): boolean {
  return node.backendDOMNodeId !== undefined && held.sealed.has(node.backendDOMNodeId);
}

function levelOf(node: CdpAxNode): number | null {
  const held = node.properties?.find((p) => p.name === 'level');
  return held ? Number(held.value?.value) || null : null;
}

function tally(held: Building, counts: Record<string, number>): void {
  for (const [k, n] of Object.entries(counts)) held.replaced[k] = (held.replaced[k] ?? 0) + n;
}

function build(id: string, held: Building, forced = false): AxNode | null {
  const node = held.by.get(id);
  if (!node) return null;
  const said = redactNode(node, shut(node, held));
  const sealed = said.replaced.password !== undefined;
  if (!sealed && !forced && NOISE.has(said.role)) return null;
  tally(held, said.replaced);
  return {
    id: held.next(),
    role: said.role,
    name: said.name,
    value: said.value,
    description: said.description,
    level: levelOf(node),
    backendDomNodeId: node.backendDOMNodeId ?? null,
    children: sealed ? [] : gather(node.childIds ?? [], held),
  };
}

function gather(ids: string[], held: Building): AxNode[] {
  const out: AxNode[] = [];
  for (const id of ids) {
    const node = held.by.get(id);
    if (!node) continue;
    // why: a dropped node hands its children up, which is where the secret gets out.
    if (shut(node, held) || isPassword(node)) {
      const built = build(id, held, true);
      if (built) out.push(built);
      continue;
    }
    if (!node.ignored) {
      const built = build(id, held);
      if (built) out.push(built);
      else out.push(...gather(node.childIds ?? [], held));
      continue;
    }
    // why: an ignored button is still a button, and dropping it loses the only way in.
    const rescued = RESCUED.has(node.role?.value ?? '') && node.backendDOMNodeId !== undefined;
    const built = rescued ? build(id, held, true) : null;
    if (built) out.push(built);
    else out.push(...gather(node.childIds ?? [], held));
  }
  return out;
}

const EMPTY: AxNode = { id: 0, role: 'empty', name: '', value: '', description: '',
                        level: null, backendDomNodeId: null, children: [] };

/** One tree as an agent reads it. A page on the blocked list is refused, not built. */
export function read(
  tabId: number,
  version: number,
  nodes: CdpAxNode[],
  url?: string,
  sealed?: Sealed,
): Snapshot {
  const degraded = sealed?.degraded ?? false;
  if (url !== undefined && !readable(url)) {
    return { tabId, version, root: { ...EMPTY, role: 'refused' },
             replaced: { blocked: 1 }, builtAt: Date.now(), degraded };
  }
  let seq = 0;
  const held: Building = {
    by: new Map(nodes.map((node) => [node.nodeId, node])),
    next: () => ++seq,
    replaced: {},
    sealed: sealed?.ids ?? new Set<number>(),
  };
  const first = nodes[0];
  const root = first ? build(first.nodeId, held, true) : null;
  return {
    tabId,
    version,
    root: root ?? { ...EMPTY },
    replaced: held.replaced,
    builtAt: Date.now(),
    degraded,
  };
}

/** Every node of a tree, flat, for a reader looking one up by id. */
export function flatten(root: AxNode): Map<number, AxNode> {
  const out = new Map<number, AxNode>();
  const walk = (node: AxNode) => {
    out.set(node.id, node);
    node.children.forEach(walk);
  };
  walk(root);
  return out;
}
