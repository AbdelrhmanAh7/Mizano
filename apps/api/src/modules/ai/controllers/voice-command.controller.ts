import {
  Controller,
  Get,
  Post,
  Body,
  UseGuards,
} from '@nestjs/common';
import {
  ApiTags,
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../../common/guards/permissions.guard';
import { CurrentOrg } from '../../../common/decorators/current-org.decorator';
import { Permissions } from '../../../common/decorators/permissions.decorator';
import { VoiceCommandService } from '../services/voice-command.service';
import {
  VoiceInputDto,
  ParsedCommandDto,
  CommandExecutionDto,
  AvailableCommandDto,
} from '../dto/voice-command.dto';

@ApiTags('AI - Voice Commands')
@ApiBearerAuth()
@Controller('ai/voice')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class VoiceCommandController {
  constructor(private readonly voiceCommandService: VoiceCommandService) {}

  @Post('parse')
  @Permissions('accounting.view')
  @ApiOperation({ summary: 'Parse a voice command into a structured action' })
  @ApiResponse({
    status: 200,
    description: 'Parsed command with action, entity, and parameters',
    type: ParsedCommandDto,
  })
  parseCommand(@Body() body: VoiceInputDto) {
    return this.voiceCommandService.parseCommand(body.text);
  }

  @Post('execute')
  @Permissions('accounting.manage')
  @ApiOperation({
    summary: 'Parse and execute a voice command',
    description:
      'Parses the voice input into a structured command and then executes it. ' +
      'Some commands may require user confirmation before proceeding.',
  })
  @ApiResponse({
    status: 200,
    description: 'Command execution result',
    type: CommandExecutionDto,
  })
  async executeCommand(
    @CurrentOrg() orgId: string,
    @Body() body: VoiceInputDto,
  ) {
    const parsed = await this.voiceCommandService.parseCommand(body.text);
    return this.voiceCommandService.executeCommand(orgId, parsed);
  }

  @Get('commands')
  @Permissions('accounting.view')
  @ApiOperation({ summary: 'Get list of available voice commands' })
  @ApiResponse({
    status: 200,
    description: 'List of supported voice command patterns',
    type: [AvailableCommandDto],
  })
  getAvailableCommands() {
    return this.voiceCommandService.getAvailableCommands();
  }
}
