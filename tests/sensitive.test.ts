// Copyright (C) 2026 harry-ma-qiang
// SPDX-License-Identifier: AGPL-3.0-or-later

/**
 * What the sensitive-field lookup is held to, run against a stand-in for the protocol.
 *
 * No browser is started here. The stand-in answers the calls the lookup makes and can
 * be made to fail, which is the case the snapshot must survive. The probe itself is a
 * string of JavaScript, so it is run against a stand-in document too.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { forget, PROBE, sensitive, WORLD } from '../core/sensitive';
import { flatten, read } from '../core/tree';
import type { AxNode, CdpAxNode } from '../core/types';

const dump = (label: string): CdpAxNode[] =>
  JSON.parse(readFileSync(`tests/fixtures/ax-${label}.json`, 'utf8')) as CdpAxNode[];

const BEFORE = dump('before');
const AFTER = dump('after');

const CLEARTEXT = 'CORRECT-HORSE-BATTERY-1';

const NODE: Record<string, number> = { E0: 5, E1: 6, E2: 7 };

const BACKEND: Record<number, number> = { 5: 23, 6: 26, 7: 27 };

const calls: { method: string; params: Record<string, unknown> }[] = [];

let answer: number[] | 'fail' = [0, 2];

const properties = (indices: number[]) => ({
  result: [
    ...indices.map((one, at) => ({ name: String(at), value: { objectId: `E${one}` } })),
    { name: 'length', value: { type: 'number', value: indices.length } },
  ],
});

const stub = {
  debugger: {
    sendCommand: async (_target: unknown, method: string, params?: Record<string, unknown>) => {
      calls.push({ method, params: params ?? {} });
      if (answer === 'fail') throw new Error('the tab is gone');
      if (method === 'DOM.getDocument') return { root: { nodeId: 1 } };
      if (method === 'Page.getFrameTree') return { frameTree: { frame: { id: 'F1' } } };
      if (method === 'Page.createIsolatedWorld') return { executionContextId: 99 };
      if (method === 'Runtime.evaluate') return { result: { objectId: 'FOUND' } };
      if (method === 'Runtime.getProperties') return properties(answer);
      if (method === 'DOM.requestNode') return { nodeId: NODE[String(params?.objectId)] };
      if (method === 'DOM.describeNode') {
        return { node: { backendNodeId: BACKEND[Number(params?.nodeId)] } };
      }
      return undefined;
    },
  },
};

(globalThis as unknown as { chrome: unknown }).chrome = stub;

const called = (method: string) => calls.filter((one) => one.method === method);

const byBackend = (root: AxNode, backend: number): AxNode | undefined =>
  [...flatten(root).values()].find((one) => one.backendDomNodeId === backend);

const field = (tag: string, attrs: Record<string, string>, extra: Record<string, unknown> = {}) => ({
  tag,
  getAttribute: (name: string) => attrs[name] ?? null,
  ...extra,
});

const host = (tag: string, shadowRoot: unknown) => ({ tag, getAttribute: () => null, shadowRoot });

const rootOf = (kids: { tag: string }[]) => ({
  querySelectorAll: (selector: string) =>
    selector === '*' ? kids : kids.filter((one) => one.tag === 'input' || one.tag === 'textarea'),
});

const styleOf = (el: { security?: string }) => ({ webkitTextSecurity: el.security ?? 'none' });

function probe(document: unknown): { tag: string; mark?: string }[] {
  const run = new Function('document', 'getComputedStyle', `return ${PROBE}`);
  return run(document, styleOf) as { tag: string; mark?: string }[];
}

const marks = (kids: { tag: string }[]): string[] =>
  probe(rootOf(kids)).map((one) => one.mark ?? '?');

const input = (name: string) => field('input', { name }, { type: 'text', mark: name });

test('the_document_names_the_fields_and_they_come_back_as_backend_ids', async () => {
  calls.length = 0;
  answer = [0, 2];
  const found = await sensitive(1);
  assert.equal(found.degraded, false);
  assert.deepEqual([...found.ids].sort((a, b) => a - b), [23, 27]);
  assert.equal(called('DOM.requestNode').length, 2);
  assert.equal(called('DOM.describeNode').length, 2);
  assert.equal(called('Runtime.releaseObject')[0]?.params.objectId, 'FOUND');
});

test('the_probe_is_evaluated_in_the_isolated_world_and_never_in_the_page', async () => {
  calls.length = 0;
  answer = [1];
  await sensitive(1);
  const made = called('Page.createIsolatedWorld')[0];
  assert.equal(made?.params.worldName, WORLD);
  const ran = called('Runtime.evaluate')[0];
  assert.equal(ran?.params.contextId, 99);
  assert.equal(ran?.params.returnByValue, false);
  assert.equal(ran?.params.expression, PROBE);
});

test('the_probe_names_a_field_on_any_of_the_four_signals', () => {
  assert.deepEqual(
    marks([
      field('input', {}, { type: 'password', mark: 'type' }),
      field('input', {}, { type: 'text', security: 'disc', mark: 'style' }),
      field('input', { autocomplete: 'one-time-code' }, { type: 'text', mark: 'otp-hint' }),
      field('input', { autocomplete: 'current-password' }, { type: 'text', mark: 'pw-hint' }),
      field('textarea', { id: 'recovery-code' }, { mark: 'named' }),
      field('input', {}, { type: 'text', mark: 'plain' }),
    ]),
    ['type', 'style', 'otp-hint', 'pw-hint', 'named'],
  );
});

test('the_name_is_matched_by_whole_word_and_not_by_substring', () => {
  const sealed = [
    'password',
    'passwd',
    'otp',
    'secret',
    'token',
    'recovery',
    'cvv',
    'cvc',
    'pin',
    'ssn',
  ];
  const open = ['shipping', 'passenger', 'tokenizer', 'spinner', 'campaign', 'postcode', 'coupon'];
  assert.deepEqual(marks(sealed.map(input)), sealed);
  assert.deepEqual(marks(open.map(input)), []);
});

test('a_name_split_on_a_dash_an_underscore_a_digit_or_a_case_is_one_word', () => {
  const split = ['new-password', 'user_otp', 'cvv2', 'accountSsn', 'RECOVERY_CODE'];
  assert.deepEqual(marks(split.map(input)), split);
  assert.deepEqual(marks(['shipping-address', 'passenger_1', 'tokenizerId'].map(input)), []);
});

test('a_field_inside_an_open_shadow_root_is_named_and_a_closed_one_cannot_be', () => {
  const inner = field('input', {}, { type: 'password', mark: 'shadowed' });
  const deeper = field('input', { name: 'otp' }, { type: 'text', mark: 'deeper' });
  const nested = host('div', rootOf([deeper]));
  const opened = host('my-login', rootOf([inner, nested]));
  const closed = host('my-vault', null);
  assert.deepEqual(marks([opened, closed, input('pin')]), ['pin', 'shadowed', 'deeper']);
});

test('a_field_that_was_ever_sensitive_stays_sealed_until_the_tab_is_let_go', async () => {
  answer = [];
  const still = await sensitive(1);
  assert.deepEqual([...still.ids].sort((a, b) => a - b), [23, 26, 27]);
  forget(1);
  const fresh = await sensitive(1);
  assert.deepEqual([...fresh.ids], []);
});

test('a_revealed_password_does_not_reach_a_built_snapshot', async () => {
  forget(4);
  answer = [0, 2];
  assert.deepEqual([...(await sensitive(4)).ids].sort((a, b) => a - b), [23, 27]);
  answer = [];
  const still = await sensitive(4);
  assert.deepEqual([...still.ids].sort((a, b) => a - b), [23, 27]);
  assert.ok(JSON.stringify(AFTER).includes(CLEARTEXT), 'the dump must carry the cleartext');
  const snapshot = read(4, 2, AFTER, undefined, still);
  assert.equal(byBackend(snapshot.root, 23)?.value, '[password]');
  assert.equal(byBackend(snapshot.root, 27)?.value, '[password]');
  assert.ok(!JSON.stringify(snapshot).includes(CLEARTEXT));
  forget(4);
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
