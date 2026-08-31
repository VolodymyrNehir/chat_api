import { Injectable } from '@nestjs/common';
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

/** shape of a provider error this adapter distinguishes on */
interface ProviderError {
  status?: number;
  headers?: Record<string, string>;
  name?: string;
  code?: string;
  message?: string;
}

@Injectable()
export class OpenAiProvider extends LlmProvider {
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
      const err = e as ProviderError;
      if (err?.status === 429) {
        const retryAfter = Number(err.headers?.['retry-after']);
        throw new UpstreamRateLimitedError(
          Number.isFinite(retryAfter) ? retryAfter : undefined,
        );
      }
      if (
        err?.name === 'APIConnectionTimeoutError' ||
        err?.code === 'ETIMEDOUT'
      ) {
        throw new UpstreamTimeoutError();
      }
      throw new UpstreamError(
        `Model provider request failed: ${err?.message ?? 'unknown error'}`,
      );
    }
  }
}
