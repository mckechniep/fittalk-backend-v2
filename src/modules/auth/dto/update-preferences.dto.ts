import { IsString, IsBoolean, IsEnum, IsOptional } from 'class-validator';
import { UnitSystem } from '@prisma/client';

export class UpdatePreferencesDto {
  @IsOptional()
  @IsString()
  timezone?: string;

  @IsOptional()
  @IsEnum(UnitSystem)
  unitSystem?: UnitSystem;

  @IsOptional()
  @IsBoolean()
  voiceEnabled?: boolean;

  @IsOptional()
  @IsString()
  ttsVoice?: string;

  @IsOptional()
  @IsString()
  language?: string;

  @IsOptional()
  @IsBoolean()
  notifPush?: boolean;

  @IsOptional()
  @IsBoolean()
  notifEmail?: boolean;

  @IsOptional()
  @IsBoolean()
  notifSms?: boolean;
}