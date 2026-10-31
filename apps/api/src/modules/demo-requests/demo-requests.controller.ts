import { Controller, Post, Body, HttpCode, HttpStatus } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { Public } from '../../common/decorators';
import { DemoRequestsService } from './demo-requests.service';
import { CreateDemoRequestDto } from './dto/create-demo-request.dto';

@ApiTags('Demo Requests')
@Controller('demo-requests')
@Throttle({ short: { ttl: 60000, limit: 5 } })
export class DemoRequestsController {
  constructor(private readonly service: DemoRequestsService) {}

  @Public()
  @Post()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Submit a demo request (public)' })
  async create(@Body() dto: CreateDemoRequestDto) {
    return this.service.create(dto);
  }
}
