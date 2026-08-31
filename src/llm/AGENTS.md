# AGENTS.md — src/llm

The seam in front of the model provider. Read the root `AGENTS.md` first.

## The port

`LlmProvider` is an **abstract class**, not an interface, so it can be used directly as a
Nest injection token. `OpenAiProvider` is the only implementation. Everything downstream
depends on the abstract class.

The port returns a normalised result so the Responses API's `usage` shape never reaches
the domain. Missing detail fields default to `0`, never `undefined` or `NaN`.

## Non-negotiables in the request

- **`store: false` on every call.** Conversation state lives in our database. This is an
  architectural decision, not a default — see the root file.
- **`reasoning: { effort }` only for models whose pricing entry has
  `supportsReasoning: true`.** For the others the key must be **absent from the request
  object entirely**, not present with value `undefined`. It is added by a conditional
  spread for exactly this reason, and the test asserts `'reasoning' in request === false`
  rather than `toBeUndefined()` — the latter cannot tell the two apart.

## Error mapping, which is subtler than it looks

Every one of these was a live bug:

- **SDK error classes never set `this.name`.** They all report `"Error"`. Detect a
  timeout with `err instanceof OpenAI.APIConnectionTimeoutError`, never by comparing
  `.name` to a string. The `instanceof` check must sit *before* the cast to the local
  error interface.
- **`APIError.headers` is a Fetch `Headers` instance.** `headers['retry-after']` is
  `undefined`; you need `.get('retry-after')`.
- **`.get()` returns `null` for a missing header**, and `Number(null)` is `0`, and
  `Number.isFinite(0)` is `true`. Without an explicit null guard a 429 with no
  `retry-after` emits `Retry-After: 0`, telling a rate-limited client to retry
  immediately.
- **No provider text may cross the boundary.** The generic branch logs
  `err.message` server-side and throws a *fixed literal* — OpenAI's own error strings
  contain a partial API key and a link to its dashboard. Three tests assert both the
  exact message and the **absence** of a marker string; the absence assertion is the one
  that survives rewording.

## Empty and incomplete responses

The adapter rejects a response whose status is not `completed`, and one whose text is
empty. Without that guard an `incomplete` response — or one whose only output item is a
refusal or reasoning — is stored as an empty assistant message and billed for.

## The tokenizer

`gpt-tokenizer`'s **root export throws** on a message array:
`Model name must be provided either during initialization or passed in to the method`.
It handles plain strings only, and passing `{ model }` as an option does not help in the
installed version. A model-specific import is required.

We import `gpt-tokenizer/model/gpt-5-nano` — the application's own default model. All the
model exports in the pricing table return identical counts for the same chat (verified),
so this is about saying what we mean, not about the arithmetic.

`countTokens` already includes per-message framing overhead. The result is an **estimate**
used to size the window; billing always uses the counts OpenAI reports back. The
difference is stored in `estimated_input_tokens` next to the real `input_tokens`, which
is what makes the counter auditable.

## Module wiring

`LlmModule` provides and exports `LlmProvider`, `TokenCounterService` and
`PricingService`. `ChatModule` imports it and must **not** re-provide `PricingService`.

`REASONING_EFFORT` is validated and defaulted by Joi at boot, so `ConfigService.get`
returns a real value. Do not add a `??` fallback — it can never fire and reads as
distrust of the config layer.
