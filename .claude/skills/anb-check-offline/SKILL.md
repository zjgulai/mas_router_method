---
name: anb-check-offline
description: Cut the outside world out — wrong credentials, no network — and confirm the product reports that it cannot tell rather than claiming success. Use when everything works too smoothly, or to prove error handling is real.
disable-model-invocation: true
argument-hint: "What outside service does it depend on?"
---

# Check — pull the plug

The purpose: confirm that a broken dependency produces an honest "I could not do
this", not a false "done".

## Why this one matters more than it looks

Almost every product of this shape depends on something outside: a model, a video
service, a website. When that thing is down, the product has two options — say it
failed, or produce something anyway.

The second option is dangerous precisely because it is well-intentioned. Falling
back to a cached value, an empty result, or a shorter answer keeps the user moving.
But if that fallback is then recorded as a success, every downstream number becomes
a lie: the quality score is measuring fallbacks, the cost report shows near-zero,
and the failure never appears in the count.

## Run it

Pick one dependency and break it in the way a user would experience:

- **Credentials.** Change the key to a wrong value, or remove it.
- **Network.** Point the address at a host that does not resolve.
- **Permission.** Use an account that should not have access.

Then run the product through its normal path.

## What you are looking for

The correct outcome is a message that says, in ordinary words, **which thing could
not be reached** — and a record of the attempt as a failure.

Three specific wrong outcomes:

- **It succeeds.** Then it never depended on that service, and you have learned
  something important about what is actually doing the work.
- **It fails silently** — no message, or a message about something unrelated.
  Then the error is being swallowed somewhere, and users will hit it as "it just
  doesn't work sometimes".
- **It reports a permission or format error** rather than an unreachable one. Then
  the credential is not being read at all, and the configuration path is broken
  independently of this test.

## Report back in this shape

> Broke: `<which dependency, how>`. Expected: an error naming it. Saw: `<exact
> message>`, exit `<code>`, and `<whether the attempt appears in the record>`.

## What this does not prove

That the dependency works when it is up. This check only confirms honest failure.
For the other direction, you need a real run — which is stage 2's exit test.
