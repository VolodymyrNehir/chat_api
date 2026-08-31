import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
} from '@nestjs/common';
import {
  ApiCreatedResponse,
  ApiOkResponse,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { ChatService } from './chat.service';
import { CreateSessionDto } from './dto/create-session.dto';
import { SendMessageDto } from './dto/send-message.dto';
import {
  SessionDetailResponseDto,
  SessionResponseDto,
} from './dto/session.response.dto';
import { MessageResponseDto } from './dto/message.response.dto';

@ApiTags('chat')
@Controller('sessions')
export class ChatController {
  constructor(private readonly chat: ChatService) {}

  @Post()
  @ApiCreatedResponse({
    description: 'Session created',
    type: SessionResponseDto,
  })
  @ApiResponse({ status: 400, description: 'Unsupported model' })
  createSession(@Body() dto: CreateSessionDto) {
    return this.chat.createSession(dto);
  }

  @Post(':id/messages')
  @HttpCode(HttpStatus.OK)
  @ApiOkResponse({
    description: 'Model replied; usage, cost and context window are returned',
    type: MessageResponseDto,
  })
  @ApiResponse({ status: 404, description: 'Session not found' })
  @ApiResponse({ status: 400, description: 'Unsupported model' })
  @ApiResponse({
    status: 422,
    description: 'The new message alone does not fit the context budget',
  })
  @ApiResponse({
    status: 429,
    description: 'The model provider rate limited the request',
  })
  sendMessage(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: SendMessageDto,
  ) {
    return this.chat.sendMessage(id, dto.content, dto.model);
  }

  @Post(':id/reset')
  @HttpCode(HttpStatus.OK)
  @ApiOkResponse({
    description:
      'Context cleared. The session id is unchanged, the active history and totals are empty, and lifetime totals still report what the session has cost.',
    type: SessionDetailResponseDto,
  })
  @ApiResponse({ status: 404, description: 'Session not found' })
  resetSession(@Param('id', ParseUUIDPipe) id: string) {
    return this.chat.resetSession(id);
  }

  @Get(':id')
  @ApiOkResponse({
    description:
      "Session with the active generation's message history and totals, plus lifetime totals across all generations.",
    type: SessionDetailResponseDto,
  })
  @ApiResponse({ status: 404, description: 'Session not found' })
  getSession(@Param('id', ParseUUIDPipe) id: string) {
    return this.chat.getSession(id);
  }
}
