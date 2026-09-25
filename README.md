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
  14  textbox  ""           [password]
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
| `attach(tabId, url)` | hold the protocol on one tab; refused on non-http and on blocked hosts |
| `read(tabId, version, nodes, url?, sealed?)` | build the tree an agent reads; refused on a blocked host |
| `sensitive(tabId)` | ask the document which fields hold a secret, by backend node id |
| `query(root, ask)` | narrow by role, text, depth, or interactive only |
| `act(tabId, command, nodes)` | click, type, focus, scroll — by node id |
| `group(tabIds, title, colour)` | put an errand's tabs together |
| `redact(text)` | replace what is recognised, and count it |
| `redactUrl(url)` | the same, plus the value of any credential-shaped parameter |
| `readable(url)` | whether a page may be read: right scheme, and not on `BLOCKED` |

Details, and the shape of every argument, are in `docs/`. An agent reaches all of it
from outside the browser through `bridge/server.py`, whose commands are listed in
`bridge/SKILL.md`.

## What it does about the obvious danger

It holds a debugger on a browser you are signed into. Meta shipped Muse with a team
on this problem and the criticism was fair; it is fair here too.

* **Only what you attached.** The panel offers the tab you are already looking at,
  and nothing else; your other tabs are never listed. A page you did not point it at
  has never been read.
* **A list of sites it will not read at all.** Banks, password managers, payment
  services, the IRS and the SSA. A subdomain of one of these is one of these. It is
  checked in three places: before attaching, on every navigation of an attached tab
  (which detaches it), and before a tree is built. An unparseable or empty URL is
  treated as blocked. The list is exported as `BLOCKED` in `core/redact.ts`:

  chase.com · bankofamerica.com · wellsfargo.com · citi.com · capitalone.com ·
  usbank.com · 1password.com · lastpass.com · bitwarden.com · dashlane.com ·
  keeper.io · nordpass.com · paypal.com · venmo.com · cash.app · zelle.com ·
  stripe.com · irs.gov · ssa.gov

  A list is a thing you can be missing from. It is a floor, not a boundary.
* **Password fields are found in the DOM, not in the tree.** Chrome's accessibility
  tree carries no `inputType`, no `protected` and no `autocomplete`. Measured on
  Chrome 153, the only properties emitted were `editable focusable invalid
  labelledby level multiline readonly required settable url`. So the document is
  asked instead: one `DOM.querySelectorAll` over `input,textarea` and one
  `Runtime.evaluate`, and every match is sealed by `backendDOMNodeId`.

  A field counts as sensitive on `type=password`, on a computed
  `-webkit-text-security` other than `none`, on an `autocomplete` naming a password
  or a one-time code, or on a `name` or `id` that reads like one. The probe runs in
  the isolated world, so the page cannot rewrite `getComputedStyle` under it. The
  set is sticky while the tab is attached: a field revealed by a "Show password"
  toggle stays sealed. The accessible-name heuristic still runs underneath it.

  What this misses: a closed shadow root, a cross-origin iframe, and a secret
  rendered as plain text with no input element. If the lookup fails the snapshot is
  still built, from the name heuristic alone, and says so with `degraded: true`. See
  `docs/KNOWN-ISSUES.md`. Do not treat this as a guarantee.
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

Not a proof. A smaller blast radius, and an honest account of the edges. What is still
open, and not fixed, is in `docs/KNOWN-ISSUES.md`.

## What it deliberately does not do

**Screenshots.** A picture would undercut the argument above and cost four orders of
magnitude more per look.

**Bookmarks.** One permission prompt more than this is worth.

**Audio and video capture.** The screenshot argument, several times over.

**Console and network inspection.** That is a debugger. This is not one.

## Status

A prototype, built for its author's own use, and not maintained for anyone else. It
will break when a site changes its markup.
