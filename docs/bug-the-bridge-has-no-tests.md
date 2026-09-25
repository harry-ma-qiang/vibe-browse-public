# bug: the bridge declares a test runner and carries no tests

## What happens

`bridge/pyproject.toml` lists `pytest>=8.0` under its `dev` extra, and there is no test
file anywhere under `bridge/`. Everything the bridge decides on its own is unheld:
which origins it turns away on each listener, that a second extension is refused rather
than allowed to displace the first, that a command with no answer times out, that a
short or empty stored token stops the process instead of opening both listeners.

The suite in `tests/` covers the extension and reaches none of this. The only thing
that has exercised the bridge is a hand run,
`docs/test-driving-the-bridge-end-to-end.md`.

## What should happen

Either the bridge carries tests for what it decides, or it stops declaring a runner it
does not use.

## How to see it

`cd bridge && uv run --extra dev pytest` reports `collected 0 items`, `no tests ran`,
and exits 5.

Settled by: nothing. The declaration is the whole of the defect.
