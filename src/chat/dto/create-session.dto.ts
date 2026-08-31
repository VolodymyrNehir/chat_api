import { IsOptional, IsString, Length, MaxLength } from 'class-validator';

export class CreateSessionDto {
  @IsOptional()
  @IsString()
  @MaxLength(200)
  title?: string;

  @IsOptional()
  @IsString()
  @Length(1, 8000)
  systemPrompt?: string;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  model?: string;
}
