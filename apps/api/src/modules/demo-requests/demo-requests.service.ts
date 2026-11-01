import { BadRequestException, Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateDemoRequestDto } from './dto/create-demo-request.dto';

export type DemoRequestResult = { success: boolean; id?: string };

@Injectable()
export class DemoRequestsService {
  constructor(private readonly prisma: PrismaService) {}

  async create(dto: CreateDemoRequestDto): Promise<DemoRequestResult> {
    // Honeypot check: bot filled the website field
    if (dto.website && dto.website.trim().length > 0) {
      return { success: true };
    }

    const name = dto.name?.trim();
    const contact = dto.contact?.trim();
    if (!name || !contact) {
      throw new BadRequestException('name and contact are required');
    }

    const row = await this.prisma.demoRequest.create({
      data: {
        name,
        contact,
        role: dto.role || 'owner',
        businessType: dto.businessType?.trim() || '',
        country: dto.country?.trim() || 'EG',
        preferredTime: dto.preferredTime?.trim() || '',
        message: dto.message?.trim() || '',
        locale: dto.locale || 'ar',
        status: 'NEW',
      },
    });

    return { success: true, id: row.id };
  }
}
