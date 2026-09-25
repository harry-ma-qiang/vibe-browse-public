# req: reading a page

## A named control is found without reading a pixel

**Given** a page with a control carrying an accessible name
**When** an agent asks for the tree filtered to interactive roles
**Then** the control appears with a small integer id, and no image is produced

Settled by: `a_named_control_appears_in_the_interactive_tree`

## A named password field's value does not leave the browser

**Given** a real page whose text-entry field is named like a password or a code
**When** a tree is built from it
**Then** the node carries the marker and not the value, and its subtree stops there

Settled by: `a_password_field_carries_a_marker_and_not_a_value`

Chrome sends no `inputType`, so here the name and the role are the signal. A field
with no accessible name is reached by the document instead: see
`docs/req-sealing-a-secret-field.md`.

## A site on the blocked list is never read

**Given** a URL whose host is on `BLOCKED`, or a URL that will not parse
**When** the extension is asked to attach to it, or to build a tree for it
**Then** both are refused

Settled by: `a_blocked_host_is_refused_at_attach_without_touching_the_protocol`
and `a_blocked_host_is_refused_before_any_tree_is_built`

An attached tab that navigates onto the list is also detached, in the `onUpdated`
listener at `entrypoints/background.ts:101-106`. Nothing settles that: no test in
`tests/` reaches a listener registered inside `defineBackground`. It has been driven by
hand only, as part of `docs/test-driving-the-bridge-end-to-end.md`.

## A pattern that is recognised is replaced, and one that is not is counted

**Given** a page showing text matching a pattern the redactor knows
**When** a tree is built from it
**Then** the text is replaced, and the count of replacements is reported to the caller

Settled by: `a_recognised_pattern_is_replaced_and_counted`

## A tree that no longer describes the page is built again

**Given** a tree already built for a tab, which `query` and `act` are answered from
**When** the page changes underneath it
**Then** the next call fetches the page again rather than answering from the old tree,
and the snapshot it returns carries a higher version

Settled by: `a_changed_page_is_rebuilt_and_the_old_tree_is_not_reused`, which counts the
fetches, and `a_tree_still_describing_its_page_is_handed_back_without_a_second_fetch`,
which holds the other half: an unchanged page is not re-read.
`a_changed_page_raises_the_version` settles something smaller, and is kept for it:
that `read()` carries out the version it was given.

There is one staleness and not two. `core/watched.ts` keeps it; the background writes
it on navigation and on the page's own change binding, and `standing()` in
`core/bridge.ts` reads it before handing out a tree it built earlier.
