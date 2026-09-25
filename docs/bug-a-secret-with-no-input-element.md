# bug: a secret the document cannot be asked about is not sealed

## What happens

The sealed set is built by running a probe in the main frame, which walks the document
and every **open** shadow root under it. Three kinds of secret are outside what that
reaches:

- a field inside a **closed** shadow root. `attachShadow({mode: 'closed'})` returns the
  root to the caller and nothing else: `element.shadowRoot` is `null` from outside, so
  there is no reference to recurse through and no way to run the computed-style check.
  `Accessibility.getFullAXTree` does return nodes from inside it, so the value still
  reaches the caller.
- a field in a **cross-origin iframe**. The lookup runs in the main frame only.
- a secret rendered as **plain text with no input element** - a revealed password
  printed into a `<span>`, a code shown in a heading. There is nothing to ask about.

In all three only the accessible-name heuristic and the shape patterns apply, so a
secret with an ordinary name and no recognised shape reaches the caller.

An **open** shadow root was in this list and is not any more. The probe returns the
elements it matched and each one is turned into a `backendDOMNodeId` with
`DOM.requestNode` and `DOM.describeNode`, so a field at any depth of open roots is
sealed like one in the document.

## What should happen

Every field holding a secret is sealed, wherever it is rendered, and a secret with no
input element is either sealed or reported as unreadable.

## How to see it

Put a password input inside a **closed** shadow root, attach, and build a snapshot. The
field's value is present in the output and carries no marker. The same page with
`mode: 'open'` is sealed, which is the difference this record is now about.

Beside this, a lookup that fails outright is not a silent miss: the snapshot is built
from the name heuristic alone and carries `degraded: true`, which a caller can read.
That fallback is held by `a_failed_lookup_is_degraded_and_still_yields_a_tree` and
`what_was_already_known_survives_a_failed_lookup`.

Settled by: nothing. The test named
`a_field_inside_an_open_shadow_root_is_named_and_a_closed_one_cannot_be` runs the probe
over a stand-in document and shows the open case working and the closed case missed, so
it records this miss rather than fixing it. No test covers a cross-origin iframe or a
secret with no input element.
