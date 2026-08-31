import {
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class SendMessageDto {
  @ApiProperty({ example: 'Привіт! Що ти вмієш?' })
  @IsString()
  @MinLength(1)
  // rejects whitespace-only content (spaces, tabs, newlines), which would
  // otherwise pass @MinLength(1) and become a stored message and a billed
  // model call
  @Matches(/\S/, { message: 'content must not be blank' })
  content: string;

  @ApiPropertyOptional({
    example: 'gpt-5-mini',
    description:
      'Overrides the session default for this message only. Must be present in the pricing table.',
  })
  @IsOptional()
  @IsString()
  @MaxLength(64)
  @Matches(/\S/, { message: 'model must not be blank' })
  model?: string;
}
