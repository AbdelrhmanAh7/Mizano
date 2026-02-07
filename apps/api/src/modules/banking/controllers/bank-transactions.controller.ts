import { Controller, Get, Post, Body, Param, Query, UseGuards, UseInterceptors, UploadedFile, BadRequestException } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiConsumes } from '@nestjs/swagger';
import { BankTransactionsService } from '../services/bank-transactions.service';
import { BankStatementImportService } from '../services/bank-statement-import.service';
import { CurrentOrg, Permissions } from '../../../common/decorators';
import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../../common/guards/permissions.guard';
import { PaginationDto } from '../../../common/dto/pagination.dto';

@ApiTags('Bank Transactions')
@ApiBearerAuth()
@Controller('bank-transactions')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class BankTransactionsController {
  constructor(
    private readonly bankTransactionsService: BankTransactionsService,
    private readonly bankStatementImportService: BankStatementImportService,
  ) {}

  @Post() @Permissions('banking.create')
  @ApiOperation({ summary: 'Create/Import bank transaction' })
  create(@CurrentOrg() orgId: string, @Body() dto: any) { return this.bankTransactionsService.create(orgId, dto); }

  @Post('import') @Permissions('banking.create')
  @ApiOperation({ summary: 'Bulk import transactions' })
  bulkImport(@CurrentOrg() orgId: string, @Body() dto: { bankAccountId: string; transactions: any[] }) {
    return this.bankTransactionsService.bulkImport(orgId, dto.bankAccountId, dto.transactions);
  }

  @Post('import-statement')
  @Permissions('banking.create')
  @UseInterceptors(FileInterceptor('file'))
  @ApiConsumes('multipart/form-data')
  @ApiOperation({ summary: 'Import bank statement file (CSV/XLSX/OFX/QFX) with auto-detection and deduplication' })
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

  @Get() @Permissions('banking.view')
  findAll(@CurrentOrg() orgId: string, @Query() query: PaginationDto & { bankAccountId?: string; status?: string }) {
    return this.bankTransactionsService.findAll(orgId, query);
  }

  @Get(':id') @Permissions('banking.view')
  findOne(@CurrentOrg() orgId: string, @Param('id') id: string) { return this.bankTransactionsService.findOne(orgId, id); }
}
