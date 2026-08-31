import { ApiProperty } from '@nestjs/swagger';

/** Response body of `POST /sessions`. */
export class SessionResponseDto {
  @ApiProperty({ example: '3f1c2b7a-1234-4abc-9def-0123456789ab' })
  id: string;

  @ApiProperty({ example: 'Демо сесія', nullable: true, type: String })
  title: string | null;

  @ApiProperty({ example: 'gpt-5-nano' })
  model: string;

  @ApiProperty({ example: 'You are a helpful assistant.' })
  systemPrompt: string;

  @ApiProperty({ example: '2026-08-31T12:00:00.000Z' })
  createdAt: Date;

  @ApiProperty({ example: 0 })
  messageCount: number;

  @ApiProperty({ example: '0.0000000000' })
  totalCostUsd: string;
}

export class SessionTotalsDto {
  @ApiProperty({ example: 14 })
  messageCount: number;

  @ApiProperty({ example: 7 })
  interactionCount: number;

  @ApiProperty({ example: 2840 })
  inputTokens: number;

  @ApiProperty({ example: 0 })
  cachedInputTokens: number;

  @ApiProperty({ example: 1204 })
  outputTokens: number;

  @ApiProperty({ example: 380 })
  reasoningTokens: number;

  @ApiProperty({ example: '0.0004410000' })
  totalCostUsd: string;
}

export class SessionMessageDto {
  @ApiProperty({ example: '9ab2c1d0-1234-4abc-9def-0123456789ab' })
  id: string;

  @ApiProperty({ example: 'user', enum: ['user', 'assistant'] })
  role: 'user' | 'assistant';

  @ApiProperty({ example: 'Привіт! Що ти вмієш?' })
  content: string;

  @ApiProperty({ example: 12 })
  tokenCount: number;

  @ApiProperty({ example: '2026-08-31T12:00:00.000Z' })
  createdAt: Date;
}

/** Response body of `GET /sessions/{id}`. */
export class SessionDetailResponseDto {
  @ApiProperty({ example: '3f1c2b7a-1234-4abc-9def-0123456789ab' })
  id: string;

  @ApiProperty({ example: 'Демо сесія', nullable: true, type: String })
  title: string | null;

  @ApiProperty({ example: 'gpt-5-nano' })
  model: string;

  @ApiProperty({
    example: 2,
    description:
      'Current context generation. Resets performed = generation - 1.',
  })
  generation: number;

  @ApiProperty({ example: 'You are a helpful assistant.' })
  systemPrompt: string;

  @ApiProperty({ example: '2026-08-31T12:00:00.000Z' })
  createdAt: Date;

  @ApiProperty({ example: '2026-08-31T12:05:00.000Z' })
  updatedAt: Date;

  @ApiProperty({ type: [SessionMessageDto] })
  messages: SessionMessageDto[];

  @ApiProperty({ type: SessionTotalsDto })
  totals: SessionTotalsDto;

  @ApiProperty({
    type: SessionTotalsDto,
    description:
      'Totals across every generation, including those archived by reset',
  })
  lifetime: SessionTotalsDto;
}
