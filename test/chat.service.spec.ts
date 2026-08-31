import { ConfigService } from '@nestjs/config';

// chat.repository.ts declares its constructor params with `@InjectDataSource()`
// / `@InjectRepository()`. Those decorators only ever run at class-definition
// time to shape metadata Nest's DI container would read — this spec never
// touches that container or a real database. `@nestjs/typeorm@12` ships
// ESM-only, which Jest's CommonJS runtime cannot `require()`; a virtual no-op
// mock sidesteps that entirely so `chat.service.ts` — and the real
// `ChatRepository` class it imports for its constructor's type — can still be
// loaded and constructed directly, exactly as the rest of this file does.
jest.mock(
  '@nestjs/typeorm',
  () => ({
    InjectDataSource: () => () => undefined,
    InjectRepository: () => () => undefined,
  }),
  { virtual: true },
);

import { ChatService } from '../src/chat/chat.service';
import { ChatRepository, SessionTotals } from '../src/chat/chat.repository';
import { PricingService, TokenUsage } from '../src/chat/pricing.service';
import { TokenCounterService } from '../src/llm/token-counter';
import { LlmProvider } from '../src/llm/llm.provider';
import { Session } from '../src/chat/entities/session.entity';
import { Message } from '../src/chat/entities/message.entity';
import { Interaction } from '../src/chat/entities/interaction.entity';

/**
 * `sendMessage` substitutes the resolved model for `session.model` at three
 * call sites: the request handed to `llm.complete`, the `interaction` row
 * passed to `repo.recordExchange`, and the `usage.model` echoed in the
 * response. `resolveModel` itself is pure and pinned by
 * `model-resolver.spec.ts`, but a missed substitution — say
 * `pricing.calculate(session.model, ...)` instead of `pricing.calculate(model,
 * ...)` — would still leave `usage.model` correct and every other test green;
 * only the stored cost would be wrong, at a rate nobody notices until the
 * bill arrives. This spec pins all three sites at once.
 *
 * `ChatRepository` and `LlmProvider` are faked — no database, no network.
 * `PricingService` and `TokenCounterService` are real: they are pure, and
 * using the real pricing table is what lets the cost assertion below track
 * the rate table instead of a hand-copied literal.
 */

type FindSessionFn = ChatRepository['findSession'];
type FindActiveHistoryFn = ChatRepository['findActiveHistory'];
type RecordExchangeFn = ChatRepository['recordExchange'];
type FindActiveTotalsFn = ChatRepository['findActiveTotals'];
type CompleteFn = LlmProvider['complete'];

/**
 * `@types/jest`'s `jest.fn` takes the return type and the argument tuple
 * separately (`jest.fn<T, Y>()`), not the single function-type parameter
 * `jest-mock` itself now uses — so each fake below is built from a real
 * method's `ReturnType`/`Parameters` rather than its full function type.
 * That keeps every fake's shape derived from the real method signature: if
 * `ChatRepository` or `LlmProvider` changes shape, this file fails to
 * compile instead of silently drifting.
 */
function fakeFn<Fn extends (...args: never[]) => unknown>() {
  return jest.fn<ReturnType<Fn>, Parameters<Fn>>();
}

const CONFIG_VALUES: Record<string, string | number | boolean> = {
  MAX_MESSAGE_CHARS: 8000,
  HISTORY_TOKEN_BUDGET: 8000,
  HISTORY_PINNED_HEAD_MESSAGES: 4,
  HISTORY_HEAD_MAX_SHARE: 0.25,
  HISTORY_GAP_MARKER: true,
};

function makeConfig(): ConfigService {
  const get = jest.fn((key: string) => CONFIG_VALUES[key]);
  return { get } as unknown as ConfigService;
}

function makeSession(): Session {
  return {
    id: 'session-1',
    title: null,
    systemPrompt: 'You are a helpful assistant.',
    model: 'gpt-5-nano',
    generation: 1,
    createdAt: new Date('2026-08-31T12:00:00.000Z'),
    updatedAt: new Date('2026-08-31T12:00:00.000Z'),
  };
}

const totals: SessionTotals = {
  messageCount: 2,
  interactionCount: 1,
  inputTokens: 500,
  cachedInputTokens: 50,
  outputTokens: 200,
  reasoningTokens: 40,
  totalCostUsd: '0.0000000000',
};

