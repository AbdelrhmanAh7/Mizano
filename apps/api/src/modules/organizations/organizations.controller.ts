import {
  Controller,
  Get,
  Post,
  Patch,
  Body,
  UseGuards,
  UseInterceptors,
  UploadedFile,
  BadRequestException,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiConsumes, ApiBody } from '@nestjs/swagger';
import { OrganizationsService } from './organizations.service';
import { UpdateOrganizationDto } from './dto/update-organization.dto';
import { UpdateAccountSettingsDto } from './dto/update-account-settings.dto';
import {
  GeneralSettingsDto,
  FinancialSettingsDto,
  InvoiceSettingsDto,
  InventorySettingsDto,
  AiSettingsDto,
  EmailSettingsDto,
  LocalizationSettingsDto,
  BrandingSettingsDto,
} from './dto/organization-settings.dto';
import {
  CompanyInfoStepDto,
  ChartOfAccountsStepDto,
  TaxConfigStepDto,
  OpeningBalancesStepDto,
  ImportDataStepDto,
  AiFeaturesStepDto,
  SkipStepDto,
} from './dto/onboarding.dto';
import { CurrentOrg, Permissions } from '../../common/decorators';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../common/guards/permissions.guard';

@ApiTags('Organization')
@ApiBearerAuth()
@Controller('organization')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class OrganizationsController {
  constructor(private readonly organizationsService: OrganizationsService) {}

  // ============================================
  // BASIC ORGANIZATION
  // ============================================

  @Get()
  @Permissions('settings.view')
  @ApiOperation({ summary: 'Get current organization details' })
  findOne(@CurrentOrg() orgId: string) {
    return this.organizationsService.findOne(orgId);
  }

  @Patch()
  @Permissions('settings.edit')
  @ApiOperation({ summary: 'Update organization details' })
  update(@CurrentOrg() orgId: string, @Body() updateOrganizationDto: UpdateOrganizationDto) {
    return this.organizationsService.update(orgId, updateOrganizationDto);
  }

  @Patch('lock-date')
  @Permissions('settings.edit')
  @ApiOperation({ summary: 'Set transaction lock date' })
  setLockDate(@CurrentOrg() orgId: string, @Body('lockDate') lockDate: Date) {
    return this.organizationsService.setLockDate(orgId, lockDate);
  }

  // ============================================
  // ALL SETTINGS
  // ============================================

  @Get('settings')
  @Permissions('settings.view')
  @ApiOperation({ summary: 'Get all organization settings' })
  getAllSettings(@CurrentOrg() orgId: string) {
    return this.organizationsService.getAllSettings(orgId);
  }

  // ============================================
  // SETTINGS BY CATEGORY
  // ============================================

  @Patch('settings/general')
  @Permissions('settings.edit')
  @ApiOperation({ summary: 'Update general settings' })
  updateGeneralSettings(@CurrentOrg() orgId: string, @Body() dto: GeneralSettingsDto) {
    return this.organizationsService.updateGeneralSettings(orgId, dto);
  }

  @Patch('settings/financial')
  @Permissions('settings.edit')
  @ApiOperation({ summary: 'Update financial settings' })
  updateFinancialSettings(@CurrentOrg() orgId: string, @Body() dto: FinancialSettingsDto) {
    return this.organizationsService.updateFinancialSettings(orgId, dto);
  }

  @Patch('settings/invoice')
  @Permissions('settings.edit')
  @ApiOperation({ summary: 'Update invoice settings' })
  updateInvoiceSettings(@CurrentOrg() orgId: string, @Body() dto: InvoiceSettingsDto) {
    return this.organizationsService.updateInvoiceSettings(orgId, dto);
  }

  @Patch('settings/inventory')
  @Permissions('settings.edit')
  @ApiOperation({ summary: 'Update inventory settings' })
  updateInventorySettings(@CurrentOrg() orgId: string, @Body() dto: InventorySettingsDto) {
    return this.organizationsService.updateInventorySettings(orgId, dto);
  }

  @Patch('settings/ai')
  @Permissions('settings.edit')
  @ApiOperation({ summary: 'Update AI settings' })
  updateAiSettings(@CurrentOrg() orgId: string, @Body() dto: AiSettingsDto) {
    return this.organizationsService.updateAiSettings(orgId, dto);
  }

  @Patch('settings/email')
  @Permissions('settings.edit')
  @ApiOperation({ summary: 'Update email/SMTP settings' })
  updateEmailSettings(@CurrentOrg() orgId: string, @Body() dto: EmailSettingsDto) {
    return this.organizationsService.updateEmailSettings(orgId, dto);
  }

  @Patch('settings/localization')
  @Permissions('settings.edit')
  @ApiOperation({ summary: 'Update localization settings' })
  updateLocalizationSettings(@CurrentOrg() orgId: string, @Body() dto: LocalizationSettingsDto) {
    return this.organizationsService.updateLocalizationSettings(orgId, dto);
  }

  @Patch('settings/branding')
  @Permissions('settings.edit')
  @ApiOperation({ summary: 'Update branding settings' })
  updateBrandingSettings(@CurrentOrg() orgId: string, @Body() dto: BrandingSettingsDto) {
    return this.organizationsService.updateBrandingSettings(orgId, dto);
  }

  // ============================================
  // ACCOUNT SETTINGS
  // ============================================

  @Get('account-settings')
  @Permissions('settings.view')
  @ApiOperation({ summary: 'Get default account settings for accounting entries' })
  getAccountSettings(@CurrentOrg() orgId: string) {
    return this.organizationsService.getAccountSettings(orgId);
  }

  @Patch('account-settings')
  @Permissions('settings.edit')
  @ApiOperation({ summary: 'Update default account settings' })
  updateAccountSettings(
    @CurrentOrg() orgId: string,
    @Body() updateAccountSettingsDto: UpdateAccountSettingsDto,
  ) {
    return this.organizationsService.updateAccountSettings(orgId, updateAccountSettingsDto);
  }

  // ============================================
  // LOGO UPLOAD
  // ============================================

  @Post('logo')
  @Permissions('settings.edit')
  @UseInterceptors(FileInterceptor('logo'))
  @ApiOperation({ summary: 'Upload organization logo' })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        logo: {
          type: 'string',
          format: 'binary',
        },
      },
    },
  })
  async uploadLogo(@CurrentOrg() orgId: string, @UploadedFile() file: Express.Multer.File) {
    if (!file) {
      throw new BadRequestException('Logo file is required');
    }

    // Validate file type
    const allowedMimes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
    if (!allowedMimes.includes(file.mimetype)) {
      throw new BadRequestException('Invalid file type. Allowed: JPEG, PNG, GIF, WebP');
    }

    // Validate file size (max 2MB)
    const maxSize = 2 * 1024 * 1024;
    if (file.size > maxSize) {
      throw new BadRequestException('File too large. Maximum size: 2MB');
    }

    // In a real app, you would upload to cloud storage (S3, GCS, etc.)
    // For now, we'll store as base64 data URL
    const base64 = file.buffer.toString('base64');
    const logoUrl = `data:${file.mimetype};base64,${base64}`;

    return this.organizationsService.updateLogo(orgId, logoUrl);
  }

  // ============================================
  // ONBOARDING
  // ============================================

  @Get('onboarding')
  @Permissions('settings.view')
  @ApiOperation({ summary: 'Get onboarding status' })
  getOnboardingStatus(@CurrentOrg() orgId: string) {
    return this.organizationsService.getOnboardingStatus(orgId);
  }

  @Get('onboarding/coa-templates')
  @Permissions('settings.view')
  @ApiOperation({ summary: 'Get available Chart of Accounts templates' })
  getCoaTemplates() {
    return this.organizationsService.getCoaTemplates();
  }

  @Post('onboarding/company-info')
  @Permissions('settings.edit')
  @ApiOperation({ summary: 'Complete company info onboarding step' })
  completeCompanyInfoStep(@CurrentOrg() orgId: string, @Body() dto: CompanyInfoStepDto) {
    return this.organizationsService.completeCompanyInfoStep(orgId, dto);
  }

  @Post('onboarding/chart-of-accounts')
  @Permissions('settings.edit')
  @ApiOperation({ summary: 'Complete chart of accounts onboarding step' })
  completeChartOfAccountsStep(@CurrentOrg() orgId: string, @Body() dto: ChartOfAccountsStepDto) {
    return this.organizationsService.completeChartOfAccountsStep(orgId, dto);
  }

  @Post('onboarding/tax-config')
  @Permissions('settings.edit')
  @ApiOperation({ summary: 'Complete tax configuration onboarding step' })
  completeTaxConfigStep(@CurrentOrg() orgId: string, @Body() dto: TaxConfigStepDto) {
    return this.organizationsService.completeTaxConfigStep(orgId, dto);
  }

  @Post('onboarding/opening-balances')
  @Permissions('settings.edit')
  @ApiOperation({ summary: 'Complete opening balances onboarding step' })
  completeOpeningBalancesStep(@CurrentOrg() orgId: string, @Body() dto: OpeningBalancesStepDto) {
    return this.organizationsService.completeOpeningBalancesStep(orgId, dto);
  }

  @Post('onboarding/import-data')
  @Permissions('settings.edit')
  @ApiOperation({ summary: 'Complete import data onboarding step' })
  completeImportDataStep(@CurrentOrg() orgId: string, @Body() dto: ImportDataStepDto) {
    return this.organizationsService.completeImportDataStep(orgId, dto);
  }

  @Post('onboarding/ai-features')
  @Permissions('settings.edit')
  @ApiOperation({ summary: 'Complete AI features onboarding step' })
  completeAiFeaturesStep(@CurrentOrg() orgId: string, @Body() dto: AiFeaturesStepDto) {
    return this.organizationsService.completeAiFeaturesStep(orgId, dto);
  }

  @Post('onboarding/tour')
  @Permissions('settings.edit')
  @ApiOperation({ summary: 'Complete tour/final onboarding step' })
  completeTourStep(@CurrentOrg() orgId: string) {
    return this.organizationsService.completeTourStep(orgId);
  }

  @Post('onboarding/skip')
  @Permissions('settings.edit')
  @ApiOperation({ summary: 'Skip an onboarding step' })
  skipStep(@CurrentOrg() orgId: string, @Body() dto: SkipStepDto) {
    return this.organizationsService.skipStep(orgId, dto.step);
  }
}
