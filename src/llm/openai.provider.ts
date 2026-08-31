import { Injectable, Logger } from '@nestjs/common';
import OpenAI from 'openai';
import { LlmCompletion, LlmProvider, LlmRequest } from './llm.provider';
import { PricingService } from '../chat/pricing.service';
import {
  UpstreamError,
  UpstreamRateLimitedError,
  UpstreamTimeoutError,
} from '../common/errors';

/**
 * Shape of the Responses API result this adapter actually reads. The SDK's
 * own `Response`/`ResponseUsage` types are wider (and, for the usage detail
 * objects, stricter — they mark fields required that this adapter still
 * wants to default defensively), so a narrow local type is used as the one
 * place the SDK shape is converted into ours. A real `Response` is
 * structurally assignable to this type without a cast.
 */
interface OpenAiResponseResult {
  output_text: string;
  usage?: {
    input_tokens: number;
    output_tokens: number;
    input_tokens_details?: { cached_tokens?: number };
    output_tokens_details?: { reasoning_tokens?: number };
  };
}

/**
 * Shape of a provider error this adapter distinguishes on. `headers` is
 * typed as a Fetch `Headers`-like getter, not a plain record: the SDK sets
 * it to a real `Headers` instance, which does not support bracket/index
 * access — only `.get(name)`.
 */
interface ProviderError {
  status?: number;
  headers?: { get(name: string): string | null };
  message?: string;
}

@Injectable()
export class OpenAiProvider extends LlmProvider {
  private readonly logger = new Logger(OpenAiProvider.name);

  constructor(
    private readonly client: OpenAI,
    private readonly pricing: PricingService,
    private readonly reasoningEffort: string,
  ) {
    super();
  }

  async complete(req: LlmRequest): Promise<LlmCompletion> {
    const supportsReasoning = this.pricing.get(req.model).supportsReasoning;
    const startedAt = Date.now();

    const params: OpenAI.Responses.ResponseCreateParamsNonStreaming = {
      model: req.model,
      input: req.input.map((m) => ({ role: m.role, content: m.content })),
      // conversation state is ours, not OpenAI's
      store: false,
      ...(supportsReasoning
        ? {
            reasoning: {
              effort: this.reasoningEffort as OpenAI.ReasoningEffort,
            },
          }
        : {}),
    };

    try {
      const res: OpenAiResponseResult =
        await this.client.responses.create(params);

      const usage = res.usage;
      return {
        text: res.output_text ?? '',
        usage: {
          inputTokens: usage?.input_tokens ?? 0,
          cachedInputTokens: usage?.input_tokens_details?.cached_tokens ?? 0,
          outputTokens: usage?.output_tokens ?? 0,
          reasoningTokens: usage?.output_tokens_details?.reasoning_tokens ?? 0,
        },
        latencyMs: Date.now() - startedAt,
      };
    } catch (e) {
      // The SDK's own error classes never set `.name`/`.code`, so timeout
      // detection has to go through `instanceof` against the real class,
      // not a string comparison.
      if (e instanceof OpenAI.APIConnectionTimeoutError) {
        throw new UpstreamTimeoutError();
      }

      const err = e as ProviderError;
      if (err?.status === 429) {
        const retryAfter = Number(err.headers?.get('retry-after'));
        throw new UpstreamRateLimitedError(
          Number.isFinite(retryAfter) ? retryAfter : undefined,
        );
      }
      // The provider's raw message may contain key fragments, account
      // details or dashboard URLs (OpenAI's own error text does exactly
      // this). It is logged here, server-side only, and never crosses the
      // HTTP boundary — the client gets a fixed, generic sentence via
      // UpstreamError instead.
      this.logger.error(
        `OpenAI request failed: ${err?.message ?? 'unknown error'}`,
      );
      throw new UpstreamError(
        'The model provider could not complete the request',
      );
    }
  }
}
