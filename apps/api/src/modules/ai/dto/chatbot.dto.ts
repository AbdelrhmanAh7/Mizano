import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsString, IsNotEmpty } from 'class-validator';

export class ChatMessageDto {
  @ApiProperty({
    description: 'The user message to send to the chatbot',
    example: 'What is my total revenue this month?',
  })
  @IsString()
  @IsNotEmpty()
  message: string;
}

export class ChatResponseDto {
  @ApiProperty({
    description: 'The detected intent of the user message',
    example: 'revenue_query',
  })
  intent: string;

  @ApiProperty({
    description: 'Confidence score of the intent classification (0-1)',
    example: 0.92,
  })
  confidence: number;

  @ApiProperty({
    description: 'The chatbot response text',
    example: 'Your total revenue this month is $45,230.00.',
  })
  response: string;

  @ApiPropertyOptional({
    description: 'Additional data relevant to the response',
    example: { totalRevenue: 45230.0, currency: 'USD' },
  })
  data?: unknown;

  @ApiProperty({
    description: 'Suggested follow-up questions or actions',
    example: ['Show me revenue breakdown by customer', 'Compare with last month'],
    type: [String],
  })
  suggestions: string[];
}

export class ChatHistoryItemDto {
  @ApiProperty({
    description: 'The role of the message sender',
    enum: ['user', 'assistant'],
    example: 'user',
  })
  role: 'user' | 'assistant';

  @ApiProperty({
    description: 'The message content',
    example: 'What is my total revenue this month?',
  })
  message: string;

  @ApiProperty({
    description: 'When the message was sent',
    example: '2026-02-07T10:30:00.000Z',
  })
  timestamp: string;

  @ApiPropertyOptional({
    description: 'The detected intent (only for user messages)',
    example: 'revenue_query',
  })
  intent?: string;
}
