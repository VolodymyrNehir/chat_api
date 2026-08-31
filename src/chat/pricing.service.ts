import { Injectable } from '@nestjs/common';
import { ModelPricing, PRICING } from '../config/pricing.config';
import { UnsupportedModelError } from '../common/errors';

export interface TokenUsage {
  inputTokens: number;
  cachedInputTokens: number;
  outputTokens: number;
  /** already included in outputTokens; stored for transparency only */
  reasoningTokens: number;
}

export interface CostBreakdown {
  inputCostUsd: string;
  outputCostUsd: string;
  totalCostUsd: string;
}

/** decimal places kept in the database column numeric(18,10) */
const SCALE = 10;

@Injectable()
export class PricingService {
  isSupported(model: string): boolean {
    return model in PRICING;
  }

  supportedModels(): string[] {
    return Object.keys(PRICING);
  }

  get(model: string): ModelPricing {
    const rate = PRICING[model];
    if (!rate) throw new UnsupportedModelError(model, this.supportedModels());
    return rate;
  }

  calculate(model: string, usage: TokenUsage): CostBreakdown {
    const rate = this.get(model);

    // cached tokens are part of inputTokens and are billed at a lower rate,
    // so they must be subtracted before applying the full input rate
    const billableInput = Math.max(
      0,
      usage.inputTokens - usage.cachedInputTokens,
    );

    const input =
      (billableInput / 1_000_000) * rate.inputPerMTok +
      (usage.cachedInputTokens / 1_000_000) * rate.cachedInputPerMTok;

    // reasoning tokens are already counted inside outputTokens — do not add them again
    const output = (usage.outputTokens / 1_000_000) * rate.outputPerMTok;

    return {
      inputCostUsd: input.toFixed(SCALE),
      outputCostUsd: output.toFixed(SCALE),
      totalCostUsd: (input + output).toFixed(SCALE),
    };
  }
}
