---
name: vibe-browse-bridge
description: Drive a Chrome tab through its accessibility tree - read, query, click, type - over a loopback HTTP bridge.
---

# vibe-browse bridge

One process on the loopback address. You POST a command to it over HTTP, it hands the
command to the extension over a websocket, and it returns what the extension answered.

```
you --HTTP(127.0.0.1:8766)--> server.py --WS(127.0.0.1:8765)--> extension --CDP--> tab
```

## Start it

```sh
cd bridge && uv run server.py
```

It prints both listener addresses and stays in the foreground. The extension dials in
by itself; the side panel shows `bridge up` once it has.

## The token

Made on first run, kept at `~/.vibe-browse-token`, mode 0600. Both listeners want it.

```sh
TOKEN=$(cat ~/.vibe-browse-token)          # or: uv run server.py --print-token
```

You send it as `Authorization: Bearer $TOKEN`. The extension cannot: a browser puts no
header on a websocket, so it offers the same secret as the subprotocol
`bearer.<token>`, and the server echoes that one back. Give the extension the token
once, by hand — open `chrome://extensions`, find vibe-browse, click **service worker**,
and run in the console that opens:

```js
chrome.storage.local.set({ bridgeToken: 'paste the contents of ~/.vibe-browse-token' })
```

Until that is stored the extension does not dial, and the side panel reads
`bridge offline`. It picks a stored token up within a second, with no reload.

## Two calls

```sh
curl -s http://127.0.0.1:8766/health
```

```sh
curl -s -X POST http://127.0.0.1:8766/command \
  -H "Authorization: Bearer $TOKEN" \
  -H 'content-type: application/json' \
  -d '{"action":"snapshot"}'
```

`/health` needs no token and says whether an extension is connected. Everything else
is `POST /command` with the bearer header.

## Replies

Every reply is one of these, carrying back the id the server put on your command:

```json
{"id": "...", "ok": true,  "data": {}}
{"id": "...", "ok": false, "error": "no action frobnicate"}
```

An unknown action is an error, not a dropped connection. A command the extension does
not answer within 30 seconds returns an error too.

## Actions

`tabId` is optional everywhere it appears: leave it out and the active tab of the
current window is used.

| action | arguments | returns |
|---|---|---|
| `health` | - | `{attached: [tabId], bridge: "connected"}` |
| `tabs` | - | `[{tabId, title, url, attached, stale, readable}]` |
| `attach` | `tabId` | `{ok: true}`, or an error on a blocked or non-http page |
| `detach` | `tabId` | `{ok: true}` |
| `snapshot` | `tabId` | `{tabId, version, root, replaced, builtAt, degraded}` |
| `query` | `tabId`, `depth`, `roles`, `text`, `interactiveOnly` | `{nodes, matched, total, degraded}` |
| `act` | `tabId`, `command` | `{ok: true}`, or an error saying why not |
| `group` | `tabIds`, `title`, `colour` | `{groupId}` |
| `ungroup` | `tabIds` | `{ok: true}` |
| `groups` | - | `[{id, title, colour, tabIds}]` |

`snapshot` attaches the tab first if it is not attached already, then builds the tree.
`query` and `act` work on the snapshot last built for that tab, building one if there
is none and rebuilding it if the page has changed since. Every `query` argument
narrows, and all of them are optional. Both `snapshot` and `query` carry `degraded`,
which is true when the document could not be asked which fields hold a secret.

The four commands `act` carries out:

```json
{"action": "click",    "nodeId": 12}
{"action": "setValue", "nodeId": 13, "value": "me@example.com"}
{"action": "focus",    "nodeId": 13}
{"action": "scroll",   "nodeId": 1, "direction": "down"}
```

A `nodeId` names a node of the snapshot you are holding. It is re-read before it is
used, so a command against something that has changed is refused rather than guessed.

## Typical run

```sh
TOKEN=$(cat ~/.vibe-browse-token)
say() { curl -s -X POST http://127.0.0.1:8766/command \
  -H "Authorization: Bearer $TOKEN" -H 'content-type: application/json' -d "$1"; }

say '{"action":"tabs"}'
say '{"action":"snapshot"}'
say '{"action":"query","interactiveOnly":true,"depth":12}'
say '{"action":"act","command":{"action":"click","nodeId":12}}'
say '{"action":"snapshot"}'
```

Re-read after acting. A tree is cheap; a stale one is not.

## What the bridge refuses

- An HTTP request carrying an `Origin` header is refused with 403, by design. A page
  cannot set that header, so a request that has one came from a page, and no page has
  business driving a debugger.
- On the websocket the rule has to differ: a browser must send `Origin`, and the
  extension's own `chrome-extension://<id>` arrives on every dial. So what is refused
  there with 403 is a **page** origin — anything that is not `chrome-extension://`,
  `moz-extension://` or `safari-web-extension://`. A handshake with no origin at all is
  allowed, because it did not come from a browser and still needs the token.
- A request without the bearer token, or with the wrong one, is refused with 401. The
  websocket handshake is refused the same way, so a local process cannot connect as the
  extension, harvest what an agent types and answer with a tree it made up.
- A websocket handshake arriving while an extension is already connected is refused
  with 409, rather than being allowed to displace it. If the browser was closed
  uncleanly the server needs its keepalive ping to notice, so a reconnection can take
  up to a few tens of seconds.
- Both listeners bind `127.0.0.1` only.
- `GET /health` needs no token, and says only whether an extension is connected.

This is a local trust boundary, not a sandbox. Anything that can read your home
directory can read the token and issue commands.

## What reaches you

The tree is redacted inside the extension before it reaches this process: password-like
fields are sealed along with their subtree, and card, national-ID, API-key, signed-token
and email shapes are replaced with a marker and counted in `replaced`. Pages on the
blocked list (banks, password managers, payment services) are never read at all.

A field is sealed because the document said so - its type, its computed style, its
autocomplete or its name, matched a whole word at a time - with the accessible name as
a fallback. The probe walks open shadow roots. It can still miss: a **closed** shadow
root, which hands out no reference to follow, a cross-origin iframe, a secret printed
as plain text. If the lookup failed, `degraded: true` comes back and only the fallback
ran. Read `docs/bug-a-secret-with-no-input-element.md`.
