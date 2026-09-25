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

## 3. Reading and acting have no caller yet

`read()`, `query()` and `act()` are exercised by the tests and by nothing else. The
background process attaches, watches and detaches; it does not yet build a tree or
carry out a command, because the client that would ask it to does not exist. The
bridge is not part of this release.

Until that exists, the security argument in `README.md` describes what the code would
do, not what a running extension has been observed doing end to end.
