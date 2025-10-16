import { Injectable, CanActivate, ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PrismaService } from '../../prisma/prisma.service';
import { REQUIRE_PROFILE_KEY } from '../decorators/require-profile.decorator';

@Injectable()
export class ProfileGuard implements CanActivate {
  constructor(
    private reflector: Reflector,
    private prisma: PrismaService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const requireProfile = this.reflector.getAllAndOverride<boolean>(
      REQUIRE_PROFILE_KEY,
      [context.getHandler(), context.getClass()],
    );

    if (!requireProfile) {
      return true;
    }

    const request = context.switchToHttp().getRequest();
    const user = request.user;

    if (!user) {
      throw new ForbiddenException('User not authenticated');
    }

    const profile = await this.prisma.profile.findUnique({
      where: { userId: user.id },
    });

    if (!profile) {
      throw new ForbiddenException('Profile completion required');
    }

    // Attach profile to request for later use
    request.profile = profile;

    return true;
  }
}