import { Test, TestingModule } from '@nestjs/testing';
import { DemoRequestsController } from './demo-requests.controller';
import { DemoRequestsService } from './demo-requests.service';
import { PrismaService } from '../../prisma/prisma.service';

describe('DemoRequestsController', () => {
  let controller: DemoRequestsController;
  let prisma: { demoRequest: { create: jest.Mock } };

  beforeEach(async () => {
    prisma = {
      demoRequest: {
        create: jest.fn().mockImplementation(async ({ data }) => ({
          id: 'test-demo-1',
          ...data,
          createdAt: new Date(),
        })),
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [DemoRequestsController],
      providers: [DemoRequestsService, { provide: PrismaService, useValue: prisma }],
    }).compile();

    controller = module.get<DemoRequestsController>(DemoRequestsController);
  });

  it('stores a valid demo request and returns success', async () => {
    const res = await controller.create({
      name: 'أحمد محمود',
      contact: '+201001234567',
      role: 'accountant',
      businessType: 'مكتب محاسبة',
      country: 'EG',
      preferredTime: 'غدًا ظهرًا',
      message: 'أريد تجربة استخراج الفواتير',
      locale: 'ar',
    });

    expect(res).toEqual({ success: true, id: 'test-demo-1' });
    expect(prisma.demoRequest.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        name: 'أحمد محمود',
        contact: '+201001234567',
        role: 'accountant',
        businessType: 'مكتب محاسبة',
        status: 'NEW',
      }),
    });
  });

  it('ignores honeypot submissions and stores nothing', async () => {
    const res = await controller.create({
      name: 'Bot Spammer',
      contact: 'spam@bot.test',
      website: 'https://spam.test',
    });

    expect(res).toEqual({ success: true });
    expect(prisma.demoRequest.create).not.toHaveBeenCalled();
  });

  it('rejects whitespace-only name or contact with BadRequestException', async () => {
    await expect(
      controller.create({
        name: '   ',
        contact: '+201001234567',
      }),
    ).rejects.toThrow('name and contact are required');

    await expect(
      controller.create({
        name: 'محمد',
        contact: '   ',
      }),
    ).rejects.toThrow('name and contact are required');
  });
});
