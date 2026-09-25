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
**Then** both are refused, and an attached tab that navigates there is detached

Settled by: `a_blocked_host_is_refused_at_attach_without_touching_the_protocol`
and `a_blocked_host_is_refused_before_any_tree_is_built`

## A pattern that is recognised is replaced, and one that is not is counted

**Given** a page showing text matching a pattern the redactor knows
**When** a tree is built from it
**Then** the text is replaced, and the count of replacements is reported to the caller

Settled by: `a_recognised_pattern_is_replaced_and_counted`

## A tree that no longer describes the page says so

**Given** a tree already read by an agent
**When** the page changes underneath it
**Then** the next read carries a higher version, and the old tree is not silently reused

Settled by: `a_changed_page_raises_the_version`
