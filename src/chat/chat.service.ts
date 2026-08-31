import { BadRequestException, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ChatRepository, RecordExchangeInput } from './chat.repository';
import { PricingService } from './pricing.service';
import { buildContext } from './history.builder';
import { LlmProvider } from '../llm/llm.provider';
import { TokenCounterService } from '../llm/token-counter';
import { PRICING_SOURCE } from '../config/pricing.config';
import { resolveModel } from './model-resolver';

/** matches the `numeric(18,10)` scale used for every cost column */
const ZERO_COST_USD = '0.0000000000';

@Injectable()
export class ChatService {
  constructor(
    private readonly repo: ChatRepository,
    private readonly pricing: PricingService,
    private readonly llm: LlmProvider,
    private readonly tokens: TokenCounterService,
    private readonly config: ConfigService,
  ) {}

  async createSession(dto: {
    title?: string;
    systemPrompt?: string;
    model?: string;
  }) {
    const model = resolveModel(
      dto.model,
      this.config.get<string>('DEFAULT_MODEL')!,
      this.pricing,
    );

    const session = await this.repo.createSession({
      title: dto.title,
      systemPrompt:
        dto.systemPrompt ?? this.config.get<string>('DEFAULT_SYSTEM_PROMPT')!,
      model,
    });

    return {
      id: session.id,
      title: session.title,
      model: session.model,
      generation: session.generation,
      systemPrompt: session.systemPrompt,
      createdAt: session.createdAt,
      messageCount: 0,
      totalCostUsd: ZERO_COST_USD,
    };
  }

  async sendMessage(
    sessionId: string,
    content: string,
    requestedModel?: string,
  ) {
    const maxChars = this.config.get<number>('MAX_MESSAGE_CHARS')!;
    if (content.length > maxChars) {
      throw new BadRequestException(`content exceeds ${maxChars} characters`);
    }

    const session = await this.repo.findSession(sessionId);
    const model = resolveModel(requestedModel, session.model, this.pricing);

    // Read the generation once, before the model call. If a reset lands while
    // the call is in flight, this exchange is written into the generation the
    // question was asked in — the fresh context stays clean, which is the
    // failure mode worth having.
    const generation = session.generation;

    const history = await this.repo.findActiveHistory(sessionId, generation);

    const budgetTokens = this.config.get<number>('HISTORY_TOKEN_BUDGET')!;

    const built = buildContext(
      {
        systemPrompt: session.systemPrompt,
        history: history.map((m) => ({
          role: m.role,
          content: m.content,
          tokenCount: m.tokenCount,
        })),
        newUserContent: content,
        budgetTokens,
        pinnedHeadMessages: this.config.get<number>(
          'HISTORY_PINNED_HEAD_MESSAGES',
        )!,
        headMaxShare: this.config.get<number>('HISTORY_HEAD_MAX_SHARE')!,
        gapMarker: this.config.get<boolean>('HISTORY_GAP_MARKER')!,
      },
      (msgs) => this.tokens.count(msgs),
    );

    // the network call happens outside any transaction: a failed call must
    // not leave a user message or interaction row behind
    const completion = await this.llm.complete({
      model,
      input: built.input,
    });
    const cost = this.pricing.calculate(model, completion.usage);

    const interaction: RecordExchangeInput['interaction'] = {
      model,
      inputTokens: completion.usage.inputTokens,
      cachedInputTokens: completion.usage.cachedInputTokens,
      outputTokens: completion.usage.outputTokens,
      reasoningTokens: completion.usage.reasoningTokens,
      inputCostUsd: cost.inputCostUsd,
      outputCostUsd: cost.outputCostUsd,
      totalCostUsd: cost.totalCostUsd,
      pricingSource: PRICING_SOURCE,
      historyMessagesSent: built.meta.historyMessagesSent,
      historyMessagesOmitted: built.meta.messagesOmitted,
      estimatedInputTokens: built.meta.estimatedInputTokens,
      latencyMs: completion.latencyMs,
    };

    const { assistantMessage } = await this.repo.recordExchange({
      sessionId,
      generation,
      userContent: content,
      userTokenCount: this.tokens.count([{ role: 'user', content }]),
      assistantContent: completion.text,
      assistantTokenCount: this.tokens.count([
        { role: 'assistant', content: completion.text },
      ]),
      interaction,
    });

    const totals = await this.repo.findActiveTotals(sessionId, generation);

    return {
      sessionId,
      message: {
        id: assistantMessage.id,
        role: assistantMessage.role,
        content: assistantMessage.content,
        createdAt: assistantMessage.createdAt,
      },
      usage: { model, ...completion.usage },
      cost: { ...cost, currency: 'USD' },
      context: {
        messagesSent: built.meta.messagesSent,
        messagesOmitted: built.meta.messagesOmitted,
        estimatedInputTokens: built.meta.estimatedInputTokens,
        tokenBudget: budgetTokens,
      },
      session: {
        totalCostUsd: totals.totalCostUsd,
        messageCount: totals.messageCount,
      },
    };
  }

  async getSession(sessionId: string) {
    const session = await this.repo.findSession(sessionId);
    const [messages, totals, lifetime] = await Promise.all([
      this.repo.findActiveHistory(sessionId, session.generation),
      this.repo.findActiveTotals(sessionId, session.generation),
      this.repo.findLifetimeTotals(sessionId),
    ]);

    return {
      id: session.id,
      title: session.title,
      model: session.model,
      generation: session.generation,
      systemPrompt: session.systemPrompt,
      createdAt: session.createdAt,
      updatedAt: session.updatedAt,
      messages: messages.map((m) => ({
        id: m.id,
        role: m.role,
        content: m.content,
        tokenCount: m.tokenCount,
        createdAt: m.createdAt,
      })),
      totals,
      lifetime,
    };
  }

  /**
   * Starts a fresh context on the same session id. The previous generation is
   * archived, not deleted: `totals` restarts at zero while `lifetime` still
   * reports what the session has cost in total.
   */
  async resetSession(sessionId: string) {
    // repo.resetSession already throws SessionNotFoundError when the row is
    // absent — a preceding findSession would only repeat that check
    await this.repo.resetSession(sessionId);
    return this.getSession(sessionId);
  }
}
