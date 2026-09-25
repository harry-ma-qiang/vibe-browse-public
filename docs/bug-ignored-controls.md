# bug: an ignored control is the only way into some pages

## What happens

The protocol marks a node `ignored` when it decides the node adds nothing for assistive
technology. Dropping every ignored node loses buttons and links that a person can still
click, and on some pages those are the only controls there are.

## What should happen

An ignored node whose role can be acted on is kept anyway. Every other ignored node is
dropped and its children are promoted in its place.

## How to see it

Build a tree from a page whose primary button is marked ignored, and ask for interactive
roles. Before the fix the button is absent and no command can reach it.

Settled by: `an_ignored_button_is_kept_and_an_ignored_wrapper_is_not`
