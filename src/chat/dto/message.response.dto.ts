import { ApiProperty } from '@nestjs/swagger';

export class MessageDto {
  @ApiProperty({ example: '9ab2c1d0-1234-4abc-9def-0123456789ab' })
  id: string;

  @ApiProperty({ example: 'assistant', enum: ['user', 'assistant'] })
  role: 'user' | 'assistant';

  @ApiProperty({ example: 'Привіт! Чим можу допомогти?' })
  content: string;

  @ApiProperty({ example: '2026-08-31T12:00:05.120Z' })
  createdAt: Date;
}

export class UsageDto {
  @ApiProperty({ example: 'gpt-5-nano' })
  model: string;

  @ApiProperty({ example: 412 })
  inputTokens: number;

  @ApiProperty({ example: 0 })
  cachedInputTokens: number;

  @ApiProperty({ example: 178 })
  outputTokens: number;

  @ApiProperty({ example: 64 })
  reasoningTokens: number;
}

export class CostDto {
  @ApiProperty({ example: '0.0000206000' })
  inputCostUsd: string;

  @ApiProperty({ example: '0.0000712000' })
  outputCostUsd: string;

  @ApiProperty({ example: '0.0000918000' })
  totalCostUsd: string;

  @ApiProperty({ example: 'USD' })
  currency: string;
}

export class ContextDto {
  @ApiProperty({
    example: 11,
    description:
      'Length of the full array sent to the model: system prompt + head + gap marker (if any) + tail + new user message',
  })
  messagesSent: number;

  @ApiProperty({ example: 4 })
  messagesOmitted: number;

  @ApiProperty({ example: 405 })
  estimatedInputTokens: number;

  @ApiProperty({ example: 8000 })
  tokenBudget: number;
}

export class SessionSummaryDto {
  @ApiProperty({ example: '0.0004410000' })
  totalCostUsd: string;

  @ApiProperty({ example: 14 })
  messageCount: number;
}

/** Response body of `POST /sessions/{id}/messages`. */
export class MessageResponseDto {
  @ApiProperty({ example: '3f1c2b7a-1234-4abc-9def-0123456789ab' })
  sessionId: string;

  @ApiProperty({ type: MessageDto })
  message: MessageDto;

  @ApiProperty({ type: UsageDto })
  usage: UsageDto;

  @ApiProperty({ type: CostDto })
  cost: CostDto;

  @ApiProperty({ type: ContextDto })
  context: ContextDto;

  @ApiProperty({ type: SessionSummaryDto })
  session: SessionSummaryDto;
}
