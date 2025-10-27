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
import { CreateProfileDto } from './dto/create-profile.dto';
import { UpdateProfileDto } from './dto/update-profile.dto';
import { RegisterDeviceDto } from './dto/register-device.dto';
import { UpdateDeviceTokenDto } from './dto/update-device-token.dto';

@Controller('auth')
@UseGuards(JwtAuthGuard)
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  /**
   * Get current authenticated user
   */
  @Get('me')
  async getCurrentUser(@CurrentUser() user: AuthenticatedUser) {
    return this.authService.getCurrentUser(user.id);
  }

  /**
   * Create or update user profile
   */
  @Post('profile')
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
  async getSessions(@CurrentUser() user: AuthenticatedUser) {
    return this.authService.getUserSessions(user.id);
  }

  /**
   * Revoke a specific session
   */
  @Delete('sessions/:sessionId')
  @HttpCode(HttpStatus.NO_CONTENT)
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
  async revokeOtherSessions(@CurrentUser() user: AuthenticatedUser) {
    return this.authService.revokeAllOtherSessions(user.id, user.sessionId);
  }

  // ==================== DEVICE MANAGEMENT ====================

  /**
   * Register device for push notifications
   */
  @Post('devices')
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
  async getDevices(@CurrentUser() user: AuthenticatedUser) {
    return this.authService.getUserDevices(user.id);
  }

  /**
   * Update device push token
   */
  @Put('devices/:deviceId')
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
  healthCheck() {
    return { status: 'ok', timestamp: new Date().toISOString() };
  }
}
