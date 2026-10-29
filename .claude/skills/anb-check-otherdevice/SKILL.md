---
name: anb-check-otherdevice
description: Open it on a device that is not the build machine, and have someone else use it while you watch. Use before calling anything finished, or when "it works" needs to become "someone else can use it".
disable-model-invocation: true
argument-hint: "What address should I open?"
---

# Check — try it on another device

The purpose: find the gap between "works where it was built" and "works".

## Why a different device, specifically

A second browser on the same machine shares almost everything: the same network, the
same credentials, the same local data, the same notion of what a valid address is.

A phone shares almost nothing. It is a genuinely different environment, it is the
environment most people will actually use, and it fails differently — which is the
point. The failures it surfaces are the ones a stranger would hit.

## Run it

1. Get the address.
2. Open it on a phone, over mobile data if possible — not on the same wifi, which
   reintroduces the shared network.
3. Do not log in with a saved account. Start cold, the way a stranger does.

Then a second step, which is where the information is:

4. Hand it to one other person. Tell them what it is for in one sentence, then say
   nothing for sixty seconds. Watch their hands, not their face.

## What you are looking for

Write down, without interpreting:

- The first thing they tapped.
- The first moment they paused for more than three seconds.
- The first thing they said out loud that was not a question to you.
- Whether they asked you anything. **Every question is a defect**, not a
  documentation gap.

That last point is the one people resist. If they had to ask, the product did not
tell them, and the fix belongs in the product.

## Report back in this shape

> Address opened on `<device>`: `<yes/no, and what appeared>`.
> Other person got stuck at: `<step>`. They asked: `<question>`.
> The gap between me and them is: `<one sentence>`.

## What this does not cover

Whether the thing is *useful*. That was the verify stage's job, and this check cannot
substitute for it. A product can be easy to open and still be pointless.
