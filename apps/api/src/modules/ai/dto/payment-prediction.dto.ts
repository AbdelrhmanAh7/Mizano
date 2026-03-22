import { ApiProperty } from '@nestjs/swagger';

export class PaymentPredictionResponse {
  @ApiProperty({ description: 'Invoice ID' })
  invoiceId: string;

  @ApiProperty({ description: 'Invoice number' })
  invoiceNumber: string;

  @ApiProperty({ description: 'Customer ID' })
  customerId: string;

  @ApiProperty({ description: 'Customer name' })
  customerName: string;

  @ApiProperty({ description: 'Invoice amount' })
  amount: number;

  @ApiProperty({ description: 'Invoice due date' })
  dueDate: Date;

  @ApiProperty({ description: 'Predicted payment date' })
  predictedDate: Date;

  @ApiProperty({ description: 'Days from now until predicted payment' })
  daysFromNow: number;

  @ApiProperty({ enum: ['high', 'medium', 'low'], description: 'Prediction confidence' })
  confidence: 'high' | 'medium' | 'low';

  @ApiProperty({
    enum: ['statistical', 'payment_terms'],
    description: 'Prediction method used',
  })
  method: 'statistical' | 'payment_terms';

  @ApiProperty({
    description: 'Adjustment factors applied',
    type: 'object',
    properties: {
      historical: { type: 'number' },
      amount: { type: 'number' },
      dayOfWeek: { type: 'number' },
      monthEnd: { type: 'number' },
    },
  })
  factors: {
    historical: number;
    amount: number;
    dayOfWeek: number;
    monthEnd: number;
  };
}

export class CustomerPaymentProfileResponse {
  @ApiProperty({ description: 'Customer ID' })
  customerId: string;

  @ApiProperty({ description: 'Customer name' })
  customerName: string;

  @ApiProperty({ description: 'Average days to payment from invoice date' })
  avgDaysToPayment: number;

  @ApiProperty({ description: 'Standard deviation of days to payment' })
  stdDevDaysToPayment: number;

  @ApiProperty({ description: 'Number of paid invoices in history' })
  paymentCount: number;

  @ApiProperty({ description: 'Percentage of invoices paid on time' })
  onTimeRate: number;

  @ApiProperty({
    enum: ['improving', 'stable', 'worsening'],
    description: 'Payment behavior trend',
  })
  trend: 'improving' | 'stable' | 'worsening';

  @ApiProperty({ description: 'When this profile was last updated' })
  lastUpdated: Date;
}

export class CollectionPriorityResponse {
  @ApiProperty({ description: 'Invoice ID' })
  invoiceId: string;

  @ApiProperty({ description: 'Invoice number' })
  invoiceNumber: string;

  @ApiProperty({ description: 'Customer ID' })
  customerId: string;

  @ApiProperty({ description: 'Customer name' })
  customerName: string;

  @ApiProperty({ description: 'Invoice amount' })
  amount: number;

  @ApiProperty({ description: 'Invoice due date' })
  dueDate: Date;

  @ApiProperty({ description: 'Predicted payment date' })
  predictedPaymentDate: Date;

  @ApiProperty({ description: 'Days past due (0 if not overdue)' })
  daysOverdue: number;

  @ApiProperty({ description: 'Priority score (higher = more urgent)' })
  priorityScore: number;

  @ApiProperty({ enum: ['low', 'medium', 'high'], description: 'Risk level' })
  riskLevel: 'low' | 'medium' | 'high';

  @ApiProperty({ description: 'Recommended collection action' })
  recommendedAction: string;
}

export class PaymentHistoryDetailResponse {
  @ApiProperty({
    description: 'Payment history records',
    type: 'array',
    items: {
      type: 'object',
      properties: {
        invoiceId: { type: 'string' },
        invoiceDate: { type: 'string', format: 'date' },
        dueDate: { type: 'string', format: 'date' },
        paidDate: { type: 'string', format: 'date' },
        amount: { type: 'number' },
        daysToPayment: { type: 'number' },
        daysAfterDue: { type: 'number' },
      },
    },
  })
  history: Array<{
    invoiceId: string;
    invoiceDate: Date;
    dueDate: Date;
    paidDate: Date;
    amount: number;
    daysToPayment: number;
    daysAfterDue: number;
  }>;

  @ApiProperty({ description: 'Average days to payment' })
  avgDaysToPayment: number;

  @ApiProperty({ description: 'Standard deviation' })
  stdDevDaysToPayment: number;

  @ApiProperty({ description: 'On-time payment rate (%)' })
  onTimeRate: number;

  @ApiProperty({ description: 'Payment trend' })
  trend: string;
}
