import {
  IsOptional,
  IsString,
  Length,
  Matches,
  MaxLength,
} from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class CreateSessionDto {
  @ApiPropertyOptional({ example: 'Демо сесія' })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  title?: string;

  @ApiPropertyOptional({ example: 'You are a helpful assistant.' })
  @IsOptional()
  @IsString()
  @Length(1, 8000)
  systemPrompt?: string;

  @ApiPropertyOptional({
    example: 'gpt-5-nano',
    description: 'Must be present in the pricing table',
  })
  @IsOptional()
  @IsString()
  @MaxLength(64)
  // rejects whitespace-only model (spaces, tabs, newlines), which would
  // otherwise pass and only fail later as UNSUPPORTED_MODEL rather than
  // VALIDATION_FAILED — see send-message.dto.ts's `model` for the same guard
  @Matches(/\S/, { message: 'model must not be blank' })
  model?: string;
}
