# AGENTS.md — src/chat

Sessions, messages, the context window, and money. Read the root `AGENTS.md` first;
this file only covers what is specific to this directory.

## The two seams, and why they exist

This module has exactly two deliberate indirections. Both earn their keep; do not add a
third without a concrete reason.

**`chat.repository.ts`** wraps TypeORM. Its purpose is that `findActiveHistory()` — the
query answering "what is this session's history right now" — lives in one named place.
Session reset (keeps the session id, starts a fresh context) changes exactly that method:
it now takes the session's current `generation` and filters on it. It stays a single
named method with its comment.

Totals split the same way, but into three: a private `queryTotals(sessionId, generation?)`
holds the one SQL query, and `findActiveTotals()` / `findLifetimeTotals()` are its two
public callers — same query, generation filter present or absent. Do not duplicate the
SQL between them; add a third caller instead if a third totals shape is ever needed.

**`LlmProvider`** (defined in `../llm/`) sits in front of OpenAI so tests never touch the
network. `ChatService` depends on the abstract class, never on the OpenAI SDK.

`history.builder.ts`, `pricing.service.ts` and `model-resolver.ts` are **pure**: no
database, no network, no clock, no config reads. That is what makes them exactly
testable. Keep them that way — the token counter is injected as a parameter for precisely
this reason. `model-resolver.ts` is the newest of the three, extracted out of
`sendMessage` for a concrete reason: model selection is the one place a bug is invisible
everywhere except the bill (usage and `usage.model` still look right; only the stored
cost is priced off the wrong rate), and pulling it into a pure function is what makes it
unit-testable at all (`test/model-resolver.spec.ts`).

## Money

Every rule from the root file applies here, plus:

- `PricingService.calculate()` is the only place a cost is computed. It returns
  10-decimal strings and nothing downstream reformats them.
- `ZERO_COST_USD` is a string constant, not `(0).toFixed(10)`. Building money by
  formatting a number is the shape the rule exists to forbid, even when the value is a
  literal zero.
- Session totals are summed by Postgres (`SUM(total_cost_usd)::numeric(18,10)::text`),
  never in JavaScript.
- `isSupported()` and `get()` use `Object.hasOwn`. Plain `in` or bracket access lets
  `'constructor'` and friends through and yields `NaN` costs.
- `PRICING` entries are frozen. Do not mutate a rate object.

## The write contract

The model call happens **outside** any transaction. Both messages and the `interaction`
row are then written in **one** transaction. The consequence is deliberate: a failed
model call leaves nothing behind — no orphaned user message.

The sequence number is computed inside that transaction
(`SELECT COALESCE(MAX(seq),0)+1`), and a unique index on `(session_id, seq)` guards it.
A `23505` violation is mapped to `SequenceConflictError` **only** when
`driverError.constraint === 'messages_session_seq_uniq'` — matching on the error code
alone would silently mislabel any future unique constraint.

Two concurrent messages to the same session will read the same history. That is a known
limitation, documented in the README; the production answer is an advisory lock on the
session, deliberately not implemented.

## The context window

`buildContext()` implements a simplified middle-out: the system prompt and the new user
message are always present, a pinned head preserves how the conversation was framed, the
tail is filled from the newest message backwards, and the middle is dropped. The
reasoning is that models attend least to the middle of a long context (Liu et al., 2023,
"Lost in the Middle").

Three details are load-bearing and were each a bug once:

1. The tail **stops** at the first message that does not fit; it does not skip it and
   try older ones. Skipping would leave holes in the conversation.
2. The gap marker is reserved against `markerText(a.history.length)` — the widest count
   it could ever print — *before* the tail is refilled. A reserve computed from the
   first-pass count can be invalidated by the refill.
3. If that reserve does not fit in the remaining budget, the marker is **dropped** and
   the omission is reported through `meta.messagesOmitted` alone. Emitting it
   unconditionally once pushed a 62-token marker into an 11-token window.

The invariant the whole function exists to guarantee:
`countTokens(result.input) <= budgetTokens`, always. There is a sweep test over several
budgets asserting exactly that — if you change this file, run it.

## Two counts that are not the same number

- `meta.messagesSent` — the length of the produced `input` array. Includes the system
  prompt, the gap marker and the new user message. This is what `context.messagesSent`
  reports over the wire.
- `meta.historyMessagesSent` — `head.length + tail.length`. History only. This is what
  the `history_messages_sent` **column** stores.

They sit next to `messagesOmitted` (history only), so subtracting one from the other
gives a wrong answer. Keep the two names distinct and do not "simplify" them into one.
