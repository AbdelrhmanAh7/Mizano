import { IsString, IsEnum, IsOptional, IsObject, IsNotEmpty } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { AiFeature, AiFeedbackAction } from '@prisma/client';

export class SubmitFeedbackDto {
  @ApiProperty({
    enum: [
      'CATEGORIZATION',
      'RECONCILIATION',

      'DEMAND_FORECAST',
      'LEAD_SCORING',
      'ANOMALY',
      'REORDER',
      'PAYMENT_PREDICTION',
    ],
    description: 'The AI feature this feedback is for',
  })
  @IsEnum(AiFeature)
  @IsNotEmpty()
  feature: AiFeature;

  @ApiPropertyOptional({ description: 'ID of the prediction being reviewed' })
  @IsString()
  @IsOptional()
  predictionId?: string;

  @ApiProperty({
    description: 'The AI suggestion that was shown to the user',
    example: { label: 'Office Supplies', confidence: 0.85 },
  })
  @IsObject()
  @IsNotEmpty()
  aiSuggestion: Record<string, unknown>;

  @ApiProperty({
    enum: ['ACCEPTED', 'REJECTED', 'CORRECTED'],
    description: 'The action the user took',
  })
  @IsEnum(AiFeedbackAction)
  @IsNotEmpty()
  userAction: AiFeedbackAction;

  @ApiPropertyOptional({
    description: 'The correct answer if user corrected the suggestion',
    example: 'Travel Expenses',
  })
  @IsString()
  @IsOptional()
  userAnswer?: string;

  @ApiProperty({
    description: 'The input data that was used to generate the prediction',
    example: { description: 'Office supplies purchase', amount: 150.0 },
  })
  @IsObject()
  @IsNotEmpty()
  inputData: Record<string, unknown>;
}