function setup() {
  const findSession = fakeFn<FindSessionFn>();
  const findActiveHistory = fakeFn<FindActiveHistoryFn>();
  const recordExchange = fakeFn<RecordExchangeFn>();
  const findActiveTotals = fakeFn<FindActiveTotalsFn>();
  const repo = {
    findSession,
    findActiveHistory,
    recordExchange,
    findActiveTotals,
  } as unknown as ChatRepository;

  const complete = fakeFn<CompleteFn>();
  const llm = { complete } as unknown as LlmProvider;

  const pricing = new PricingService();
  const tokens = new TokenCounterService();
  const config = makeConfig();

  const service = new ChatService(repo, pricing, llm, tokens, config);

  return {
    service,
    pricing,
    mocks: {
      findSession,
      findActiveHistory,
      recordExchange,
      findActiveTotals,
      complete,
    },
  };
}

/** Wires the fakes for one `sendMessage` call and returns the usage they answer with. */
function primeExchange(
  mocks: ReturnType<typeof setup>['mocks'],
  session: Session,
  usage: TokenUsage,
  respondingModel: string,
) {
  mocks.findSession.mockResolvedValue(session);
  mocks.findActiveHistory.mockResolvedValue([]);
  mocks.complete.mockResolvedValue({
    text: `I am ${respondingModel}.`,
    usage,
    latencyMs: 42,
  });
  const assistantMessage = {
    id: 'assistant-message-1',
    role: 'assistant' as const,
    content: `I am ${respondingModel}.`,
    createdAt: new Date('2026-08-31T12:00:05.000Z'),
  } as unknown as Message;
  // TypeORM's `manager.save(Entity, partial)` narrows the return type down to
  // the literal shape of `partial` intersected with the entity (e.g.
  // `role: "user"` rather than `MessageRole`), which the plain `Message`/
  // `Interaction` casts above don't match field-for-field. Only `id`, `role`,
  // `content` and `createdAt` of `assistantMessage` are ever read by
  // `sendMessage`, so the exact shape of this resolved value otherwise
  // doesn't matter — one cast at the boundary says so.
  mocks.recordExchange.mockResolvedValue({
    userMessage: {} as unknown as Message,
    assistantMessage,
    interaction: {} as unknown as Interaction,
  } as unknown as Awaited<ReturnType<RecordExchangeFn>>);
  mocks.findActiveTotals.mockResolvedValue(totals);
}

describe('ChatService.sendMessage — model substitution', () => {
  it('uses the per-message model override at every site, and never touches the session default', async () => {
    const { service, pricing, mocks } = setup();
    const session = makeSession(); // default: gpt-5-nano
    const usage: TokenUsage = {
      inputTokens: 500,
      cachedInputTokens: 50,
      outputTokens: 200,
      reasoningTokens: 40,
    };
    primeExchange(mocks, session, usage, 'gpt-5-mini');

    const result = await service.sendMessage(
      session.id,
      'Which model are you?',
      'gpt-5-mini',
    );

    // computed from the real pricing table, not copied as a literal, so this
    // assertion tracks the rate table rather than a snapshot of it
    const expectedCost = pricing.calculate('gpt-5-mini', usage);

    expect(mocks.complete).toHaveBeenCalledTimes(1);
    expect(mocks.complete.mock.calls[0][0].model).toBe('gpt-5-mini');

    expect(mocks.recordExchange).toHaveBeenCalledTimes(1);
    const recorded = mocks.recordExchange.mock.calls[0][0];
    expect(recorded.interaction.model).toBe('gpt-5-mini');
    expect(recorded.interaction.inputCostUsd).toBe(expectedCost.inputCostUsd);
    expect(recorded.interaction.outputCostUsd).toBe(expectedCost.outputCostUsd);
    expect(recorded.interaction.totalCostUsd).toBe(expectedCost.totalCostUsd);

    expect(result.usage.model).toBe('gpt-5-mini');

    // the override is per-message only — sessions.model is read, never written
    expect(session.model).toBe('gpt-5-nano');
  });

  it('falls back to the session default when the message omits model', async () => {
    const { service, pricing, mocks } = setup();
    const session = makeSession(); // default: gpt-5-nano
    const usage: TokenUsage = {
      inputTokens: 300,
      cachedInputTokens: 0,
      outputTokens: 100,
      reasoningTokens: 10,
    };
    primeExchange(mocks, session, usage, 'gpt-5-nano');

    const result = await service.sendMessage(session.id, 'Hello there.');

    const expectedCost = pricing.calculate('gpt-5-nano', usage);

    expect(mocks.complete.mock.calls[0][0].model).toBe('gpt-5-nano');

    const recorded = mocks.recordExchange.mock.calls[0][0];
    expect(recorded.interaction.model).toBe('gpt-5-nano');
    expect(recorded.interaction.totalCostUsd).toBe(expectedCost.totalCostUsd);

    expect(result.usage.model).toBe('gpt-5-nano');
    expect(session.model).toBe('gpt-5-nano');
  });
});
