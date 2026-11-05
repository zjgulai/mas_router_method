# Evidence

A prototype that ends with "here are three variants, tell me which you like" has
given the decision back to the person who asked for it. That is the failure mode
this file exists to prevent: the point of building variants is to **read the
answer off what they do**, not to ask someone to guess from what they look like.

Applies to both branches. [UI.md](UI.md) produces the variants; [LOGIC.md](LOGIC.md)
produces the state model. This file governs how either one turns into a decision.

## 1. Name the decision before building

One sentence, written down before the first line of prototype code:

> "Should the settings page show all 40 fields, or 6 with the rest behind a
> disclosure?"

If you cannot write that sentence, there is no prototype — there is a wish to
"explore". Send it back to the real design work. A prototype without a decision
attached burns a day and produces decoration.

Then write the **falsifier**: which observation would flip your current lean. If
nothing you could observe would change your mind, you are not prototyping, you
are defending.

## 2. Make the variants differ where the decision lives

Variants must disagree on the axis the decision is about, and agree everywhere
else, or the comparison is noise. Two variants that differ in both layout and
colour cannot tell you which one the layout decision favoured.

State the axis explicitly with each set:

- layout decision → same colours, same copy, different structure
- density decision → same structure, different amounts of information shown
- interaction decision → same screen, different primary affordance

If two drafts collapse onto the same shape, that convergence is itself a finding:
the axis may not be contested. Say so and stop, rather than manufacturing a third
variant to justify the exercise.

## 3. Observe on the same surface the decision will live on

Run the thing, do not read the code and imagine it.

| Decision kind | What you capture | How |
| --- | --- | --- |
| Looks / layout / density | a screenshot of each variant, same viewport, same data | Drive the page, screenshot every `?variant=` |
| Interaction / feel | a screenshot mid-interaction, plus the steps that got there | Script the click path, capture the end state |
| Behaviour / timing | the actual numbers, with run count and spread | Log elapsed time per operation, repeat ≥5 |
| State model / legality | the walkthrough outputs, including the case that should be illegal | Run each scenario, paste the state panel |

**The observation is the test.** There is no assertion here, which is why the
artifact has to be attached: a screenshot, a timing line, a pasted state panel. A
claim that "variant B feels faster" without the number is a guess in a costume.

## 4. Rule out that the evidence measured something else

Before you trust a comparison, name what else could explain the gap, and check
each one:

- **Different data.** Variant A rendered 40 rows, B rendered 4. Crop to the same.
- **Different viewport or font loading.** Screenshot before webfonts settle and every
  variant looks like a different design.
- **Cold start.** The first variant you loaded paid the compile cost. Re-run in
  reverse order before comparing timings.
- **Noise floor.** Run twice. If the run-to-run spread is bigger than the difference
  between variants, the variants are indistinguishable and the decision should be
  made on a different axis entirely.
- **A difference that lives outside the prototype.** "B is faster" when B reads a
  cached fixture and A does not tells you nothing about production.

If you cannot say why the gap is as large as it is, say that the comparison is
inconclusive. Inconclusive is a usable result; a confident wrong comparison is not.

## 5. Present a comparison, not a menu

The reply carries four things, in this order:

1. **The decision**, restated, and the falsifier.
2. **The evidence**: one row per variant, the artefact, the observed result. Same
   columns for every variant, so a difference is a cell, not a paragraph.
3. **Trade-offs**: what each variant costs. Not "worse"; *costs what* — 40 fields of
   scroll, one extra click, 200ms, a layout that breaks below 900px.
4. **A recommendation, with the reason the evidence supports it.**

Then the scratch path, and one line saying the prototype is throwaway.

Do not end with "which do you prefer?" unless the remaining difference is genuinely a
matter of taste no observation can settle — and if it is, say that explicitly, so
the person knows they are being asked for taste and not for analysis.

## 6. When the evidence decides, say so

Many decisions need no human at all. If one variant wins on every axis that
matters, or the others miss the falsifier, that is a decision, not a shortlist.
State the winner, state the evidence, and go build it. Offering a menu when the
evidence is unambiguous hands back work you already did.

Escalate to the person only when:

- the remaining trade-off is a preference (brand tone, how much a user should be
  trusted, how dense the interface should feel), or
- the evidence is inconclusive and the cost of testing further exceeds the cost
  of picking wrong.

## Anti-patterns

- **A menu instead of a verdict.** Three variants and no recommendation is three
  times the work with none of the decision.
- **Screenshots of different states.** Two variants captured at different scroll
  positions are not comparable evidence.
- **A number with no spread.** One timing run proves nothing; the noise floor is
  half the measurement.
- **Manufacturing a third variant** after two converged, to keep the exercise alive.
- **Presenting the prototype's own limitations as findings.** "Variant C has no
  empty state" says more about the throwaway than about the decision.
