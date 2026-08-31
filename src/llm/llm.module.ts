import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import OpenAI from 'openai';
import { LlmProvider } from './llm.provider';
import { OpenAiProvider } from './openai.provider';
import { TokenCounterService } from './token-counter';
import { PricingService } from '../chat/pricing.service';

@Module({
  providers: [
    PricingService,
    TokenCounterService,
    {
      provide: LlmProvider,
      inject: [ConfigService, PricingService],
      useFactory: (c: ConfigService, pricing: PricingService) =>
        new OpenAiProvider(
          new OpenAI({
            apiKey: c.get<string>('OPENAI_API_KEY'),
            timeout: c.get<number>('OPENAI_TIMEOUT_MS'),
            maxRetries: c.get<number>('OPENAI_MAX_RETRIES'),
          }),
          pricing,
          c.get<string>('REASONING_EFFORT') ?? 'low',
        ),
    },
  ],
  exports: [LlmProvider, TokenCounterService, PricingService],
})
export class LlmModule {}
