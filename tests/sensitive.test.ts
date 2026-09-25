/**
 * What the sensitive-field lookup is held to, run against a stand-in for the protocol.
 *
 * No browser is started here. The stand-in answers the four calls the lookup makes and
 * can be made to fail, which is the case the snapshot must survive.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { forget, sensitive, WORLD } from '../core/sensitive';
import { read } from '../core/tree';
import type { CdpAxNode } from '../core/types';

const BEFORE = JSON.parse(readFileSync('tests/fixtures/ax-before.json', 'utf8')) as CdpAxNode[];

const BACKEND: Record<number, number> = { 5: 23, 6: 26, 7: 27 };

const calls: { method: string; params: Record<string, unknown> }[] = [];

let answer: number[] | 'fail' = [0, 2];

const stub = {
  debugger: {
    sendCommand: async (_target: unknown, method: string, params?: Record<string, unknown>) => {
      calls.push({ method, params: params ?? {} });
      if (answer === 'fail') throw new Error('the tab is gone');
      if (method === 'DOM.getDocument') return { root: { nodeId: 1 } };
      if (method === 'DOM.querySelectorAll') return { nodeIds: [5, 6, 7] };
      if (method === 'DOM.describeNode') {
        return { node: { backendNodeId: BACKEND[Number(params?.nodeId)] } };
      }
      if (method === 'Page.getFrameTree') return { frameTree: { frame: { id: 'F1' } } };
      if (method === 'Page.createIsolatedWorld') return { executionContextId: 99 };
      if (method === 'Runtime.evaluate') return { result: { value: answer } };
      return undefined;
    },
  },
};

(globalThis as unknown as { chrome: unknown }).chrome = stub;

const called = (method: string) => calls.filter((one) => one.method === method);

test('the_document_names_the_fields_and_they_come_back_as_backend_ids', async () => {
  calls.length = 0;
  answer = [0, 2];
  const found = await sensitive(1);
  assert.equal(found.degraded, false);
  assert.deepEqual([...found.ids].sort((a, b) => a - b), [23, 27]);
  assert.equal(called('DOM.describeNode').length, 3);
});

test('the_probe_is_evaluated_in_the_isolated_world_and_never_in_the_page', async () => {
  calls.length = 0;
  answer = [1];
  await sensitive(1);
  const made = called('Page.createIsolatedWorld')[0];
  assert.equal(made?.params.worldName, WORLD);
  const ran = called('Runtime.evaluate')[0];
  assert.equal(ran?.params.contextId, 99);
  assert.equal(ran?.params.returnByValue, true);
  assert.ok(String(ran?.params.expression).includes('webkitTextSecurity'));
});

test('a_field_that_was_ever_sensitive_stays_sealed_until_the_tab_is_let_go', async () => {
  answer = [];
  const still = await sensitive(1);
  assert.deepEqual([...still.ids].sort((a, b) => a - b), [23, 26, 27]);
  forget(1);
  const fresh = await sensitive(1);
  assert.deepEqual([...fresh.ids], []);
});

test('a_failed_lookup_is_degraded_and_still_yields_a_tree', async () => {
  answer = 'fail';
  const found = await sensitive(2);
  assert.equal(found.degraded, true);
  assert.deepEqual([...found.ids], []);
  const snapshot = read(2, 1, BEFORE, undefined, found);
  assert.equal(snapshot.degraded, true);
  assert.equal(snapshot.root.role, 'RootWebArea');
  assert.ok(snapshot.root.children.length > 0);
  assert.ok((snapshot.replaced.password ?? 0) >= 3);
});

test('what_was_already_known_survives_a_failed_lookup', async () => {
  answer = [0];
  assert.deepEqual([...(await sensitive(3)).ids], [23]);
  answer = 'fail';
  const found = await sensitive(3);
  assert.equal(found.degraded, true);
  assert.deepEqual([...found.ids], [23]);
  forget(3);
});
