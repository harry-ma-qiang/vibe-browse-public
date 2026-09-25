/**
 * What the tree builder is held to, run against hand-built protocol nodes.
 *
 * Every value here is obviously invented. Nothing in this file is a real address,
 * a real key or a real credential, and nothing reaches a browser or a network.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { read } from '../core/tree';
import { query } from '../core/query';
import type { CdpAxNode } from '../core/types';

const said = (value: string) => ({ type: 'string', value });

const root = (...childIds: string[]): CdpAxNode => ({
  nodeId: '1',
  role: said('RootWebArea'),
  name: said('A page'),
  childIds,
});

const SECRET = 'fixture-value-not-a-real-one';

test('a_named_control_appears_in_the_interactive_tree', () => {
  const snapshot = read(1, 1, [
    root('2'),
    { nodeId: '2', role: said('button'), name: said('Sign in'), backendDOMNodeId: 40 },
  ]);
  const answer = query(snapshot.root, { interactiveOnly: true });
  assert.equal(answer.matched, 1);
  assert.equal(answer.nodes[0]?.role, 'button');
  assert.equal(answer.nodes[0]?.name, 'Sign in');
  assert.ok(Number.isInteger(answer.nodes[0]?.id));
});

test('a_password_field_carries_a_marker_and_not_a_value', () => {
  const snapshot = read(1, 1, [
    root('2'),
    {
      nodeId: '2',
      role: said('textbox'),
      name: said('Password'),
      value: said(SECRET),
      properties: [{ name: 'inputType', value: said('password') }],
      backendDOMNodeId: 41,
      childIds: ['3'],
    },
    { nodeId: '3', role: said('StaticText'), name: said(SECRET) },
  ]);
  const held = snapshot.root.children[0];
  assert.equal(held?.value, '[password]');
  assert.equal(held?.name, '');
  assert.deepEqual(held?.children, []);
  assert.ok(!JSON.stringify(snapshot).includes(SECRET));
});

test('a_revealed_password_field_is_sealed_though_its_type_is_text', () => {
  const snapshot = read(1, 1, [
    root('2'),
    {
      nodeId: '2',
      role: said('textbox'),
      name: said('Password'),
      value: said(SECRET),
      properties: [{ name: 'inputType', value: said('text') }],
      backendDOMNodeId: 42,
    },
  ]);
  assert.equal(snapshot.root.children[0]?.value, '[password]');
  assert.ok(!JSON.stringify(snapshot).includes(SECRET));
});

test('a_node_with_no_properties_and_a_password_name_is_sealed_in_a_tree', () => {
  const snapshot = read(1, 1, [
    root('2'),
    { nodeId: '2', role: said('textbox'), name: said('One-time passcode'), value: said(SECRET) },
  ]);
  assert.equal(snapshot.root.children[0]?.value, '[password]');
  assert.ok(!JSON.stringify(snapshot).includes(SECRET));
});

test('a_password_node_with_a_noise_role_does_not_leak_its_children', () => {
  for (const role of ['generic', 'none', 'presentation']) {
    const snapshot = read(1, 1, [
      root('2'),
      {
        nodeId: '2',
        role: said(role),
        properties: [{ name: 'inputType', value: said('password') }],
        childIds: ['3'],
      },
      { nodeId: '3', role: said('StaticText'), name: said(SECRET) },
    ]);
    assert.ok(!JSON.stringify(snapshot).includes(SECRET), role);
    assert.deepEqual(snapshot.root.children[0]?.children, []);
  }
});

test('an_ignored_password_node_does_not_leak_its_children', () => {
  const snapshot = read(1, 1, [
    root('2'),
    {
      nodeId: '2',
      ignored: true,
      role: said('LabelText'),
      properties: [{ name: 'inputType', value: said('password') }],
      childIds: ['3'],
    },
    { nodeId: '3', role: said('StaticText'), name: said(SECRET) },
  ]);
  assert.ok(!JSON.stringify(snapshot).includes(SECRET));
  assert.deepEqual(snapshot.root.children[0]?.children, []);
});

test('an_ignored_button_is_kept_and_an_ignored_wrapper_is_not', () => {
  const snapshot = read(1, 1, [
    root('2'),
    { nodeId: '2', ignored: true, role: said('generic'), childIds: ['3'] },
    { nodeId: '3', ignored: true, role: said('button'), name: said('Go'), backendDOMNodeId: 9 },
  ]);
  assert.equal(snapshot.root.children.length, 1);
  assert.equal(snapshot.root.children[0]?.role, 'button');
  assert.equal(snapshot.root.children[0]?.name, 'Go');
});

test('a_snapshot_carries_the_counts_of_what_was_replaced', () => {
  const snapshot = read(1, 1, [
    root('2', '3'),
    { nodeId: '2', role: said('StaticText'), name: said('mail nobody@example.invalid') },
    {
      nodeId: '3',
      role: said('textbox'),
      name: said('Password'),
      value: said(SECRET),
      properties: [{ name: 'inputType', value: said('password') }],
      backendDOMNodeId: 43,
    },
  ]);
  assert.equal(snapshot.replaced.email, 1);
  assert.equal(snapshot.replaced.password, 1);
});

test('a_changed_page_raises_the_version', () => {
  const was: CdpAxNode[] = [root('2'), { nodeId: '2', role: said('button'), name: said('Go'), backendDOMNodeId: 9 }];
  const now: CdpAxNode[] = [root('2'), { nodeId: '2', role: said('button'), name: said('Stop'), backendDOMNodeId: 9 }];
  const first = read(7, 1, was);
  const later = read(7, 2, now);
  assert.equal(first.version, 1);
  assert.equal(later.version, 2);
  assert.ok(later.version > first.version);
  assert.notEqual(first.root.children[0]?.name, later.root.children[0]?.name);
});
