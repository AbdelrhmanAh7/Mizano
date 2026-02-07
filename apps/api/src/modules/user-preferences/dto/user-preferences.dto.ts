import { ApiProperty } from '@nestjs/swagger';

export class UserPreferencesDto {
  @ApiProperty()
  id: string;

  @ApiProperty()
  userId: string;

  @ApiProperty({
    example: {
      sales_invoices: { completed: true, step: 5, completedAt: '2024-01-15T10:30:00Z' },
    },
    description: 'Tour progress tracking as JSON',
  })
  tourProgress?: Record<string, any>;

  @ApiProperty({
    example: ['feature_x_tour', 'feature_y_tour'],
    description: 'Array of dismissed tour IDs',
  })
  tourDismissed: string[];

  @ApiProperty({
    example: '2024-01-15T10:30:00Z',
    description: 'Last time a tour was seen',
  })
  lastTourSeenAt?: Date;

  @ApiProperty({ example: 'light' })
  theme?: string;

  @ApiProperty({ example: false })
  sidebarCollapsed: boolean;

  @ApiProperty()
  createdAt: Date;

  @ApiProperty()
  updatedAt: Date;
}
