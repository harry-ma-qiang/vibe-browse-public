/**
 * What attaching is held to, run against a stand-in for the protocol.
 *
 * No browser is started here. The stand-in records what would have been asked of
 * Chrome, which is enough to show that a refused page is never asked about at all.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { attach, detach, isAttached } from '../core/attach';

const calls: string[] = [];

const stub = {
  debugger: {
    attach: async () => {
      calls.push('attach');
    },
    detach: async () => {
      calls.push('detach');
    },
    sendCommand: async (_target: unknown, method: string) => {
      calls.push(method);
    },
  },
};

(globalThis as unknown as { chrome: unknown }).chrome = stub;

test('a_blocked_host_is_refused_at_attach_without_touching_the_protocol', async () => {
  calls.length = 0;
  for (const url of ['https://www.chase.com/in', 'https://vault.bitwarden.com/', 'https://paypal.com/']) {
    assert.equal(await attach(1, url), false, url);
  }
  assert.equal(isAttached(1), false);
  assert.deepEqual(calls, []);
});

test('an_unreachable_or_missing_url_is_refused_at_attach', async () => {
  calls.length = 0;
  assert.equal(await attach(2, 'chrome://settings'), false);
  assert.equal(await attach(3, undefined), false);
  assert.equal(await attach(4, 'not a url'), false);
  assert.deepEqual(calls, []);
});

test('an_ordinary_page_is_attached_and_then_let_go_of', async () => {
  calls.length = 0;
  assert.equal(await attach(5, 'https://example.invalid/page'), true);
  assert.equal(isAttached(5), true);
  assert.ok(calls.includes('attach'));
  assert.ok(calls.includes('Accessibility.enable'));
  await detach(5);
  assert.equal(isAttached(5), false);
});
