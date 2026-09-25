# bug: a secret the document cannot be asked about is not sealed

## What happens

The sealed set is built by running `document.querySelectorAll('input,textarea')` in
the main frame. Three kinds of secret are outside what that reaches:

- a field inside a **closed shadow root**. `querySelectorAll` does not cross it, and
  neither does the computed-style check.
- a field in a **cross-origin iframe**. The lookup runs in the main frame only.
- a secret rendered as **plain text with no input element** — a revealed password
  printed into a `<span>`, a code shown in a heading. There is nothing to ask about.

In all three only the accessible-name heuristic and the shape patterns apply, so a
secret with an ordinary name and no recognised shape reaches the caller.

## What should happen

Every field holding a secret is sealed, wherever it is rendered, and a secret with no
input element is either sealed or reported as unreadable.

## How to see it

Put a password input inside a closed shadow root, attach, and build a snapshot. The
field's value is present in the output and carries no marker.

Beside this, a lookup that fails outright is not a silent miss: the snapshot is built
from the name heuristic alone and carries `degraded: true`, which a caller can read.
That fallback is held by `a_failed_lookup_is_degraded_and_still_yields_a_tree` and
`what_was_already_known_survives_a_failed_lookup`.

Settled by: nothing yet. No test in `tests/` covers a closed shadow root, a
cross-origin iframe, or a secret with no input element.
