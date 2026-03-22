import { ApiProperty } from '@nestjs/swagger';
import { IsArray, IsNotEmpty, IsString } from 'class-validator';

export class OptimizeRouteDto {
  @ApiProperty({
    description: 'Array of delivery IDs to optimize routing for',
    type: [String],
    example: ['del_abc123', 'del_def456', 'del_ghi789'],
  })
  @IsArray()
  @IsNotEmpty()
  @IsString({ each: true })
  deliveryIds: string[];
}

export class RouteStopDto {
  @ApiProperty({ description: 'Delivery ID' })
  deliveryId: string;

  @ApiProperty({ description: 'Customer name' })
  customer: string;

  @ApiProperty({ description: 'Delivery address' })
  address: string;

  @ApiProperty({ description: 'Sequence order in the optimized route' })
  sequence: number;
}

export class OptimizedRouteDto {
  @ApiProperty({
    description: 'Stops in optimized order',
    type: [RouteStopDto],
  })
  optimizedOrder: RouteStopDto[];

  @ApiProperty({ description: 'Estimated savings from optimization (e.g., distance or time)' })
  estimatedSavings: number;

  @ApiProperty({ description: 'Total number of stops in the route' })
  totalStops: number;
}

export class DeliveryEstimateDto {
  @ApiProperty({ description: 'Delivery ID' })
  deliveryId: string;

  @ApiProperty({ description: 'Estimated number of days for delivery' })
  estimatedDays: number;

  @ApiProperty({ description: 'Model confidence in the estimate (0-1)' })
  confidence: number;

  @ApiProperty({ description: 'Whether the estimate is based on historical data' })
  basedOnHistory: boolean;
}

export class RegionDeliveryDto {
  @ApiProperty({ description: 'Region name' })
  region: string;

  @ApiProperty({ description: 'Number of deliveries in this region' })
  count: number;
}

export class RouteAnalyticsDto {
  @ApiProperty({ description: 'Total number of deliveries analyzed' })
  totalDeliveries: number;

  @ApiProperty({
    description: 'Deliveries broken down by region',
    type: [RegionDeliveryDto],
  })
  byRegion: RegionDeliveryDto[];

  @ApiProperty({ description: 'On-time delivery rate as a percentage (0-100)' })
  onTimeRate: number;
}
