# bug: the property checks in isPassword cannot fire on Chrome

## What happens

`isPassword()` in `core/redact.ts` opens by reading node properties, and seals on
`inputType === 'password'`, on `protected === 'true'`, and on an `autocomplete` of
`current-password` or `new-password`.

Chrome sends none of those three. Measured on Chrome for Testing 153.0.8010.12,
`Accessibility.getFullAXTree` emits only `editable focusable invalid labelledby level
multiline readonly required settable url`. The loop therefore always falls through to
the role-and-name check, and those three branches never run on the only browser this
targets.

Two hand-written tests used to reach them, by way of fixtures carrying an `inputType`
property. They were removed when the fixtures were replaced with real dumps. The
paths they covered — sealing a noise-role node and sealing an ignored node — are now
reached through the sealed set instead, so the behaviour is covered, but through the
DOM and not through these checks. The checks themselves are dead and untested.

## What should happen

Either the property checks go, and the fallback layer is the name check alone, or
they are kept for a browser that emits those properties and a test holds them with a
fixture that says why it is not a Chrome dump.

## How to see it

Attach to any sign-in page and read the raw `getFullAXTree` reply. No node carries
`inputType`, `protected` or `autocomplete`. `tests/fixtures/ax-before.json` and
`ax-after.json` are the recorded dumps, and neither carries them either.

Settled by: nothing yet. No test in `tests/` reaches the three property branches.
