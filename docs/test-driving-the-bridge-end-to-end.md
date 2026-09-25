# test: driving the bridge end to end

Run by hand, not automated. Nothing in `tests/` covers the extension half, so this is
the case a person repeats to see the whole chain work: HTTP, websocket, extension,
CDP, live page.

Last run on Chrome for Testing 153.0.8010.12, with `bridge/server.py` running and the
extension loaded unpacked. The figures below are what a passing run looks like.

## Set it up

1. `cd bridge && uv run server.py`. It prints both listener addresses and stays up.
2. Load the extension unpacked from the build output.
3. `TOKEN=$(cat ~/.vibe-browse-token)`.
4. Open a page carrying two password inputs — one named, one with no accessible name.

## The extension dials in by itself

`GET http://127.0.0.1:8766/health` returns `{"ok": true, "extension": true}` with no
manual step. The side panel, opened by a genuine click, shows `bridge up`.

## A command reaches the live page and comes back

Each of these returns 200, through HTTP to websocket to extension to CDP:

- `{"action":"tabs"}` returns the live tab row
- `{"action":"attach"}` holds the tab; the panel shows it with a detach control
- `{"action":"snapshot"}` returns the tree
- `{"action":"detach"}` lets it go

A passing snapshot is around 4505 bytes and carries `degraded: false`.

## The refusals still hold in the same run

- `POST /command` with no token: 401
- `POST /command` with a wrong token: 401
- `POST /command` with an `Origin` header: 403

## The hardest case: both fields revealed

Flip both password inputs to `type=text`, so their values are genuine cleartext on
screen, then snapshot. The output carries:

- `CORRECT-HORSE-BATTERY-1` zero times
- `OFFSCREEN-SECRET-9Z` zero times
- the marker `[password]` four times — three before the unnamed field was sealed

## The build carries the code this depends on

The built `background.js` is 27,711 bytes and contains `getFullAXTree` once,
`querySelectorAll` twice, `webkitTextSecurity` twice, `createIsolatedWorld` once and
`[password]` once.
