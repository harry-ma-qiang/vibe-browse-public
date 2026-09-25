# vibe-browse

A Chrome extension that hands an AI agent the page's **accessibility tree** as a
tool-call interface, instead of a picture of the page.

```
   page                extension              agent
    |                      |                    |
    |--- AXTree ---------->|--- JSON tree ----->|
    |                      |                    |
    |<-- CDP Input --------|<-- {click, 12} ----|
    |                      |                    |

  read:  Accessibility.getFullAXTree
  act:   DOM.getBoxModel  ->  Input.dispatchMouseEvent
```

The agent never sees the page. It sees a list of lines, each one element:

```
  12  button   "Sign in"
  13  textbox  "Email"
  14  textbox  "Password"   [password]
```

It answers with `{"action":"click","nodeId":12}`.

## Why this is faster

A screenshot is thousands of image tokens and still has to be guessed at. The same
page as a filtered tree is a few hundred tokens of text, and each line already names
what the element is and how to reach it.

| | per look |
|---|---|
| screenshot | ~1,500 image tokens, positions inferred |
| whole tree | ~3,000 text tokens |
| tree, interactive only | **~200 text tokens, ids exact** |

Two consequences beyond cost. There is no coordinate to get wrong, so a click lands
on the element the agent named or is refused. And a tree is cheap enough to re-read
after every action, which is what stops a ten-step task decaying step by step.

## The surface

| Call | Does |
|---|---|
| `attach(tabId, url)` | hold the protocol on one tab; refused on anything not http |
| `read(tabId, version, nodes)` | build the tree an agent reads |
| `query(root, ask)` | narrow by role, text, depth, or interactive only |
| `act(tabId, command, nodes)` | click, type, focus, scroll — by node id |
| `group(tabIds, title, colour)` | put an errand's tabs together |
| `redact(text)` | replace what is recognised, and count it |
| `redactUrl(url)` | the same, plus the value of any credential-shaped parameter |

Details, and the shape of every argument, are in `docs/`.

## What it does about the obvious danger

It holds a debugger on a browser you are signed into. Meta shipped Muse with a team
on this problem and the criticism was fair; it is fair here too.

* **Only what you attached.** The panel offers the tab you are already looking at,
  and nothing else; your other tabs are never listed. A page you did not point it at
  has never been read. There is no list of sites it avoids, because a list is a
  thing you can be missing from.
* **A password never leaves.** Not by pattern — by structure. A field is treated as
  a password on any of four signals: an input type of `password`, an `autocomplete`
  of `current-password` or `new-password`, a `protected` flag, or a secret-shaped
  accessible name on a text-entry role. It yields a marker, and its whole subtree
  stops there — including when the node itself would otherwise have been dropped.
* **http and https only**, and a URL that will not parse is refused rather than
  assumed safe.
* **Shapes are replaced and counted**: cards, national ID, API keys, signed tokens.
  A pattern is not a promise. A secret with no shape is not caught, and one split
  across two nodes is not caught. The counts are returned so a caller can see what
  was found.
* **Four protocol domains**: Accessibility, DOM, Page, Runtime. Runtime is enabled
  because the change binding needs it, and enabling it means `consoleAPICalled` and
  `exceptionThrown` do arrive. Nothing reads them, and nothing stores them. No
  domain that reads a request or a stored value is enabled at all.
  A smaller surface, not a boundary.
* **A control is re-read before it is used.** Ids name a place in a tree you already
  read; pages move. A command against something that changed is refused.
* **The page watcher runs in an isolated world**, so a page cannot silence it or
  forge a change.

Not a proof. A smaller blast radius, and an honest account of the edges.

## What it deliberately does not do

**Screenshots.** A picture would undercut the argument above and cost four orders of
magnitude more per look.

**Bookmarks.** One permission prompt more than this is worth.

**Audio and video capture.** The screenshot argument, several times over.

**Console and network inspection.** That is a debugger. This is not one.

## Status

A prototype, built for its author's own use, and not maintained for anyone else. It
will break when a site changes its markup.
