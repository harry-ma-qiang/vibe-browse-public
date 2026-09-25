# bug: the tree and the sealed set are read a moment apart

## What happens

`build()` in `core/bridge.ts` does three things in turn, each of them an await:
`Accessibility.getFullAXTree`, then `sensitive()`, which runs its own probe, then
`settled()`. The page is free to change between them.

Three consequences, all of them windows rather than holes:

- the tree can carry a field the probe never saw, because the field was added after the
  tree was fetched. It is sealed only if the name heuristic catches it.
- the probe can name a `backendDOMNodeId` that is not in the tree, which seals nothing
  and costs a `DOM.requestNode` and a `DOM.describeNode`.
- `settled()` writes the tab clean at the end of the build, so a change that arrived
  while the build was running is forgotten and the tree that does not describe it is
  handed out as current until the next change.

The sealed set is sticky, so the first consequence closes itself on the next build, and
the window is one round trip on a page nobody is typing into. It is a race, and it is
not fixed.

## What should happen

The tree and the sealed set describe the same moment, or the build notices that the
page moved under it and starts again.

## How to see it

Attach a page whose script adds a password field on a timer, and take a snapshot timed
so the field arrives between the tree fetch and the probe. The node is in the tree and
not in the sealed set. The same snapshot taken again seals it.

Settled by: nothing. No test in `tests/` drives a page that changes mid-build, and the
stand-ins answer every call at once.
