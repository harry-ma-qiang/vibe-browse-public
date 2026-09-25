// Copyright (C) 2026 harry-ma-qiang
// SPDX-License-Identifier: AGPL-3.0-or-later

/**
 * Choosing the part of a tree worth sending, and saying what was left behind.
 *
 * A whole tree is thousands of nodes. A reader almost always wants one question
 * answered, so this narrows first and reports what the narrowing dropped.
 */

import type { AxNode } from './types';

/** Roles a person can act on, and the default answer to what is worth sending. */
export const INTERACTIVE = new Set([
  'button', 'link', 'textbox', 'checkbox', 'radio', 'combobox', 'listbox',
  'menuitem', 'menuitemcheckbox', 'menuitemradio', 'slider', 'spinbutton',
  'switch', 'tab', 'searchbox',
]);

/** How a reader narrows a tree. Every field is optional and every one narrows. */
export interface Ask {
  depth?: number;
  roles?: string[];
  text?: string;
  interactiveOnly?: boolean;
}

/** What a narrowing produced, beside the count of what it did not send. */
export interface Answer {
  nodes: AxNode[];
  matched: number;
  total: number;
}

function counts(root: AxNode): number {
  return 1 + root.children.reduce((sum, child) => sum + counts(child), 0);
}

function wanted(node: AxNode, ask: Ask): boolean {
  if (ask.interactiveOnly && !INTERACTIVE.has(node.role)) return false;
  if (ask.roles?.length && !ask.roles.includes(node.role)) return false;
  if (ask.text) {
    const said = `${node.name} ${node.value} ${node.description}`.toLowerCase();
    if (!said.includes(ask.text.toLowerCase())) return false;
  }
  return true;
}

function walk(node: AxNode, ask: Ask, depth: number, out: AxNode[]): void {
  if (ask.depth !== undefined && depth > ask.depth) return;
  if (wanted(node, ask)) out.push({ ...node, children: [] });
  for (const child of node.children) walk(child, ask, depth + 1, out);
}

/** The nodes a reader asked for, flat, with what was matched and what was there. */
export function query(root: AxNode, ask: Ask): Answer {
  const nodes: AxNode[] = [];
  walk(root, ask, 0, nodes);
  // why: the flat list drops the shape, so the counts are what say it was bigger.
  return { nodes, matched: nodes.length, total: counts(root) };
}

/** Whether any node carries this text, for a reader waiting on a page. */
export function holds(root: AxNode, text: string): boolean {
  return query(root, { text }).matched > 0;
}
