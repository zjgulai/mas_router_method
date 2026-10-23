# Product thesis

## The observation

TikTok content teams do not lack ideas. They lack a repeatable way to answer one
question: **why did that video work, and can we do it for our brand?**

Today they answer it by hand. Someone scrolls the feed, screenshots the video that
popped off, drops it in a group chat, and three people argue about what made it
work. Then a writer rewrites it by feel. It works, or it does not, and nobody
writes down which part was the copyable one.

The bottleneck is not generation. A competent model can write a TikTok script
right now. The bottleneck is **abstraction** — turning a specific viral video into
a pattern that survives being moved to a different brand, category, and language.
That is the part a generic chatbot does badly, because it defaults to imitation:
it copies the surface, and the surface is what does not transfer.

## What we build

A recipe engine. Give it a reference video and a brand; it returns a Recipe — the
hook, the beat skeleton with timing, the shot list, the script, the caption, the
audio direction, and an explicit statement of what was deliberately *not* carried
over and why.

Three properties make this a product rather than a prompt:

**It is structured.** A recipe is a validated object, not prose. It can be
reviewed field by field, compared across posts, and handed to a shooter without
translation.

**It is auditable.** Every recipe declares its provenance: which reference, how far
it strayed, which elements it dropped. A reviewer can always answer "why does it
look like that" without re-deriving the chain.

**It is brand-bound.** The same reference produces different recipes for different
brands, because the brand's guardrails and voice are inputs, not decoration.

## Who it is for

Two users, with different tolerances:

**The brand content lead** works in Feishu. She pastes a link into a group chat and
wants a usable draft back in the thread. She will not open a dashboard, and she
will abandon the product in week two if the draft needs as much rewriting as a
blank page.

**The agency strategist** works across many brands. She does want the dashboard —
she needs to compare which hook patterns worked, and to hand a client a recipe in a
format the client's shooter can execute. She is the one who pays for depth.

The first user validates the product. The second makes it a business. Build for the
first, design for the second, and do not build both at once.

## Why this niche, and why now

Three things converge:

**The failure mode is expensive and well understood.** A brand that copies another
brand's video too literally gets a takedown or a reputation problem. A brand that
copies it too loosely gets nothing. The valuable point is in between, and it
requires judgement — exactly where a well-scoped agent earns its keep over a
generic chatbot.

**The workflow already exists and is already manual.** We are not creating a
behaviour; we are removing a step that people already perform badly. That is a far
cheaper product to validate than one that requires a new habit.

**The deliverable is checkable.** Unlike "did the campaign work", which takes weeks
and confounds everything, "is this recipe shootable and on-brand" is judgeable in
minutes. That makes the eval loop cheap, which makes the product improvable.

## The bet, stated plainly

**We bet that abstraction is the hard part and generation is not.** If that is
wrong — if the market is satisfied with a generic chatbot writing scripts — this
product has no reason to exist, because the chatbot is already in the tools the
customer uses.

The evidence we would need to be wrong: brand teams telling us they get usable
drafts from a general assistant on the first try. Our experience says they do not,
because the assistant has no reference to abstract and no brand guardrails to obey.
But that is an assumption, and it is the one the pilot exists to test.

## Non-goals

**Not a video generator.** The recipe stops at the shoot. Video generation is a
different product with a different quality bar and different economics, and
attaching it would make our deliverable as unreliable as the model's weakest
capability.

**Not a publishing tool.** Scheduling and posting are solved problems with existing
vendors. The value is in what gets made, not in where it lands.

**Not a trend feed.** Scraping what is hot is a commodity. Understanding a specific
video deeply is not, and the second is what a recipe needs.

**Not multi-platform at launch.** TikTok's grammar is specific: vertical, fast, sound-on,
pattern-interrupting. A "works on every platform" claim at launch means the recipes
are mediocre everywhere. Prove it on one, then port the abstraction.
