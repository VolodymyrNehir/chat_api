import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
} from '@nestjs/common';
import { ChatService } from './chat.service';
import { CreateSessionDto } from './dto/create-session.dto';
import { SendMessageDto } from './dto/send-message.dto';

@Controller('sessions')
export class ChatController {
  constructor(private readonly chat: ChatService) {}

  @Post()
  createSession(@Body() dto: CreateSessionDto) {
    return this.chat.createSession(dto);
  }

  @Post(':id/messages')
  sendMessage(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: SendMessageDto,
  ) {
    return this.chat.sendMessage(id, dto.content);
  }

  @Get(':id')
  getSession(@Param('id', ParseUUIDPipe) id: string) {
    return this.chat.getSession(id);
  }
}
