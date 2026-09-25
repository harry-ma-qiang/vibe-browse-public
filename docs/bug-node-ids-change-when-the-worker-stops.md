# bug: node ids change when the service worker stops

## What happens

The snapshot a `query` or an `act` works against is held in the service worker's
memory. Chrome stops the worker when it is idle, and the tree goes with it. The next
`query` builds a fresh one, whose node ids need not match the ids the agent is still
holding from before the stop.

An `act` against a moved id is refused rather than carried out — the node is re-read
and its role and its backend node id are compared first — so the failure is loud. But
an agent that kept a list of ids across an idle period finds them naming other
elements, with no event to say the tree it was holding is gone.

## What should happen

A snapshot survives the worker being stopped, or a reply that was built from a fresh
snapshot says so, so an agent knows to discard the ids it holds.

## How to see it

Attach a tab, take a snapshot, note a node id, leave the browser idle until Chrome
stops the worker, then `query` the same page again. The ids in the second reply need
not line up with the first. Re-snapshot if a reply looks unfamiliar.

Settled by: nothing yet. No test in `tests/` drives a worker restart.
