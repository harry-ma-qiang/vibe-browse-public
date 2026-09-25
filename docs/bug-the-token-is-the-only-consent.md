# bug: the bridge asks nobody before it acts

## What happens

While `bridge/server.py` is running, any process that can read `~/.vibe-browse-token`
can drive every attached tab. There is no per-command confirmation and no record of
what was done. Attaching a tab is the only consent, and it is given once, for the
whole session.

The token file is mode 0600, and both listeners bind `127.0.0.1` only, so this is a
local trust boundary. It is not a sandbox: anything that can read the home directory
is inside it.

## What should happen

A command that changes the page is either confirmed by the person at the time, or
written to a record they can read afterwards, so that holding the token is not the
same as holding the browser.

## How to see it

Start the server, attach a tab from the side panel, then from any other shell on the
same machine read the token file and POST `{"action":"act", ...}`. The click lands.
Nothing was asked and nothing was logged.

Until then: stop the server when an agent is not using it.

Settled by: nothing yet. This is a design limit of the bridge, not a fault a test in
`tests/` can catch.
