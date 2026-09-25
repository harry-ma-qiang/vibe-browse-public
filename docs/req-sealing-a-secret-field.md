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
**Then** the probe returns the matching elements themselves, and `DOM.requestNode` and
`DOM.describeNode` turn each one into the `backendDOMNodeId` the tree is sealed by

Settled by: `the_document_names_the_fields_and_they_come_back_as_backend_ids`

The elements are asked for one at a time rather than joined to a second
`DOM.querySelectorAll` by position, because the probe reaches nodes that call does not.

## Four signals decide, and the page cannot watch them being read

**Given** a field that is `type=password`, or has a computed `-webkit-text-security`
other than `none`, or an `autocomplete` containing `password` or equal to
`one-time-code`, or a `name` or `id` holding one of
`pass passcode passphrase passwd password pwd otp secret token recovery cvv cvc pin ssn`
**When** the probe runs
**Then** the field is named as sensitive, and the one `Runtime.evaluate` runs in an
isolated world the page cannot reach or rewrite

Settled by: `the_probe_names_a_field_on_any_of_the_four_signals`, which runs the probe
itself against a stand-in document, and
`the_probe_is_evaluated_in_the_isolated_world_and_never_in_the_page`, which settles
only where it is run, not what it decides.

## The name is matched a whole word at a time, not as a substring

**Given** a `name` or `id` split on `-`, `_`, a digit or a change of case
**When** the probe reads it
**Then** each part is compared whole, so `password`, `new-password`, `user_otp`, `cvv2`
and `accountSsn` are sealed and `shipping`, `passenger`, `tokenizer`, `spinner`,
`campaign`, `postcode`, `coupon`, `nickname` and `username` are left alone

Settled by: `the_name_is_matched_by_whole_word_and_not_by_substring`
and `a_name_split_on_a_dash_an_underscore_a_digit_or_a_case_is_one_word`

## An open shadow root is walked; a closed one cannot be

**Given** a text-entry field rendered inside a shadow root
**When** the probe runs
**Then** it is found if the root is open, at any depth, and it is not found if the root
is closed, because a closed root hands out no reference to follow

Settled by: `a_field_inside_an_open_shadow_root_is_named_and_a_closed_one_cannot_be`.
The closed case stays a miss: see `docs/bug-a-secret-with-no-input-element.md`.

## A field stays sealed once it has been seen, until the tab is let go

**Given** a field already named as sensitive
**When** a "Show password" toggle flips it to `type=text` and a new tree is built
**Then** it is still sealed, and the set is cleared only on detach

Settled by: `a_field_that_was_ever_sensitive_stays_sealed_until_the_tab_is_let_go`
and `a_revealed_password_does_not_reach_a_built_snapshot`, which lets the probe stop
naming the fields and then builds a tree from the set that survived.

This holds for a field the document named while it was still `type=password`. A field
first seen after it was revealed was never named, and only the accessible name is left.

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

Settled by: `a_node_with_no_properties_and_a_password_name_is_sealed`,
`a_password_field_carries_a_marker_and_not_a_value`
and `a_revealed_named_password_is_caught_by_the_name_alone`
