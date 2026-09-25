# req: sealing a secret field

The accessibility tree cannot say which field holds a secret. Measured on Chrome for
Testing 153.0.8010.12 against a sign-in page written for the test,
`Accessibility.getFullAXTree` emitted ten property names and no others:

```
editable  focusable  invalid  labelledby  level  multiline  readonly  required
settable  url
```

No `inputType`. No `protected`. No `autocomplete`. So the document is asked instead,
in `core/sensitive.ts`, and the answer is joined to the tree by `backendDOMNodeId`.

## The document names the fields, and the tree is sealed by backend id

**Given** an attached tab holding a page with text-entry fields
**When** the sealed set is asked for
**Then** `DOM.querySelectorAll` over `input,textarea` and `DOM.describeNode` give the
backend ids, and each field the page answers for comes back as one of them

Settled by: `the_document_names_the_fields_and_they_come_back_as_backend_ids`

## Four signals decide, and the page cannot watch them being read

**Given** a field that is `type=password`, or has a computed `-webkit-text-security`
other than `none`, or an `autocomplete` containing `password` or equal to
`one-time-code`, or a `name` or `id` matching
`pass otp secret token recovery cvv cvc pin ssn`
**When** the probe runs
**Then** the field is named as sensitive, and the one `Runtime.evaluate` runs in an
isolated world the page cannot reach or rewrite

Settled by: `the_probe_is_evaluated_in_the_isolated_world_and_never_in_the_page`

## A field stays sealed once it has been seen, until the tab is let go

**Given** a field already named as sensitive
**When** a "Show password" toggle flips it to `type=text` and a new tree is built
**Then** it is still sealed, and the set is cleared only on detach

Settled by: `a_field_that_was_ever_sensitive_stays_sealed_until_the_tab_is_let_go`
and `a_revealed_password_does_not_reach_a_built_snapshot`

## The sealed set reaches nodes the name alone would have missed

**Given** a text-entry field carrying no accessible name
**When** a tree is built with the sealed set
**Then** the node carries `[password]` and not the value, and without the set it is
left as it was

Settled by: `an_unnamed_password_field_is_sealed_when_the_document_names_it`,
`a_revealed_unnamed_field_is_sealed_beside_the_named_one`,
`without_a_sealed_set_the_unnamed_field_is_left_as_it_was`
and `a_sealed_set_seals_a_node_the_name_heuristic_would_have_dropped`

## The accessible name still runs underneath

**Given** a node the document was never asked about
**When** its role can hold text and its name reads like a secret
**Then** `isPassword()` in `core/redact.ts` seals it anyway, as the fallback layer

Settled by: `a_node_with_no_properties_and_a_password_name_is_sealed`
and `a_password_field_carries_a_marker_and_not_a_value`
