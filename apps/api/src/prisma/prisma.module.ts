import { Global, Module } from '@nestjs/common';
import { PrismaService } from './prisma.service';
import { ReadReplicaService } from './read-replica.service';

@Global()
@Module({
  providers: [PrismaService, ReadReplicaService],
  exports: [PrismaService, ReadReplicaService],
})
export class PrismaModule {}
