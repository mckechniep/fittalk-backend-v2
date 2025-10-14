import { IsString, IsOptional, IsEnum } from 'class-validator';

enum Platform {
  IOS = 'ios',
  ANDROID = 'android',
  WEB = 'web',
}

export class RegisterDeviceDto {
  @IsEnum(Platform)
  platform: Platform;

  @IsString()
  deviceId: string;

  @IsOptional()
  @IsString()
  pushToken?: string;
}