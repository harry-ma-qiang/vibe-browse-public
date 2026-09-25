// Copyright (C) 2026 harry-ma-qiang
// SPDX-License-Identifier: AGPL-3.0-or-later

/**
 * What the redactor is held to, run against strings and against real protocol nodes.
 *
 * Every value here is obviously invented. Nothing in this file is a real address,
 * a real key or a real credential, and nothing reaches a browser or a network.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { BLOCKED, LONGEST, blocked, isPassword, readable, redact, redactUrl } from '../core/redact';
import type { CdpAxNode, CdpAxProperty } from '../core/types';

const said = (value: string) => ({ type: 'string', value });

const field = (role: string, name: string, properties?: CdpAxProperty[]): CdpAxNode => ({
  nodeId: 'f',
  role: said(role),
  name: said(name),
  ...(properties ? { properties } : {}),
});

test('a_recognised_pattern_is_replaced_and_counted', () => {
  const out = redact('write to nobody@example.invalid before friday');
  assert.equal(out.text, 'write to [email] before friday');
  assert.equal(out.replaced.email, 1);
});

test('text_over_the_longest_is_dropped_not_truncated', () => {
  const out = redact(`nobody@example.invalid ${'x'.repeat(LONGEST)}`);
  assert.equal(out.text, '[long]');
  assert.equal(out.replaced.long, 1);
  assert.ok(!out.text.includes('@'));
});

test('a_node_with_no_properties_and_a_password_name_is_sealed', () => {
  assert.equal(isPassword(field('textbox', 'One-time passcode')), true);
  assert.equal(isPassword(field('combobox', 'Recovery code')), true);
  assert.equal(isPassword({ nodeId: 'f', role: said('searchbox'), description: said('API key') }), true);
});

test('a_property_with_no_value_does_not_throw_or_open_the_seal', () => {
  assert.equal(isPassword({ nodeId: 'f', role: said('textbox'), properties: [{ name: 'inputType' }] }), false);
  assert.equal(isPassword({ nodeId: 'f' }), false);
});

test('an_ordinary_password_link_is_not_sealed', () => {
  assert.equal(isPassword(field('link', 'Forgot password?')), false);
  assert.equal(isPassword(field('StaticText', 'Your password was changed')), false);
});

test('a_url_parameter_that_looks_like_a_credential_is_replaced', () => {
  const out = redactUrl('https://example.invalid/in?access_token=fixture-one&page=2#id_token=fixture-two');
  assert.ok(!out.text.includes('fixture-one'));
  assert.ok(!out.text.includes('fixture-two'));
  assert.ok(out.text.includes('page=2'));
  assert.ok(out.text.includes('access_token=[secret]'));
  assert.equal(out.replaced.secret, 2);
});

test('a_url_that_will_not_parse_is_dropped_whole', () => {
  const out = redactUrl('nobody@example.invalid is not a url');
  assert.equal(out.text, '[url]');
  assert.equal(out.replaced.url, 1);
});

test('a_blocked_host_and_its_subdomains_are_refused', () => {
  for (const one of BLOCKED) {
    assert.equal(blocked(`https://${one}/`), true, one);
    assert.equal(blocked(`https://secure.login.${one}/in`), true, one);
    assert.equal(readable(`https://${one}/`), false, one);
  }
  assert.equal(blocked('https://example.invalid/'), false);
});

test('a_host_merely_ending_in_the_letters_of_a_blocked_one_is_not_refused', () => {
  assert.equal(blocked('https://notchase.com/'), false);
  assert.equal(blocked('https://chase.com.example.invalid/'), false);
});

test('an_empty_or_unparseable_url_is_blocked', () => {
  assert.equal(blocked(''), true);
  assert.equal(blocked(undefined), true);
  assert.equal(blocked('not a url at all'), true);
});

test('readable_wants_both_the_scheme_and_the_list', () => {
  assert.equal(readable('https://example.invalid/page'), true);
  assert.equal(readable('chrome://settings'), false);
  assert.equal(readable('https://www.chase.com/account'), false);
});
