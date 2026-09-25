# vibe-browse

A Chrome extension that hands an AI agent the page's **accessibility tree** as a
tool-call interface, instead of a picture of the page.

Google's Chrome agents and Muse's browser control work on the same principle: the
browser already computes a semantic tree of what is on the screen — roles, names,
states, and what is interactive — so an agent can read that and act on it directly.

## Why the tree and not the pixels

A screenshot of a page costs thousands of image tokens and still has to be guessed
at. The same page as a filtered accessibility tree is a few hundred tokens of text,
each line naming one element the agent can click or type into by id. It is cheaper,
it is exact, and it does not hallucinate a button that is not there.

Screenshots are still supported, for the cases where only the picture will do.

## Why an extension

It runs in a real browser you are already signed in to. Pages behave the way they
behave for you, because it is you — which is the practical difference between this
and a headless driver that most sites will not serve.

## Status

A prototype, built for its author's own use. It has been driven through job
applications, cinema seat booking, and a handful of other errands that are mostly
reading a page, deciding, and clicking the right thing.

Not a product, not maintained for anyone else, and not promising to keep working
when a site changes its markup tomorrow.
