import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { AuthService } from './auth.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Public } from '../../common/decorators/public.decorator';
import type { AuthenticatedUser } from './strategies/jwt.strategy';
import { CreateProfileDto } from './dtos/create-profile.dto';
import { UpdateProfileDto } from './dtos/update-profile.dto';
import { RegisterDeviceDto } from './dtos/register-device.dto';
import { UpdateDeviceTokenDto } from './dtos/update-device-token.dto';
import {
  FrequentRead,
  StandardCreate,
  StandardUpdate,
  HighRiskEndpoint,
  CriticalRiskEndpoint,
  StandardDelete,
  HealthCheckEndpoint,
} from '../../common/guards/throttler/throttler.decorators';

@Controller('auth')
@UseGuards(JwtAuthGuard)
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  /**
   * Get current authenticated user
   */
  @Get('me')
  @FrequentRead() // 60/min - frequently accessed by frontend
  async getCurrentUser(@CurrentUser() user: AuthenticatedUser) {
    return this.authService.getCurrentUser(user.id);
  }

  /**
   * Create or update user profile
   */
  @Post('profile')
  @StandardCreate() // 10/min
  async createProfile(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateProfileDto,
  ) {
    return this.authService.createOrUpdateProfile(user.id, dto);
  }

  /**
   * Update user profile
   */
  @Put('profile')
  @StandardUpdate() // 10/min
  async updateProfile(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: UpdateProfileDto,
  ) {
    return this.authService.createOrUpdateProfile(user.id, dto);
  }

  /**
   * Get all active sessions
   */
  @Get('sessions')
  @FrequentRead() // 60/min
  async getSessions(@CurrentUser() user: AuthenticatedUser) {
    return this.authService.getUserSessions(user.id);
  }

  /**
   * Revoke a specific session
   */
  @Delete('sessions/:sessionId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @HighRiskEndpoint() // 5/min - security sensitive
  async revokeSession(
    @CurrentUser() user: AuthenticatedUser,
    @Param('sessionId') sessionId: string,
  ) {
    return this.authService.revokeSession(user.id, sessionId);
  }

  /**
   * Revoke all other sessions
   */
  @Post('sessions/revoke-others')
  @CriticalRiskEndpoint() // 3/min - logs out everywhere
  async revokeOtherSessions(@CurrentUser() user: AuthenticatedUser) {
    return this.authService.revokeAllOtherSessions(user.id, user.sessionId);
  }

  // ==================== DEVICE MANAGEMENT ====================

  /**
   * Register device for push notifications
   */
  @Post('devices')
  @StandardCreate() // 10/min
  async registerDevice(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: RegisterDeviceDto,
  ) {
    return this.authService.registerDevice(user.id, dto);
  }

  /**
   * Get all user devices
   */
  @Get('devices')
  @FrequentRead() // 60/min
  async getDevices(@CurrentUser() user: AuthenticatedUser) {
    return this.authService.getUserDevices(user.id);
  }

  /**
   * Update device push token
   */
  @Put('devices/:deviceId')
  @StandardUpdate() // 10/min
  async updateDeviceToken(
    @CurrentUser() user: AuthenticatedUser,
    @Param('deviceId') deviceId: string,
    @Body() dto: UpdateDeviceTokenDto,
  ) {
    return this.authService.updateDeviceToken(user.id, deviceId, dto);
  }

  /**
   * Delete/revoke a device
   */
  @Delete('devices/:deviceId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @StandardDelete() // 10/min
  async revokeDevice(
    @CurrentUser() user: AuthenticatedUser,
    @Param('deviceId') deviceId: string,
  ) {
    return this.authService.revokeDevice(user.id, deviceId);
  }

  /**
   * Verify device exists and is not revoked
   */
  @Get('devices/:deviceId/verify')
  @FrequentRead() // 60/min
  async verifyDevice(
    @CurrentUser() user: AuthenticatedUser,
    @Param('deviceId') deviceId: string,
  ) {
    return this.authService.verifyDevice(user.id, deviceId);
  }

  /**
   * Health check endpoint (public)
   */
  @Get('health')
  @Public()
  @HealthCheckEndpoint() // 300/min - monitoring systems
  healthCheck() {
    return { status: 'ok', timestamp: new Date().toISOString() };
  }
}
