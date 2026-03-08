import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiConsumes, ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  CacheResponse,
  CacheTTL,
  CurrentOrg,
  InvalidateCache,
  Permissions,
} from '../../../common/decorators';
import { PaginationDto } from '../../../common/dto/pagination.dto';
import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../../common/guards/permissions.guard';
import { CacheInvalidationInterceptor } from '../../../common/interceptors/cache-invalidation.interceptor';
import { BankTransactionCursorQueryDto } from '../dto/bank-transaction-cursor-query.dto';
import { BankStatementImportService } from '../services/bank-statement-import.service';
import {
  BankTransactionsService,
  CreateBankTransactionDto,
  BulkImportTransactionDto,
} from '../services/bank-transactions.service';

@ApiTags('Bank Transactions')
@ApiBearerAuth()
@Controller('bank-transactions')
@UseGuards(JwtAuthGuard, PermissionsGuard)
@UseInterceptors(CacheInvalidationInterceptor)
export class BankTransactionsController {
  constructor(
    private readonly bankTransactionsService: BankTransactionsService,
    private readonly bankStatementImportService: BankStatementImportService,
  ) {}

  @Post()
  @Permissions('banking.create')
  @InvalidateCache('bank-transactions:*', 'bank-accounts:*')
  @ApiOperation({ summary: 'Create/Import bank transaction' })
  create(@CurrentOrg() orgId: string, @Body() dto: CreateBankTransactionDto) {
    return this.bankTransactionsService.create(orgId, dto);
  }

  @Post('import')
  @Permissions('banking.create')
  @InvalidateCache('bank-transactions:*', 'bank-accounts:*')
  @ApiOperation({ summary: 'Bulk import transactions' })
  bulkImport(
    @CurrentOrg() orgId: string,
    @Body() dto: { bankAccountId: string; transactions: BulkImportTransactionDto[] },
  ) {
    return this.bankTransactionsService.bulkImport(orgId, dto.bankAccountId, dto.transactions);
  }

  @Post('import-statement')
  @Permissions('banking.create')
  @InvalidateCache('bank-transactions:*', 'bank-accounts:*')
  @UseInterceptors(FileInterceptor('file'))
  @ApiConsumes('multipart/form-data')
  @ApiOperation({
    summary: 'Import bank statement file (CSV/XLSX/OFX/QFX) with auto-detection and deduplication',
  })
  async importStatement(
    @CurrentOrg() orgId: string,
    @UploadedFile() file: Express.Multer.File,
    @Body('bankAccountId') bankAccountId: string,
  ) {
    if (!file) {
      throw new BadRequestException('File is required');
    }
    if (!bankAccountId) {
      throw new BadRequestException('Bank account ID is required');
    }

    const extension = file.originalname?.toLowerCase().split('.').pop();
    const allowedExtensions = ['csv', 'xlsx', 'xls', 'ofx', 'qfx'];
    if (!allowedExtensions.includes(extension || '')) {
      throw new BadRequestException('Only CSV, Excel, and OFX/QFX files are allowed');
    }

    return this.bankStatementImportService.importStatement(
      orgId,
      bankAccountId,
      file.buffer,
      file.originalname,
    );
  }

  @Get()
  @Permissions('banking.view')
  @CacheResponse('bank-transactions:list')
  @CacheTTL(120)
  findAll(
    @CurrentOrg() orgId: string,
    @Query() query: PaginationDto & { bankAccountId?: string; status?: string },
  ) {
    return this.bankTransactionsService.findAll(orgId, query);
  }

  @Get('cursor')
  @Permissions('banking.view')
  @ApiOperation({ summary: 'List bank transactions with cursor-based pagination' })
  findAllCursor(@CurrentOrg() orgId: string, @Query() query: BankTransactionCursorQueryDto) {
    return this.bankTransactionsService.findAllCursor(orgId, query);
  }

  @Get(':id')
  @Permissions('banking.view')
  findOne(@CurrentOrg() orgId: string, @Param('id') id: string) {
    return this.bankTransactionsService.findOne(orgId, id);
  }
}
