import { IsString, IsOptional, IsIn } from 'class-validator';

export class RegisterDeviceDto {
  @IsIn(['ios', 'android', 'web'])
  platform: string;

  @IsString()
  deviceId: string;

  @IsOptional()
  @IsString()
  pushToken?: string;
}
