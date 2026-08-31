# AGENTS.md — test

Read the root `AGENTS.md` first.

## What is covered, and why only this

Unit tests cover the three **pure** units and the two **boundaries**:

| Spec | Covers | Why it exists |
|---|---|---|
| `pricing.service.spec.ts` | the rate table and the cost formula | money correctness is the assignment's core |
| `history.builder.spec.ts` | the context window algorithm | the other thing being graded |
| `model-resolver.spec.ts` | model resolution: default fallback, explicit override, an unsupported requested or default model, prototype-name rejection | the one place a wrong model is priced wrong, and pulling it out of `sendMessage` is what made it unit-testable at all |
| `openai.provider.spec.ts` | usage normalisation and error mapping | the boundary where provider shapes and secrets could leak |
| `http-exception.filter.spec.ts` | the error map and what reaches a client | the only client-facing error surface |
| `env.validation.spec.ts` | the Joi schema | a bad value must stop the boot, not the first request |

**There are no end-to-end tests**, deliberately — they were scoped out to protect a
timebox. The chat, pricing and context flow has no automated coverage above the unit
level. If you add e2e coverage, say so in the README's testing section, which currently
states the opposite.

## Conventions that matter

**The token counter is injected.** `history.builder.spec.ts` passes a trivial
one-token-per-character counter. That is what makes every expectation exactly computable
by hand and independent of the tokenizer's version. Do not swap it for the real
tokenizer — you would trade an exact test for an approximate one.

**Recompute expected values by hand.** The tests and the implementation were written from
the same source. A shared arithmetic error passes silently, which is exactly what
happened once. When you add a pricing case, derive the expected string from the rate
table yourself rather than from a run of the code.

**Negative assertions guard the secret boundary.** The provider tests assert both that
the client-facing message equals a fixed literal *and* that it does not contain a marker
planted in the mocked provider error. Equality alone breaks the moment someone rewords
the sentence; absence-of-marker catches any reintroduction regardless of wording.

**Assert absence, not just presence, wherever a leak is possible.** The filter spec
asserts that a `QueryFailedError`'s `driverError.detail` and any stack trace are *not* in
the response body.

**Prefer `'key' in obj` over `toBeUndefined()`** when the contract is that a key must be
absent. The two are indistinguishable to `toBeUndefined()`.

## Running them

```bash
npm test                       # the whole suite
npx jest test/<file>.spec.ts   # one file while iterating
npm run lint                   # must stay at 0 errors and 0 warnings
```

Jest is configured with `rootDir: "."` and `roots: ["<rootDir>/src", "<rootDir>/test"]`,
so specs are discovered here. `testRegex` is `.*\.spec\.ts$` — a file named `*-spec.ts`
with a hyphen will silently never run.

## Lint scope

`no-unsafe-assignment` / `no-unsafe-member-access` are relaxed for
`test/openai.provider.spec.ts` **only**, because mocking the OpenAI client needs it.
Everything else in `test/` and all of `src/` keeps full strictness. If a new test needs
the relaxation, prefer typed helpers first — `http-exception.filter.spec.ts` builds a
fake `ArgumentsHost` with `Record<string, unknown>` and needs no exemption.

## When you change a guard, check that it still guards

A regression test that cannot fail is worse than none, because it reports safety. The
cheap check is a mutation test: reintroduce the bug by hand, confirm the suite goes red,
revert. This was done for the provider-error leak — the guard failed on the exact
regression it exists to prevent, then passed again after revert.
