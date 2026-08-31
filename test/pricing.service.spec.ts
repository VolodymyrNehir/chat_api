import { PricingService } from '../src/chat/pricing.service';
import { UnsupportedModelError } from '../src/common/errors';
import { PRICING, PRICING_SOURCE } from '../src/config/pricing.config';

const svc = new PricingService();
const usage = (
  o: Partial<Parameters<PricingService['calculate']>[1]> = {},
) => ({
  inputTokens: 0,
  cachedInputTokens: 0,
  outputTokens: 0,
  reasoningTokens: 0,
  ...o,
});

describe('PricingService', () => {
  it('prices gpt-5-nano from input and output tokens', () => {
    // 1000/1e6*0.05 = 0.00005 ; 500/1e6*0.40 = 0.0002
    expect(
      svc.calculate(
        'gpt-5-nano',
        usage({ inputTokens: 1000, outputTokens: 500 }),
      ),
    ).toEqual({
      inputCostUsd: '0.0000500000',
      outputCostUsd: '0.0002000000',
      totalCostUsd: '0.0002500000',
    });
  });

  it('prices gpt-5 from input and output tokens', () => {
    // 1000/1e6*1.25 = 0.00125 ; 500/1e6*10 = 0.005
    expect(
      svc.calculate('gpt-5', usage({ inputTokens: 1000, outputTokens: 500 })),
    ).toEqual({
      inputCostUsd: '0.0012500000',
      outputCostUsd: '0.0050000000',
      totalCostUsd: '0.0062500000',
    });
  });

  it('prices gpt-5-mini from input and output tokens', () => {
    // 1000/1e6*0.25 = 0.00025 ; 500/1e6*2.00 = 0.001
    expect(
      svc.calculate(
        'gpt-5-mini',
        usage({ inputTokens: 1000, outputTokens: 500 }),
      ),
    ).toEqual({
      inputCostUsd: '0.0002500000',
      outputCostUsd: '0.0010000000',
      totalCostUsd: '0.0012500000',
    });
  });

  it('prices gpt-4.1-mini from input and output tokens', () => {
    // 1000/1e6*0.40 = 0.0004 ; 500/1e6*1.60 = 0.0008
    expect(
      svc.calculate(
        'gpt-4.1-mini',
        usage({ inputTokens: 1000, outputTokens: 500 }),
      ),
    ).toEqual({
      inputCostUsd: '0.0004000000',
      outputCostUsd: '0.0008000000',
      totalCostUsd: '0.0012000000',
    });
  });

  it('prices gpt-4o-mini from input and output tokens', () => {
    // 1000/1e6*0.15 = 0.00015 ; 500/1e6*0.60 = 0.0003
    expect(
      svc.calculate(
        'gpt-4o-mini',
        usage({ inputTokens: 1000, outputTokens: 500 }),
      ),
    ).toEqual({
      inputCostUsd: '0.0001500000',
      outputCostUsd: '0.0003000000',
      totalCostUsd: '0.0004500000',
    });
  });

  it('charges cached tokens at the discounted rate and never twice', () => {
    // billable 600/1e6*0.05 = 0.00003 ; cached 400/1e6*0.005 = 0.000002
    expect(
      svc.calculate(
        'gpt-5-nano',
        usage({ inputTokens: 1000, cachedInputTokens: 400 }),
      ).inputCostUsd,
    ).toBe('0.0000320000');
  });

  it('does not add reasoning tokens on top of output tokens', () => {
    const without = svc.calculate('gpt-5-nano', usage({ outputTokens: 500 }));
    const with_ = svc.calculate(
      'gpt-5-nano',
      usage({ outputTokens: 500, reasoningTokens: 300 }),
    );
    expect(with_).toEqual(without);
  });

  it('clamps billable input when cached exceeds total input', () => {
    // billable 0/1e6*0.05 = 0 ; cached 400/1e6*0.005 = 0.000002
    const r = svc.calculate(
      'gpt-5-nano',
      usage({ inputTokens: 100, cachedInputTokens: 400 }),
    );
    expect(r.inputCostUsd).toBe('0.0000020000');
  });

  it('returns zero cost for zero usage', () => {
    expect(svc.calculate('gpt-5-nano', usage()).totalCostUsd).toBe(
      '0.0000000000',
    );
  });

  it('prices every model in the table', () => {
    for (const model of svc.supportedModels()) {
      expect(() =>
        svc.calculate(model, usage({ inputTokens: 10, outputTokens: 10 })),
      ).not.toThrow();
    }
  });

  it('throws UnsupportedModelError for an unknown model', () => {
    expect(() => svc.calculate('gpt-4.5-imaginary', usage())).toThrow(
      UnsupportedModelError,
    );
    try {
      svc.calculate('gpt-4.5-imaginary', usage());
    } catch (e) {
      expect((e as UnsupportedModelError).supported).toContain('gpt-5-nano');
    }
  });

  it('rejects prototype-chain names like constructor', () => {
    expect(svc.isSupported('constructor')).toBe(false);
    expect(() => svc.calculate('constructor', usage())).toThrow(
      UnsupportedModelError,
    );
  });

  it('is pinned to the 2026-08-31 OpenAI public pricing snapshot', () => {
    expect(PRICING_SOURCE).toBe('openai-public-2026-08-31');
  });

  it('has all five pricing fields for every model in the table', () => {
    for (const [key, entry] of Object.entries(PRICING)) {
      expect(entry.model).toBe(key);
      expect(typeof entry.inputPerMTok).toBe('number');
      expect(typeof entry.cachedInputPerMTok).toBe('number');
      expect(typeof entry.outputPerMTok).toBe('number');
      expect(typeof entry.supportsReasoning).toBe('boolean');
    }
  });
});
