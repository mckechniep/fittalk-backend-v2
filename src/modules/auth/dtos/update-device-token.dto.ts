import { IsString, IsOptional } from 'class-validator';

/**
 * DTO for updating device push token
 * 
 * Use case: User's device receives a new FCM/APNS token and needs to update it
 * 
 * Design:
 * - pushToken is optional (allows clearing the token)
 * - lastSeenAt is updated automatically by the service
 */
export class UpdateDeviceTokenDto {
  @IsString()
  @IsOptional()
  pushToken?: string;
}