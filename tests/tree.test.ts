/**
 * What the tree builder is held to, run against two real protocol dumps.
 *
 * The dumps in `fixtures/` came from Chrome 153 reading a sign-in page written for
 * this test. Every secret in them is invented; the email local part was renamed.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { flatten, read } from '../core/tree';
import { query } from '../core/query';
import type { AxNode, CdpAxNode } from '../core/types';

const said = (value: string) => ({ type: 'string', value });

const dump = (label: string): CdpAxNode[] =>
  JSON.parse(readFileSync(`tests/fixtures/ax-${label}.json`, 'utf8')) as CdpAxNode[];

const BEFORE = dump('before');
const AFTER = dump('after');

const CLEARTEXT = 'CORRECT-HORSE-BATTERY-1';
const MASKED = '•'.repeat(23);
const UNNAMED = '•'.repeat(19);
const CARD = '4111 1111 1111 1111';
const EMAIL = 'user.test@example.com';
const KEY = 'AKIAIOSFODNN7EXAMPLE';

const byBackend = (root: AxNode, backend: number): AxNode | undefined =>
  [...flatten(root).values()].find((one) => one.backendDomNodeId === backend);

test('a_named_control_appears_in_the_interactive_tree', () => {
  const snapshot = read(1, 1, BEFORE);
  const answer = query(snapshot.root, { interactiveOnly: true });
  const signIn = answer.nodes.find((one) => one.name === 'Sign in');
  assert.equal(signIn?.role, 'button');
  assert.ok(Number.isInteger(signIn?.id));
  assert.ok(answer.matched < answer.total);
});

test('a_password_field_carries_a_marker_and_not_a_value', () => {
  const snapshot = read(1, 1, BEFORE);
  const held = byBackend(snapshot.root, 23);
  assert.equal(held?.value, '[password]');
  assert.equal(held?.name, '');
  assert.deepEqual(held?.children, []);
  assert.ok(!JSON.stringify(snapshot).includes(MASKED));
});

test('a_revealed_password_does_not_reach_a_built_snapshot', () => {
  assert.ok(JSON.stringify(AFTER).includes(CLEARTEXT), 'the dump must carry the cleartext');
  const snapshot = read(1, 1, AFTER);
  assert.ok(!JSON.stringify(snapshot).includes(CLEARTEXT));
});

test('the_one_time_code_and_the_recovery_code_are_sealed', () => {
  const snapshot = read(1, 1, BEFORE);
  assert.equal(byBackend(snapshot.root, 24)?.value, '[password]');
  assert.equal(byBackend(snapshot.root, 25)?.value, '[password]');
  const text = JSON.stringify(snapshot);
  assert.ok(!text.includes('884201'));
  assert.ok(!text.includes('ZK4Q-9WTM-1FAB-7R2X'));
});

test('a_card_number_and_an_address_from_a_real_page_are_replaced', () => {
  const text = JSON.stringify(read(1, 1, BEFORE));
  assert.ok(!text.includes(CARD));
  assert.ok(!text.includes(EMAIL));
  assert.ok(text.includes('[card]'));
  assert.ok(text.includes('[email]'));
});

test('a_name_over_the_longest_is_dropped_whole_and_takes_its_secrets', () => {
  const snapshot = read(1, 1, BEFORE);
  const held = byBackend(snapshot.root, 2);
  assert.equal(held?.name, '[long]');
  assert.equal(snapshot.replaced.long, 1);
  assert.ok(!JSON.stringify(snapshot).includes(KEY));
});

test('an_unnamed_password_field_is_sealed_when_the_document_names_it', () => {
  const snapshot = read(1, 1, BEFORE, undefined, { ids: new Set([27]), degraded: false });
  const held = byBackend(snapshot.root, 27);
  assert.equal(held?.value, '[password]');
  assert.equal(held?.name, '');
  assert.equal(held?.description, '');
  assert.deepEqual(held?.children, []);
  assert.ok(!JSON.stringify(snapshot).includes(UNNAMED));
});

test('a_revealed_unnamed_field_is_sealed_beside_the_named_one', () => {
  const sealed = { ids: new Set([23, 27]), degraded: false };
  const snapshot = read(1, 1, AFTER, undefined, sealed);
  assert.equal(byBackend(snapshot.root, 23)?.value, '[password]');
  assert.equal(byBackend(snapshot.root, 27)?.value, '[password]');
  assert.ok(!JSON.stringify(snapshot).includes(CLEARTEXT));
  assert.ok((snapshot.replaced.password ?? 0) >= 2);
});

test('without_a_sealed_set_the_unnamed_field_is_left_as_it_was', () => {
  const snapshot = read(1, 1, BEFORE);
  assert.equal(snapshot.degraded, false);
  assert.equal(byBackend(snapshot.root, 27)?.value, UNNAMED);
  assert.equal(byBackend(snapshot.root, 23)?.value, '[password]');
});

test('a_sealed_set_seals_a_node_the_name_heuristic_would_have_dropped', () => {
  const snapshot = read(1, 1, [
    { nodeId: '1', role: said('RootWebArea'), name: said('A page'), childIds: ['2', '3'] },
    { nodeId: '2', role: said('generic'), value: said('hunter2'), backendDOMNodeId: 40 },
    { nodeId: '3', ignored: true, role: said('textbox'), value: said('hunter2'), backendDOMNodeId: 41 },
  ], undefined, { ids: new Set([40, 41]), degraded: false });
  assert.equal(snapshot.root.children.length, 2);
  assert.deepEqual(snapshot.root.children.map((one) => one.value), ['[password]', '[password]']);
  assert.ok(!JSON.stringify(snapshot).includes('hunter2'));
});

test('an_ignored_button_is_kept_and_an_ignored_wrapper_is_not', () => {
  const snapshot = read(1, 1, [
    { nodeId: '1', role: said('RootWebArea'), name: said('A page'), childIds: ['2'] },
    { nodeId: '2', ignored: true, role: said('generic'), childIds: ['3'] },
    { nodeId: '3', ignored: true, role: said('button'), name: said('Go'), backendDOMNodeId: 9 },
  ]);
  assert.equal(snapshot.root.children.length, 1);
  assert.equal(snapshot.root.children[0]?.role, 'button');
  assert.equal(snapshot.root.children[0]?.name, 'Go');
});

test('a_snapshot_carries_the_counts_of_what_was_replaced', () => {
  const snapshot = read(1, 1, BEFORE);
  assert.ok((snapshot.replaced.password ?? 0) >= 3);
  assert.ok((snapshot.replaced.email ?? 0) >= 1);
  assert.ok((snapshot.replaced.card ?? 0) >= 1);
});

test('a_blocked_host_is_refused_before_any_tree_is_built', () => {
  const snapshot = read(1, 1, BEFORE, 'https://secure.chase.com/account');
  assert.equal(snapshot.root.role, 'refused');
  assert.deepEqual(snapshot.root.children, []);
  assert.equal(snapshot.replaced.blocked, 1);
  assert.ok(!JSON.stringify(snapshot).includes('Sign in'));
  assert.equal(read(1, 1, BEFORE, 'https://example.invalid/in').root.role, 'RootWebArea');
});

test('a_changed_page_raises_the_version', () => {
  const first = read(7, 1, BEFORE);
  const later = read(7, 2, AFTER);
  assert.equal(first.version, 1);
  assert.ok(later.version > first.version);
  assert.equal(byBackend(first.root, 28)?.name, 'Show password');
  assert.equal(byBackend(later.root, 28)?.name, 'Hide password');
});
