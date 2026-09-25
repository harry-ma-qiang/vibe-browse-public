# test: driving the bridge end to end

Run by hand, not automated. Nothing in `tests/` covers the extension half, so this is
the case a person repeats to see the whole chain work: HTTP, websocket, extension,
CDP, live page.

Last run on Chrome for Testing 153.0.8010.12, with `bridge/server.py` running and the
extension loaded unpacked. The figures below are what a passing run looks like.

The figures were measured before the websocket was given the same token as the HTTP
side, before the probe walked open shadow roots, and before the name was matched a
whole word at a time. The steps are current and the build figures below were measured
again; the figures taken from the browser were not, and this record is waiting on a run
that repeats them.

## Set it up

1. `cd bridge && uv run server.py`. It prints both listener addresses and stays up.
2. Load the extension unpacked from the build output.
3. `TOKEN=$(cat ~/.vibe-browse-token)`.
4. Give the extension the same token, once: `chrome://extensions` -> vibe-browse ->
   **service worker**, then in that console
   `chrome.storage.local.set({ bridgeToken: '<the token>' })`. Without it the panel
   stays on `bridge offline` and `/health` reports `extension: false`.
5. Open a page carrying two password inputs — one named, one with no accessible name.
   For the shadow-root case, render a third inside an open shadow root and a fourth
   inside a closed one.

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
- `POST /command` with `Content-Length: abc`: 400, and the server stays up
- a websocket to `ws://127.0.0.1:8765` with no subprotocol: 401
- the same with `bearer.wrong`: 401
- the same with the right token and `Origin: https://evil.example`: 403
- the same with the right token while the extension is connected: 409, and `/health`
  still reports `extension: true`

The last one is the case that matters: before it, the newest connection won, so a local
process could take the extension's place, be handed what an agent typed, and answer
with a tree it made up.

## The hardest case: both fields revealed

Flip both password inputs to `type=text`, so their values are genuine cleartext on
screen, then snapshot. The output carries:

- `CORRECT-HORSE-BATTERY-1` zero times
- `OFFSCREEN-SECRET-9Z` zero times
- the marker `[password]` four times — three before the unnamed field was sealed

## The build carries the code this depends on

The built `background.js` is 29,161 bytes and contains `getFullAXTree` once,
`querySelectorAll` twice, `shadowRoot` twice, `webkitTextSecurity` twice,
`createIsolatedWorld` once, `DOM.requestNode` once, `bearer.` once, `bridgeToken` once
and `[password]` once. Measured from `npm run build`, not from the browser run, so it
is the one figure here that is current.
