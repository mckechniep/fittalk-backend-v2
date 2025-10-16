// import { IsString, IsOptional, IsEnum } from 'class-validator';

// enum Platform {
//   IOS = 'ios',
//   ANDROID = 'android',
//   WEB = 'web',
// }

// export class RegisterDeviceDto {
//   @IsEnum(Platform)
//   platform: Platform;

//   @IsString()
//   deviceId: string;

//   @IsOptional()
//   @IsString()
//   pushToken?: string;
// }

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