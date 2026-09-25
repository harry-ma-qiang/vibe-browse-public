# Known issues

Open items at the first public release. Read this before trusting the redaction with
anything that matters.

## 1. Password detection: what it now covers, and what it still misses

Mostly closed. Detection is no longer name-only.

The accessibility tree cannot say which field is a password. Measured on Chrome for
Testing 153.0.8010.12 against a sign-in page written for the test,
`Accessibility.getFullAXTree` emitted these property names and no others:

```
editable  focusable  invalid  labelledby  level  multiline  readonly  required
settable  url
```

No `inputType`. No `protected`. No `autocomplete`. So `core/sensitive.ts` asks the
document instead, and the tree is sealed by `backendDOMNodeId`:

- `DOM.querySelectorAll` over `input,textarea`, then `DOM.describeNode` for the
  backend ids.
- one `Runtime.evaluate`, in the isolated world the page cannot reach, deciding on
  `type === 'password'`, a computed `-webkit-text-security` other than `none`, an
  `autocomplete` containing `password` or equal to `one-time-code`, and a `name` or
  `id` matching `pass otp secret token recovery cvv cvc pin ssn`.
- the set is sticky while the tab is attached, so a field that flips to `type=text`
  under a "Show password" toggle stays sealed. It is cleared on detach.

`isPassword()` in `core/redact.ts` is unchanged and still runs, as the fallback layer.

What is still missed:

- a field inside a **closed shadow root**: `document.querySelectorAll` does not reach
  it, and neither does the computed-style check.
- a field in a **cross-origin iframe**: the lookup runs in the main frame only.
- a page that renders a secret as **plain text with no input element** — a revealed
  password printed into a `<span>`, a code shown in a heading. Nothing here has an
  input to ask about, and only the name heuristic and the shape patterns apply.
- a tab where the lookup itself fails. The protocol calls are not allowed to break a
  snapshot: on any failure the snapshot is built from the name heuristic alone and
  carries `degraded: true`, which a caller can read.

The two dumps in `tests/fixtures/` are the original measurement: `ax-before.json`
with the value masked, `ax-after.json` with it in cleartext.

## 2. Two removed tests left code untested

The todo test is gone: `an_unnamed_password_field_is_sealed_when_the_document_names_it`
in `tests/tree.test.ts` now passes, against backend node 27 of the real dump.

Two hand-written tests were removed when the fixtures were replaced with real dumps:
they covered sealing a noise-role node and sealing an ignored node, and both reached
that code by way of an `inputType` property Chrome never sends. Those paths are now
reached by the sealed set instead, and are covered again — but through the DOM, not
through the property checks. The property checks in `isPassword()` remain unreachable
on Chrome and untested.

## 3. The bridge has not been driven end to end

`core/bridge.ts` now calls `read()`, `query()` and `act()`, and `bridge/server.py`
relays commands to it, so the path an agent uses exists. What has actually been
observed is less than that.

Observed: the server's four HTTP behaviours, by hand — `GET /health` without a token,
`POST /command` refused at 401 without a token and with a wrong one, refused at 403
with an `Origin` header, 404 on any other route, both listeners on `127.0.0.1` only.

Not observed: the extension half. Dialling the socket, building a tree on demand and
carrying out a command have no automated test and were not run in a browser for this
release. The test suite covers `read()`, `query()` and the redaction, called directly.
So the account in `README.md` is still what the code does, not what a running
extension has been watched doing.

## 4. Snapshots do not survive the service worker

The snapshot a `query` or an `act` works against is held in the worker's memory.
Chrome stops the worker when it is idle, and the tree goes with it. The next `query`
builds a fresh one, whose node ids need not match the ids the agent is holding.

An `act` against a moved id is refused rather than carried out — the node is re-read
and its role and name are compared first — but a `query` returning different ids for
the same page is expected, not a fault. Re-snapshot if a reply looks unfamiliar.

## 5. The bridge asks nobody before it acts

While the bridge is running, any process that can read `~/.vibe-browse-token` can
drive every attached tab. There is no per-command confirmation and no record of what
was done. Attaching a tab is the only consent, and it is given once, for the whole
session. Stop the server when an agent is not using it.
