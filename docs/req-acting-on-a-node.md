# req: acting on a node

An id names a place in a tree already read, and a page can move under it. So the node
is fetched again before a command reaches it, and what is compared has to be what the
tree was built from.

## The node is identified by its handle and its role, not by its name

**Given** a node of a tree an agent is holding
**When** a command names it
**Then** `Accessibility.getPartialAXTree` is asked for it by `backendDomNodeId`, and the
command is carried out only if the reply carries that same handle and the same role

Settled by: `a_node_whose_role_changed_is_refused`,
`a_node_whose_handle_now_names_another_element_is_refused`
and `a_node_the_page_no_longer_carries_is_refused`

The accessible name was compared here and is not any more. The tree empties the name of
a sealed node; a fresh read of the same node with no sealed set does not, because the
sealed set is built from the document and not from the tree. The two disagreed by
construction, so every command against a field the document sealed and the name
heuristic missed - a PIN, a CVV - was refused.

## A field the document sealed can still be typed into

**Given** a text-entry field sealed by the document, whose label the name heuristic does
not match
**When** an agent sends `setValue` against it
**Then** the value is typed, and the node's name and value stay out of the tree

Settled by: `a_sealed_field_the_name_heuristic_missed_still_takes_a_value`
and `a_sealed_field_the_name_heuristic_did_match_still_takes_a_value`, which holds the
case that worked before beside the one that did not.

## The value is replaced, not appended to

**Given** a field already holding a value
**When** `setValue` is sent against it
**Then** the field holds the new value alone

Settled by: nothing. `Input.insertText` appends, so the field is selected first with a
Home and a shift-End key event, in `core/act.ts`. No test in `tests/` runs a real field,
and the stand-in records the calls without carrying out what they mean.
