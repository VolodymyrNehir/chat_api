# AGENTS.md

Guidance for coding agents working in this repository. Written in English to match
the codebase convention: code, identifiers, comments and commit messages are English;
`README.md` is Ukrainian because it is written for the client.

Nested `AGENTS.md` files exist in `src/chat/`, `src/llm/` and `test/`. The nearest one
to the file you are editing wins.

## What this is

A REST chat API that wraps OpenAI and accounts for what it costs. Sessions hold a
message history; each new message is answered using a **token-budgeted window** of that
history, and every API call's token usage and dollar cost is stored and reported.

Built as step 3 of a staged technical assignment; step 4's change request (session reset
and per-message model selection) has since landed on top of it. `docs/superpowers/` holds
the design specs and implementation plans — all gitignored, all still on disk, and each
spec is the binding authority when code and README disagree about the change it covers.

## Stack, and why versions are pinned

| Piece | Choice | Why it is pinned |
|---|---|---|
| NestJS | 11.x, on `@nestjs/platform-express` | The assignment required "Node.js: Express.js"; Nest's Express platform satisfies it |
| `@nestjs/cli` | `^11` | `@latest` scaffolds an **ESM + Vitest** project. The whole test suite is CommonJS + Jest |
| `@nestjs/config` | `^4.0.4` | `@latest` is ESM-only and breaks `ts-jest`'s `require()` |
| `@nestjs/swagger` | `^11` | Same Nest 11 line |
| TypeORM | `^1.1.0` with `@nestjs/typeorm@^12` | Looks mismatched, is correct: `@nestjs/typeorm@12` declares peers `typeorm ^0.3.0 \|\| ^1.0.0-dev` and `@nestjs/core ^10 \|\| ^11 \|\| ^12` |

**Do not run a bare `npm install <nest-package>@latest`.** It will pull the Nest 12 line
and the suite will stop running. Install with an explicit `@^11`.

## Running things

```bash
cp .env.example .env      # then fill OPENAI_API_KEY and POSTGRES_PASSWORD
make up                   # builds the image, starts postgres, runs migrations, starts the API
make help                 # every target
```

`make test`, `make migration` and `npm run *` execute **on the host** and need local Node.
Only `make up` is self-contained.

Ports are configurable because collisions are common:

- `PORT` is what the app listens on **inside** the container.
- `HOST_PORT` (optional, defaults to `PORT`) is what compose publishes on the host.
- `POSTGRES_PORT` is the **host-side** port for the database; the container always listens
  on 5432 internally, which is why the `api` service overrides `POSTGRES_PORT: 5432`.

Getting that last one wrong makes the API container dial a port nothing listens on.

## Invariants — breaking any of these is a defect, not a style choice

**Money never becomes a JS number.** Costs are `numeric(18,10)` in Postgres, `string` on
the entities, `.toFixed(10)` strings out of `PricingService`, `SUM(...)::text` in SQL,
strings in JSON, strings in the UI. No `Number()`, `parseFloat`, `toFixed` or arithmetic
on a cost after it is computed.

**Cached input tokens are billed at the lower rate.** They arrive *inside*
`usage.input_tokens`, so they must be subtracted before the full input rate is applied.
Forgetting this systematically overcharges.

**Reasoning tokens are already inside `output_tokens`.** They are stored separately for
transparency and must never be added to the cost again.

**Conversation state is ours.** Every OpenAI call passes `store: false`. We never use
`previous_response_id` or the Conversations API — the history logic is the point of this
project, and it lives in our database.

**`synchronize: false` always.** The schema changes only through committed migrations.

**Nothing secret leaves the process.** Not into a tracked file, not into an image layer,
not into an HTTP response body. Provider error text is logged server-side and replaced
with a fixed generic sentence before it reaches a client — this leaked once already and
is now pinned by a regression test.

## Repository conventions

- **Commits are authored by the repository owner with no assistant or session trailers.**
  No `Co-Authored-By`, no generated-with footer. This is a hard requirement.
- Commit messages: plain English, imperative subject, a body explaining *why*.
- `npm run lint` must stay at **0 errors and 0 warnings**. `no-unsafe-member-access` and
  `no-unsafe-assignment` are errors in `src/**` — do not relax them to make code compile.
  Write a narrow local interface instead; there are three good examples already
  (`ProviderError`, `PgDriverError`, `OpenAiResponseResult`).
- Gitignored and intentionally so: `.env`, `*.docx` (client material), `docs/superpowers/`
  (design docs), `.superpowers/` and `graphify-out/` (tooling scratch).

## Layout

```
src/
  config/      env.validation.ts (Joi, fails the boot), pricing.config.ts (rate table)
  common/      errors.ts (domain errors), http-exception.filter.ts (the only client-facing
               error surface)
  llm/         the seam in front of OpenAI — see src/llm/AGENTS.md
  chat/        sessions, messages, cost — see src/chat/AGENTS.md
  migrations/  InitialSchema is released and referenced by a reported commit — from
               here on, schema changes are additive, stacked migrations, never a
               regenerated InitialSchema
public/        index.html — the chat UI, no build step
test/          see test/AGENTS.md
```

## Traps that already cost time

- `import { countTokens } from 'gpt-tokenizer'` **throws** on a message array. The root
  export handles plain strings only; a model-specific import is required.
- OpenAI SDK error classes never assign `this.name` — they all report `"Error"`. Detect
  them with `instanceof`, never by string.
- `APIError.headers` is a Fetch `Headers` instance. Index access returns `undefined`;
  use `.get()`. And `.get()` returns `null` when absent, so `Number(null) === 0` will
  silently produce `Retry-After: 0` if you do not guard it.
- A TypeORM entity that declares a foreign key as a plain `@Column({ type: 'uuid' })`
  generates **no constraint**. Relations need `@ManyToOne` + `@JoinColumn`.
- `model in PRICING` walks the prototype chain, so `'constructor'` reads as a supported
  model. Use `Object.hasOwn`.
