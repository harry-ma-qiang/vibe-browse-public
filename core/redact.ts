// Copyright (C) 2026 harry-ma-qiang
// SPDX-License-Identifier: AGPL-3.0-or-later

/**
 * Taking out of a tree what a reader outside the browser has no business holding.
 *
 * This catches shapes. It cannot catch a secret with no shape, and it cannot catch
 * one split across two nodes, so it counts what it replaced and says so.
 */

import type { CdpAxNode } from './types';

/** Longest text scanned. Anything longer is dropped whole, never truncated and kept. */
export const LONGEST = 4096;

/** What is recognised, whole. The email domain avoids an overlapping class on purpose:
 *  the obvious spelling is quadratic on text a page controls. */
export const PATTERNS: ReadonlyArray<readonly [string, RegExp]> = [
  ['key', /\b(?:gh[pousr]_[A-Za-z0-9]{16,}|sk-[A-Za-z0-9_-]{16,}|AKIA[0-9A-Z]{16}|AIza[0-9A-Za-z_-]{20,})/g],
  ['token', /\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}/g],
  ['email', /[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)+/g],
  ['card', /\b\d(?:[ -]?\d){11,18}\b/g],
  ['social', /\b\d{3}[- ]?\d{2}[- ]?\d{4}\b/g],
];

/** What a redaction did: the text, and how many of each shape it replaced. */
export interface Redacted {
  text: string;
  replaced: Record<string, number>;
}

/** Pages the protocol will not attach to, or should not be asked to. */
export const UNREACHABLE = [
  'chrome://', 'chrome-extension://', 'chrome-untrusted://', 'devtools://',
  'file://', 'view-source:', 'blob:', 'data:', 'filesystem:', 'about:',
];

/** Sites this never reads at all: banks, password managers, payments, tax and benefits.
 *  A subdomain of one of these is one of these. */
export const BLOCKED = [
  'chase.com', 'bankofamerica.com', 'wellsfargo.com', 'citi.com', 'capitalone.com',
  'usbank.com', '1password.com', 'lastpass.com', 'bitwarden.com', 'dashlane.com',
  'keeper.io', 'nordpass.com', 'paypal.com', 'venmo.com', 'cash.app', 'zelle.com',
  'stripe.com', 'irs.gov', 'ssa.gov',
];

/** Whether this page may be attached to. Anything unparseable is refused. */
export function reachable(url: string | undefined): boolean {
  if (!url) return false;
  if (UNREACHABLE.some((prefix) => url.startsWith(prefix))) return false;
  try {
    const held = new URL(url);
    return held.protocol === 'http:' || held.protocol === 'https:';
  } catch {
    // why: a URL that will not parse is one nobody checked, so it is refused.
    return false;
  }
}

/** Whether this page is on the list never read. Nothing and nonsense are both on it. */
export function blocked(url: string | undefined): boolean {
  if (!url) return true;
  try {
    const host = new URL(url).hostname.toLowerCase();
    return BLOCKED.some((one) => host === one || host.endsWith(`.${one}`));
  } catch {
    return true;
  }
}

/** Whether a page may be read: the protocol will reach it and the list allows it. */
export function readable(url: string | undefined): boolean {
  return reachable(url) && !blocked(url);
}

/** One string with every recognised shape replaced, beside a count of each. */
export function redact(text: unknown): Redacted {
  const said = typeof text === 'string' ? text : String(text ?? '');
  const replaced: Record<string, number> = {};
  if (said.length > LONGEST) {
    return { text: '[long]', replaced: { long: 1 } };
  }
  let out = said;
  for (const [name, pattern] of PATTERNS) {
    out = out.replace(pattern, () => {
      replaced[name] = (replaced[name] ?? 0) + 1;
      return `[${name}]`;
    });
  }
  return { text: out, replaced };
}

const SEALED_ROLES = new Set(['textbox', 'combobox', 'searchbox']);

const SEALED_NAME =
  /password|passcode|passphrase|one[- ]?time|\botp\b|verification code|recovery code|secret|api key/i;

const SEALED_PARAM = /token|secret|password|passwd|auth|session|sig|signature|code|key|otp|nonce/i;

/** Whether a node looks like it holds a secret. A heuristic: it can miss. The first
 *  two signals are properties Chrome does not send, kept for engines that do. */
export function isPassword(node: CdpAxNode): boolean {
  for (const p of node.properties ?? []) {
    const said = String(p.value?.value ?? '');
    if (p.name === 'inputType' && said === 'password') return true;
    if (p.name === 'autocomplete' && /current-password|new-password/i.test(said)) return true;
    if (p.name === 'protected' && said === 'true') return true;
  }
  if (!SEALED_ROLES.has(String(node.role?.value ?? ''))) return false;
  const named = `${String(node.name?.value ?? '')} ${String(node.description?.value ?? '')}`;
  return SEALED_NAME.test(named);
}

function scrub(raw: string, replaced: Record<string, number>): string {
  return raw
    .split('&')
    .filter((part) => part.length > 0)
    .map((part) => {
      const at = part.indexOf('=');
      if (at === -1) return part;
      const key = part.slice(0, at);
      if (!SEALED_PARAM.test(key)) return part;
      replaced.secret = (replaced.secret ?? 0) + 1;
      return `${key}=[secret]`;
    })
    .join('&');
}

/** One URL with every secret-shaped query or fragment value replaced, and counted. */
export function redactUrl(url: unknown): Redacted {
  const said = typeof url === 'string' ? url : String(url ?? '');
  let held: URL;
  try {
    held = new URL(said);
  } catch {
    return { text: '[url]', replaced: { url: 1 } };
  }
  const replaced: Record<string, number> = {};
  held.search = scrub(held.search.replace(/^\?/, ''), replaced);
  held.hash = scrub(held.hash.replace(/^#/, ''), replaced);
  const out = redact(held.toString());
  for (const [k, n] of Object.entries(out.replaced)) replaced[k] = (replaced[k] ?? 0) + n;
  return { text: out.text, replaced };
}

/** The four texts a node carries, redacted, beside the counts from all four.
 *  A node named sealed by its caller is emptied whatever its texts say. */
export function redactNode(node: CdpAxNode, sealed = false): {
  role: string;
  name: string;
  value: string;
  description: string;
  replaced: Record<string, number>;
} {
  const role = node.role?.value ?? 'unknown';
  if (sealed || isPassword(node)) {
    return { role, name: '', value: '[password]', description: '', replaced: { password: 1 } };
  }
  const name = redact(node.name?.value ?? '');
  const value = redact(node.value?.value ?? '');
  const description = redact(node.description?.value ?? '');
  const replaced: Record<string, number> = {};
  for (const one of [name, value, description]) {
    for (const [k, n] of Object.entries(one.replaced)) replaced[k] = (replaced[k] ?? 0) + n;
  }
  return { role, name: name.text, value: value.text, description: description.text, replaced };
}
