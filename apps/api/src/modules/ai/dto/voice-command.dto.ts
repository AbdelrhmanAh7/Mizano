import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsString, IsNotEmpty } from 'class-validator';

export class VoiceInputDto {
  @ApiProperty({
    description: 'The transcribed voice command text',
    example: 'Create an invoice for customer Acme Corp for 5000 dollars',
  })
  @IsString()
  @IsNotEmpty()
  text: string;
}

export class ParsedCommandDto {
  @ApiProperty({
    description: 'The parsed action type',
    enum: ['CREATE', 'READ', 'UPDATE', 'DELETE'],
    example: 'CREATE',
  })
  action: 'CREATE' | 'READ' | 'UPDATE' | 'DELETE';

  @ApiProperty({
    description: 'The type of entity the command targets',
    example: 'invoice',
  })
  entityType: string;

  @ApiProperty({
    description: 'Extracted parameters from the voice command',
    example: { customer: 'Acme Corp', amount: 5000, currency: 'USD' },
  })
  parameters: Record<string, unknown>;

  @ApiProperty({
    description: 'Confidence score of the command parsing (0-1)',
    example: 0.88,
  })
  confidence: number;

  @ApiProperty({
    description: 'The original voice input text',
    example: 'Create an invoice for customer Acme Corp for 5000 dollars',
  })
  originalText: string;
}

export class CommandExecutionDto {
  @ApiProperty({
    description: 'Whether the command was executed successfully',
    example: true,
  })
  success: boolean;

  @ApiProperty({
    description: 'The action that was executed',
    example: 'CREATE',
  })
  action: string;

  @ApiPropertyOptional({
    description: 'Result data from the command execution',
    example: { invoiceId: 'clx123abc', invoiceNumber: 'INV-001' },
  })
  data?: unknown;

  @ApiProperty({
    description: 'Human-readable message about the execution result',
    example: 'Invoice INV-001 created successfully for Acme Corp.',
  })
  message: string;

  @ApiPropertyOptional({
    description: 'Whether the command requires user confirmation before proceeding',
    example: false,
  })
  requiresConfirmation?: boolean;
}

export class AvailableCommandDto {
  @ApiProperty({
    description: 'The voice command pattern',
    example: 'Create [entity] for [target]',
  })
  pattern: string;

  @ApiProperty({
    description: 'The action this command performs',
    example: 'CREATE',
  })
  action: string;

  @ApiProperty({
    description: 'The type of entity this command operates on',
    example: 'invoice',
  })
  entityType: string;

  @ApiProperty({
    description: 'Example usage of the command',
    example: 'Create an invoice for Acme Corp for 5000 dollars',
  })
  example: string;
}
