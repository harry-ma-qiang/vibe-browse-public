/**
 * What the tree an agent is holding is held to, run against a stand-in for the protocol.
 *
 * The stand-in counts how many times the tree was fetched, which is the only way to
 * tell a snapshot that was rebuilt from one that was handed back out of the cache.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { standing } from '../core/bridge';
import { invalidate, stale } from '../core/watched';
import type { Snapshot } from '../core/types';

const TAB = 9;

let page = 'first';

let fetched = 0;

const tree = (name: string) => [
  { nodeId: '1', role: { type: 'role', value: 'RootWebArea' }, name: { type: 'string', value: name } },
];

const stub = {
  tabs: {
    get: async (tabId: number) => ({ id: tabId, url: 'https://example.invalid/in', title: 'a page' }),
  },
  debugger: {
    attach: async () => undefined,
    detach: async () => undefined,
    sendCommand: async (_target: unknown, method: string) => {
      if (method !== 'Accessibility.getFullAXTree') return undefined;
      fetched += 1;
      return { nodes: tree(page) };
    },
  },
};

(globalThis as unknown as { chrome: unknown }).chrome = stub;

async function built(tabId: number): Promise<Snapshot> {
  const said = await standing(tabId);
  if ('error' in said) throw new Error(said.error);
  return said;
}

test('a_tree_still_describing_its_page_is_handed_back_without_a_second_fetch', async () => {
  fetched = 0;
  page = 'first';
  const one = await built(TAB);
  assert.equal(fetched, 1);
  assert.equal(one.root.name, 'first');
  assert.equal(stale(TAB), false);
  const again = await built(TAB);
  assert.equal(fetched, 1);
  assert.equal(again.version, one.version);
});

test('a_changed_page_is_rebuilt_and_the_old_tree_is_not_reused', async () => {
  const one = await built(TAB);
  page = 'second';
  assert.equal((await built(TAB)).root.name, 'first');
  invalidate(TAB);
  assert.equal(stale(TAB), true);
  const later = await built(TAB);
  assert.equal(fetched, 2);
  assert.equal(later.root.name, 'second');
  assert.ok(later.version > one.version);
  assert.equal(stale(TAB), false);
});
