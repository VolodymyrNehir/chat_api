export interface ModelPricing {
  model: string;
  /** USD per 1M input tokens */
  inputPerMTok: number;
  /** USD per 1M cached input tokens */
  cachedInputPerMTok: number;
  /** USD per 1M output tokens */
  outputPerMTok: number;
  /** whether the model accepts a `reasoning` parameter */
  supportsReasoning: boolean;
}

/**
 * Snapshot of OpenAI public pricing taken on 2026-08-31.
 * Rates are not fetched at runtime; update this table deliberately.
 */
export const PRICING_SOURCE = 'openai-public-2026-08-31';

export const PRICING: Record<string, ModelPricing> = {
  'gpt-5': {
    model: 'gpt-5',
    inputPerMTok: 1.25,
    cachedInputPerMTok: 0.125,
    outputPerMTok: 10.0,
    supportsReasoning: true,
  },
  'gpt-5-mini': {
    model: 'gpt-5-mini',
    inputPerMTok: 0.25,
    cachedInputPerMTok: 0.025,
    outputPerMTok: 2.0,
    supportsReasoning: true,
  },
  'gpt-5-nano': {
    model: 'gpt-5-nano',
    inputPerMTok: 0.05,
    cachedInputPerMTok: 0.005,
    outputPerMTok: 0.4,
    supportsReasoning: true,
  },
  'gpt-4.1-mini': {
    model: 'gpt-4.1-mini',
    inputPerMTok: 0.4,
    cachedInputPerMTok: 0.1,
    outputPerMTok: 1.6,
    supportsReasoning: false,
  },
  'gpt-4o-mini': {
    model: 'gpt-4o-mini',
    inputPerMTok: 0.15,
    cachedInputPerMTok: 0.075,
    outputPerMTok: 0.6,
    supportsReasoning: false,
  },
};
