import { resolveModel } from '../src/chat/model-resolver';
import { PricingService } from '../src/chat/pricing.service';
import { UnsupportedModelError } from '../src/common/errors';

// PricingService is pure — no I/O, no clock — so the real one is a better
// catalogue here than a fake that could drift from the actual rate table
const catalogue = new PricingService();

describe('resolveModel', () => {
  it('falls back to the session default when no model is requested', () => {
    expect(resolveModel(undefined, 'gpt-5-nano', catalogue)).toBe('gpt-5-nano');
  });

  it('lets an explicit request override the session default', () => {
    expect(resolveModel('gpt-5-mini', 'gpt-5-nano', catalogue)).toBe(
      'gpt-5-mini',
    );
  });

  it('throws for an unsupported requested model, naming what is supported', () => {
    expect(() =>
      resolveModel('gpt-9-imaginary', 'gpt-5-nano', catalogue),
    ).toThrow(UnsupportedModelError);
    try {
      resolveModel('gpt-9-imaginary', 'gpt-5-nano', catalogue);
      throw new Error('expected resolveModel to throw');
    } catch (e) {
      expect(e).toBeInstanceOf(UnsupportedModelError);
      expect((e as UnsupportedModelError).supported).toContain('gpt-5-nano');
    }
  });

  it('throws when the session default itself is unsupported', () => {
    // guards a session row written while a model was still in the table
    expect(() => resolveModel(undefined, 'gpt-9-imaginary', catalogue)).toThrow(
      UnsupportedModelError,
    );
  });

  it('does not accept prototype property names as models', () => {
    for (const name of [
      'constructor',
      'toString',
      'hasOwnProperty',
      '__proto__',
    ]) {
      expect(() => resolveModel(name, 'gpt-5-nano', catalogue)).toThrow(
        UnsupportedModelError,
      );
    }
  });
});
