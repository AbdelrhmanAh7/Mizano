import {
  ArrayMaxSize,
  ArrayUnique,
  Equals,
  IsArray,
  IsBoolean,
  IsIn,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
} from 'class-validator';
import { AI_PROVIDERS, AiProviderId } from '../../providers/ai-provider';
import { AI_FEATURES, AiFeatureKey } from '../ai-features';

/** Model ids as providers spell them ("claude-haiku-4-5", "google/gemini-2.5-flash", "qwen3:8b"). */
const MODEL_ID = /^[A-Za-z0-9][A-Za-z0-9._:/@-]{0,127}$/;

export class ConnectAiDto {
  @IsIn(AI_PROVIDERS)
  provider!: AiProviderId;

  /** Required for every provider except Ollama. Never stored in plaintext or returned. */
  @IsOptional()
  @IsString()
  @MaxLength(400)
  @Matches(/^\S+$/, { message: 'apiKey must not contain spaces' })
  apiKey?: string;

  @IsOptional()
  @IsString()
  @Matches(MODEL_ID)
  model?: string;
}

export class UpdateAiSettingsDto {
  @IsOptional()
  @IsString()
  @Matches(MODEL_ID)
  model?: string;

  /** USD per calendar month (UTC), decimal string, 0 to 9999.99. */
  @IsOptional()
  @IsString()
  @Matches(/^\d{1,4}(\.\d{1,2})?$/, { message: 'monthlyLimitUsd must be a decimal string' })
  monthlyLimitUsd?: string;

  @IsOptional()
  @IsArray()
  @ArrayUnique()
  @ArrayMaxSize(AI_FEATURES.length)
  @IsIn(AI_FEATURES, { each: true })
  features?: AiFeatureKey[];
}

export class AiConsentDto {
  /** The provider the admin read the consent text for; must be the connected one. */
  @IsIn(AI_PROVIDERS)
  provider!: AiProviderId;

  @IsBoolean()
  @Equals(true)
  accepted!: boolean;
}

export class OpenRouterStartDto {
  /** The settings page to come back to; its origin must be one of CORS_ORIGIN. */
  @IsString()
  @MaxLength(500)
  callbackUrl!: string;
}

export class OpenRouterCompleteDto {
  @IsString()
  @Matches(/^[A-Za-z0-9_-]{43}$/)
  state!: string;

  @IsString()
  @MaxLength(512)
  @Matches(/^[A-Za-z0-9._~-]+$/)
  code!: string;
}

export class ChooseAiModelDto {
  @IsString()
  @Matches(MODEL_ID)
  model!: string;
}
