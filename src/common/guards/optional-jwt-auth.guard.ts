import { Injectable } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';

/**
 * Guard that allows both authenticated and unauthenticated requests
 * If JWT is present and valid, user will be attached to request
 * If JWT is missing or invalid, request continues without user
 */
@Injectable()
export class OptionalJwtAuthGuard extends AuthGuard('jwt') {
  handleRequest(err: any, user: any) {
    // Don't throw error if no user, just return null
    return user || null;
  }
}