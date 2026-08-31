import * as Joi from 'joi';

export const envValidationSchema = Joi.object({
  PORT: Joi.number().port().default(3000),
  NODE_ENV: Joi.string()
    .valid('development', 'test', 'production')
    .default('development'),

  POSTGRES_USER: Joi.string().required(),
  POSTGRES_PASSWORD: Joi.string().required(),
  POSTGRES_DB: Joi.string().required(),
  POSTGRES_HOST: Joi.string().required(),
  POSTGRES_PORT: Joi.number().port().default(5432),

  OPENAI_API_KEY: Joi.string().required(),
  OPENAI_TIMEOUT_MS: Joi.number().integer().min(1000).default(60000),
  OPENAI_MAX_RETRIES: Joi.number().integer().min(0).max(5).default(2),

  DEFAULT_MODEL: Joi.string().required(),
  DEFAULT_SYSTEM_PROMPT: Joi.string().required(),
  REASONING_EFFORT: Joi.string()
    .valid('minimal', 'low', 'medium', 'high')
    .default('low'),

  HISTORY_TOKEN_BUDGET: Joi.number().integer().min(256).default(8000),
  HISTORY_PINNED_HEAD_MESSAGES: Joi.number().integer().min(0).default(2),
  HISTORY_HEAD_MAX_SHARE: Joi.number().min(0).less(1).default(0.25),
  HISTORY_GAP_MARKER: Joi.boolean().default(true),

  MAX_MESSAGE_CHARS: Joi.number().integer().min(1).default(16000),
});
