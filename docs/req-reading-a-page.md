# req: reading a page

## A named control is found without reading a pixel

**Given** a page with a control carrying an accessible name
**When** an agent asks for the tree filtered to interactive roles
**Then** the control appears with a small integer id, and no image is produced

Settled by: `a_named_control_appears_in_the_interactive_tree`

## A password field's value never leaves the browser

**Given** a page with an input whose type is password
**When** a tree is built from it
**Then** the node carries the marker and not the value, whatever the value was

Settled by: `a_password_field_carries_a_marker_and_not_a_value`

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
