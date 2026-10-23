# 02: In-memory stores, so the loop can run without a database

**What to build:** `BrandStore`, `ReferenceStore`, and `RecipeStore` implemented in
memory, seeded with one realistic brand profile. Enough for the runtime to execute a
full workflow in a script and in the eval harness.

**Blocked by:** None (can start immediately)

**Status:** ready-for-agent

- [ ] One seeded brand with a real voice, audience, and at least one regulated claim
- [ ] `saveDraft` validates the recipe against `Recipe` before accepting it — a malformed recipe must fail loudly, not become a strange record
- [ ] `list` returns references with their analysed status
- [ ] The same implementations serve as eval fixtures, so they are written once
- [ ] A test asserts that an invalid recipe is rejected, with the field named in the error
