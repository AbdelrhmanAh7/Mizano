import { Controller, Get, Post, Delete, Body, Query, UseGuards, Sse } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiResponse, ApiQuery } from '@nestjs/swagger';
import { SkipThrottle } from '@nestjs/throttler';
import { Observable, Subject, map, finalize } from 'rxjs';
import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../../common/guards/permissions.guard';
import { CurrentOrg } from '../../../common/decorators/current-org.decorator';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import { Permissions } from '../../../common/decorators/permissions.decorator';
import { ChatbotService } from '../services/chatbot.service';
import { ChatMessageDto, ChatResponseDto, ChatHistoryItemDto } from '../dto/chatbot.dto';

interface MessageEvent {
  data: string | object;
  id?: string;
  type?: string;
  retry?: number;
}

@ApiTags('AI - Chatbot')
@ApiBearerAuth()
@SkipThrottle({ short: true, long: true })
@Controller('ai/chatbot')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class ChatbotController {
  constructor(private readonly chatbotService: ChatbotService) {}

  @Post('message')
  @Permissions('accounting.view')
  @ApiOperation({ summary: 'Send a message to the AI chatbot' })
  @ApiResponse({
    status: 200,
    description: 'Chatbot response with intent classification and suggestions',
    type: ChatResponseDto,
  })
  sendMessage(
    @CurrentOrg() orgId: string,
    @CurrentUser('id') userId: string,
    @Body() body: ChatMessageDto,
  ) {
    return this.chatbotService.processMessage(orgId, userId, body.message);
  }

  @Post('message/stream')
  @Permissions('accounting.view')
  @Sse()
  @ApiOperation({ summary: 'Send a message and stream the response via SSE' })
  streamMessage(
    @CurrentOrg() orgId: string,
    @CurrentUser('id') userId: string,
    @Body() body: ChatMessageDto,
  ): Observable<MessageEvent> {
    const subject = new Subject<MessageEvent>();

    // Fire async streaming pipeline
    void this.chatbotService
      .processMessageStream(orgId, userId, body.message, {
        onIntent: (intent, confidence) => {
          subject.next({
            data: { intent, confidence },
            type: 'intent',
          });
        },
        onToken: (token) => {
          subject.next({
            data: { token },
            type: 'token',
          });
        },
        onComplete: (response) => {
          subject.next({
            data: response,
            type: 'complete',
          });
          setTimeout(() => subject.complete(), 100);
        },
        onError: (error) => {
          subject.next({
            data: { error },
            type: 'error',
          });
          setTimeout(() => subject.complete(), 100);
        },
      })
      .catch((err) => {
        subject.next({
          data: { error: err instanceof Error ? err.message : String(err) },
          type: 'error',
        });
        subject.complete();
      });

    return subject.asObservable().pipe(
      map((event) => event),
      finalize(() => {
        // cleanup if needed
      }),
    );
  }

  @Get('history')
  @Permissions('accounting.view')
  @ApiOperation({ summary: 'Get chat history for the current user' })
  @ApiQuery({
    name: 'limit',
    required: false,
    type: Number,
    description: 'Maximum number of history items to return',
    example: 50,
  })
  @ApiResponse({
    status: 200,
    description: 'List of chat history items',
    type: [ChatHistoryItemDto],
  })
  getHistory(
    @CurrentOrg() orgId: string,
    @CurrentUser('id') userId: string,
    @Query('limit') limit?: number,
  ) {
    return this.chatbotService.getHistory(orgId, userId, limit || 50);
  }

  @Delete('history')
  @Permissions('accounting.view')
  @ApiOperation({ summary: 'Clear chat history for the current user' })
  @ApiResponse({
    status: 200,
    description: 'Chat history cleared successfully',
  })
  clearHistory(@CurrentOrg() orgId: string, @CurrentUser('id') userId: string) {
    return this.chatbotService.clearHistory(orgId, userId);
  }
}
