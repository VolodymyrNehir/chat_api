import { IsString, Matches, MinLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class SendMessageDto {
  @ApiProperty({ example: 'Привіт! Що ти вмієш?' })
  @IsString()
  @MinLength(1)
  // rejects whitespace-only content (spaces, tabs, newlines), which would
  // otherwise pass @MinLength(1) and become a stored message and a billed
  // model call
  @Matches(/\S/, { message: 'content must not be blank' })
  content: string;
}
