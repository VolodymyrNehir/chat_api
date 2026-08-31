import { IsOptional, IsString, Length, MaxLength } from 'class-validator';
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
  model?: string;
}
