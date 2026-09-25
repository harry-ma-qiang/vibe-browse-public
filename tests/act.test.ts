// Copyright (C) 2026 harry-ma-qiang
// SPDX-License-Identifier: AGPL-3.0-or-later

/**
 * What the check before a command is held to, run against a stand-in for the protocol.
 *
 * The node acted on is built the way the snapshot builds it, sealed set and all, so a
 * check that disagreed with the builder would fail here rather than only on a page.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { act } from '../core/act';
import { flatten, read } from '../core/tree';
import type { AxNode, CdpAxNode } from '../core/types';

const TAB = 1;

const SEALED = 7;

const calls: string[] = [];

let live: CdpAxNode | null = null;

const stub = {
  debugger: {
    sendCommand: async (_target: unknown, method: string) => {
      calls.push(method);
      if (method !== 'Accessibility.getPartialAXTree') return undefined;
      return { nodes: live ? [live] : [] };
    },
  },
};

(globalThis as unknown as { chrome: unknown }).chrome = stub;

const node = (role: string, name: string): CdpAxNode => ({
  nodeId: '2',
  role: { type: 'role', value: role },
  name: { type: 'string', value: name },
  backendDOMNodeId: SEALED,
});

const page = (name: string): CdpAxNode[] => [
  {
    nodeId: '1',
    role: { type: 'role', value: 'RootWebArea' },
    name: { type: 'string', value: 'checkout' },
    childIds: ['2'],
  },
  node('textbox', name),
];

function held(name: string): Map<number, AxNode> {
  const snapshot = read(TAB, 1, page(name), 'https://example.invalid/checkout', {
    ids: new Set([SEALED]),
    degraded: false,
  });
  return flatten(snapshot.root);
}

test('a_sealed_field_the_name_heuristic_missed_still_takes_a_value', async () => {
  calls.length = 0;
  live = node('textbox', 'PIN');
  const nodes = held('PIN');
  const was = nodes.get(2);
  assert.equal(was?.value, '[password]');
  assert.equal(was?.name, '', 'the builder empties a sealed name, and the live page does not');
  const done = await act(TAB, { action: 'setValue', nodeId: 2, value: '4321' }, nodes);
  assert.deepEqual(done, { ok: true });
  assert.ok(calls.includes('Input.insertText'));
});

test('a_sealed_field_the_name_heuristic_did_match_still_takes_a_value', async () => {
  calls.length = 0;
  live = node('textbox', 'Password');
  const done = await act(TAB, { action: 'setValue', nodeId: 2, value: 'hunter2' }, held('Password'));
  assert.deepEqual(done, { ok: true });
});

test('a_node_whose_role_changed_is_refused', async () => {
  calls.length = 0;
  live = node('button', 'PIN');
  const done = await act(TAB, { action: 'setValue', nodeId: 2, value: '4321' }, held('PIN'));
  assert.equal(done.ok, false);
  assert.match(done.error ?? '', /no longer the textbox/);
  assert.ok(!calls.includes('Input.insertText'));
});

test('a_node_whose_handle_now_names_another_element_is_refused', async () => {
  calls.length = 0;
  live = { ...node('textbox', 'PIN'), backendDOMNodeId: SEALED + 1 };
  const done = await act(TAB, { action: 'setValue', nodeId: 2, value: '4321' }, held('PIN'));
  assert.equal(done.ok, false);
  assert.ok(!calls.includes('Input.insertText'));
});

test('a_node_the_page_no_longer_carries_is_refused', async () => {
  calls.length = 0;
  live = null;
  const done = await act(TAB, { action: 'click', nodeId: 2 }, held('PIN'));
  assert.equal(done.ok, false);
  assert.ok(!calls.includes('Input.dispatchMouseEvent'));
});
