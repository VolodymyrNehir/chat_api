import { envValidationSchema } from '../src/config/env.validation';

const valid = {
  PORT: '3000',
  NODE_ENV: 'development',
  POSTGRES_USER: 'chat',
  POSTGRES_PASSWORD: 'secret',
  POSTGRES_DB: 'chat_api',
  POSTGRES_HOST: 'localhost',
  POSTGRES_PORT: '5432',
  OPENAI_API_KEY: 'sk-test',
  OPENAI_TIMEOUT_MS: '60000',
  OPENAI_MAX_RETRIES: '2',
  DEFAULT_MODEL: 'gpt-5-nano',
  DEFAULT_SYSTEM_PROMPT: 'You are a helpful assistant.',
  REASONING_EFFORT: 'low',
  HISTORY_TOKEN_BUDGET: '8000',
  HISTORY_PINNED_HEAD_MESSAGES: '2',
  HISTORY_HEAD_MAX_SHARE: '0.25',
  HISTORY_GAP_MARKER: 'true',
  MAX_MESSAGE_CHARS: '16000',
};

describe('envValidationSchema', () => {
  it('accepts a complete configuration', () => {
    const { error } = envValidationSchema.validate(valid);
    expect(error).toBeUndefined();
  });

  it('rejects a missing OPENAI_API_KEY', () => {
    const { OPENAI_API_KEY, ...withoutKey } = valid;
    const { error } = envValidationSchema.validate(withoutKey);
    expect(error?.message).toContain('OPENAI_API_KEY');
  });

  it('rejects a DEFAULT_MODEL outside the pricing table', () => {
    const { error } = envValidationSchema.validate({
      ...valid,
      DEFAULT_MODEL: 'gpt-4.5-imaginary',
    });
    expect(error?.message).toContain('DEFAULT_MODEL');
  });

  it('rejects a head share outside [0, 1)', () => {
    const { error } = envValidationSchema.validate({
      ...valid,
      HISTORY_HEAD_MAX_SHARE: '1',
    });
    expect(error?.message).toContain('HISTORY_HEAD_MAX_SHARE');
  });

  it('coerces numeric strings to numbers', () => {
    // Joi's ObjectSchema.validate() types `.value` as `any`; assert the one
    // field this test reads so no `@typescript-eslint/no-unsafe-*` rule is
    // needed just for this file.
    const { value } = envValidationSchema.validate(valid) as {
      value: { HISTORY_TOKEN_BUDGET: number };
    };
    expect(value.HISTORY_TOKEN_BUDGET).toBe(8000);
  });
});
