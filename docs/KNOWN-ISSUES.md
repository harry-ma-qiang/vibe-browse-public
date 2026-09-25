# Known issues

Open items at the first public release. None is fixed. Read this before trusting the
redaction with anything that matters.

## 1. A revealed password can reach the accessibility tree

Password detection is a heuristic on the accessible name and the role. It has to be,
because Chrome does not expose the input type.

Evidence, measured on Chrome for Testing 153.0.8010.12 against a sign-in page written
for the test. `Accessibility.getFullAXTree` emitted these property names and no
others:

```
editable  focusable  invalid  labelledby  level  multiline  readonly  required
settable  url
```

No `inputType`. No `protected`. No `autocomplete`. The property checks in
`isPassword()` never fire on this engine. They are kept only for engines that do
send them.

What follows:

- A `type=password` field is masked by Chrome itself, so its value arrives as bullet
  characters even when nothing seals it.
- A page that flips the field to `type=text` (a "Show password" toggle) makes the
  value arrive in cleartext. A field named `Password` is still sealed by name. A
  field with no accessible name is not.

The two dumps in `tests/fixtures/` are that measurement: `ax-before.json` with the
value masked, `ax-after.json` with it in cleartext.

The fix is to ask the DOM which nodes are sensitive — `DOM.querySelectorAll` over
`input[type=password]`, `input[autocomplete*=password]`, `input[name*=pass i]` and
the rest — and seal by `backendDOMNodeId` rather than by name. Not done.

## 2. A test is marked todo because it fails

`an_unnamed_password_field_is_not_sealed` in `tests/tree.test.ts`.

It asserts that the unnamed password input in `ax-before.json` is sealed. It is not:
its value reaches the tree as bullet characters. The test is left failing under
`{ todo: true }` rather than weakened. It will pass when issue 1 is fixed.

Two hand-written tests were removed when the fixtures were replaced with real dumps:
they covered sealing a noise-role node and sealing an ignored node, and both reached
that code by way of an `inputType` property Chrome never sends. Those paths in
`core/tree.ts` are now untested and, on Chrome, unreachable.

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
