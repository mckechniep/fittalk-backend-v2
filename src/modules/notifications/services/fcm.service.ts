import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../../prisma/prisma.service';
import * as admin from 'firebase-admin';

/**
 * Firebase Cloud Messaging (FCM) Service
 * 
 * Handles push notification delivery to user devices via Firebase.
 * 
 * Setup Requirements:
 * 1. Firebase project with Cloud Messaging enabled
 * 2. serviceAccountKey.json file in project root (add to .gitignore)
 * 3. Environment variables:
 *    - FIREBASE_PROJECT_ID
 *    - FIREBASE_PRIVATE_KEY
 *    - FIREBASE_CLIENT_EMAIL
 *    OR
 *    - GOOGLE_APPLICATION_CREDENTIALS=/path/to/serviceAccountKey.json
 * 
 * Device Token Management:
 * - Device tokens stored in Device table (via /auth/devices endpoints)
 * - Tokens are platform-specific (iOS APNS, Android FCM)
 * - Tokens can expire/revoke - handle gracefully
 * 
 * Delivery Strategy:
 * - Send to ALL active devices for user (multi-device support)
 * - Filter out revoked devices (Device.revokedAt != null)
 * - Handle invalid tokens (remove from database)
 * - Log all send attempts for debugging
 * 
 * Message Format:
 * - notification: Title + body (visible to user)
 * - data: Custom key-value pairs (for app logic)
 * - apns: iOS-specific config (sound, badge, etc.)
 * - android: Android-specific config (priority, ttl, etc.)
 * 
 * Error Handling:
 * - Invalid token → Remove from database
 * - Network errors → Log and retry later (don't throw)
 * - Quota exceeded → Log and alert admin
 * 
 * Design Decisions:
 * - Fail gracefully: Never throw errors (just log)
 * - Multi-device: Send to all user devices
 * - Platform-agnostic: Handle iOS and Android differences
 * - Token cleanup: Remove invalid tokens automatically
 */
@Injectable()
export class FcmService {
  private readonly logger = new Logger(FcmService.name);
  private firebaseApp: admin.app.App;

  constructor(
    private readonly configService: ConfigService,
    private readonly prisma: PrismaService,
  ) {
    this.initializeFirebase();
  }

  /**
   * Initialize Firebase Admin SDK
   * 
   * Supports two authentication methods:
   * 1. Service account JSON file (via GOOGLE_APPLICATION_CREDENTIALS env)
   * 2. Individual credentials (projectId, privateKey, clientEmail)
   */
  private initializeFirebase(): void {
    try {
      // Check if already initialized
      if (admin.apps.length > 0) {
        this.firebaseApp = admin.app();
        this.logger.log('Firebase Admin SDK already initialized');
        return;
      }

      // Method 1: Use GOOGLE_APPLICATION_CREDENTIALS env var
      const credentialsPath = this.configService.get<string>(
        'GOOGLE_APPLICATION_CREDENTIALS',
      );

      if (credentialsPath) {
        this.firebaseApp = admin.initializeApp({
          credential: admin.credential.applicationDefault(),
        });
        this.logger.log(
          `Firebase initialized with service account: ${credentialsPath}`,
        );
        return;
      }

      // Method 2: Use individual env vars
      const projectId = this.configService.get<string>('FIREBASE_PROJECT_ID');
      const privateKey = this.configService
        .get<string>('FIREBASE_PRIVATE_KEY')
        ?.replace(/\\n/g, '\n'); // Handle escaped newlines
      const clientEmail = this.configService.get<string>(
        'FIREBASE_CLIENT_EMAIL',
      );

      if (projectId && privateKey && clientEmail) {
        this.firebaseApp = admin.initializeApp({
          credential: admin.credential.cert({
            projectId,
            privateKey,
            clientEmail,
          }),
        });
        this.logger.log(`Firebase initialized for project: ${projectId}`);
        return;
      }

      // If neither method works, log warning but don't crash
      this.logger.warn(
        'Firebase credentials not configured - push notifications disabled',
      );
      this.logger.warn(
        'Set GOOGLE_APPLICATION_CREDENTIALS or FIREBASE_* env vars',
      );
    } catch (error) {
      this.logger.error(
        `Failed to initialize Firebase: ${error.message}`,
        error.stack,
      );
      // Don't throw - app can still run without push notifications
    }
  }

  /**
   * Send push notification to all user devices
   * 
   * @param userId - User ID
   * @param payload - Notification payload
   * @returns Number of successful sends
   */
  async sendToUser(
    userId: string,
    payload: {
      title: string;
      body: string;
      data?: Record<string, string>;
    },
  ): Promise<number> {
    if (!this.firebaseApp) {
      this.logger.warn('Firebase not initialized - skipping push notification');
      return 0;
    }

    // Get all active device tokens for user
    const devices = await this.prisma.device.findMany({
      where: {
        userId,
        revokedAt: null, // Only active devices
        pushToken: { not: null }, // Must have push token
      },
    });

    if (devices.length === 0) {
      this.logger.log(`No active devices found for user ${userId}`);
      return 0;
    }

    this.logger.log(
      `Sending push notification to ${devices.length} device(s) for user ${userId}`,
    );

    let successCount = 0;
    const invalidTokens: string[] = [];

    // Send to each device
    for (const device of devices) {
      try {
        const message: admin.messaging.Message = {
          token: device.pushToken!,
          notification: {
            title: payload.title,
            body: payload.body,
          },
          data: payload.data,
          apns: {
            // iOS-specific config
            payload: {
              aps: {
                sound: 'default',
                badge: 1,
              },
            },
          },
          android: {
            // Android-specific config
            priority: 'high',
            notification: {
              sound: 'default',
              channelId: 'fittalk_notifications', // Must match Android app
            },
          },
        };

        const response = await admin.messaging().send(message);
        this.logger.log(
          `Push notification sent to device ${device.id}: ${response}`,
        );
        successCount++;

        // Update last seen timestamp
        await this.prisma.device.update({
          where: { id: device.id },
          data: { lastSeenAt: new Date() },
        });
      } catch (error) {
        this.logger.error(
          `Failed to send to device ${device.id}: ${error.message}`,
        );

        // Check if token is invalid
        if (
          error.code === 'messaging/invalid-registration-token' ||
          error.code === 'messaging/registration-token-not-registered'
        ) {
          this.logger.warn(
            `Invalid token for device ${device.id} - marking for removal`,
          );
          invalidTokens.push(device.id);
        }
      }
    }

    // Clean up invalid tokens
    if (invalidTokens.length > 0) {
      await this.removeInvalidTokens(invalidTokens);
    }

    this.logger.log(
      `Push notification delivery complete: ${successCount}/${devices.length} successful`,
    );
    return successCount;
  }

  /**
   * Send push notification to specific device
   * 
   * Used for testing or single-device targeting.
   * 
   * @param deviceId - Device ID
   * @param payload - Notification payload
   * @returns True if sent successfully
   */
  async sendToDevice(
    deviceId: string,
    payload: {
      title: string;
      body: string;
      data?: Record<string, string>;
    },
  ): Promise<boolean> {
    if (!this.firebaseApp) {
      this.logger.warn('Firebase not initialized - skipping push notification');
      return false;
    }

    const device = await this.prisma.device.findUnique({
      where: { id: deviceId },
    });

    if (!device || !device.pushToken || device.revokedAt) {
      this.logger.warn(
        `Device ${deviceId} not found or has no valid push token`,
      );
      return false;
    }

    try {
      const message: admin.messaging.Message = {
        token: device.pushToken,
        notification: {
          title: payload.title,
          body: payload.body,
        },
        data: payload.data,
      };

      const response = await admin.messaging().send(message);
      this.logger.log(
        `Push notification sent to device ${deviceId}: ${response}`,
      );

      // Update last seen
      await this.prisma.device.update({
        where: { id: deviceId },
        data: { lastSeenAt: new Date() },
      });

      return true;
    } catch (error) {
      this.logger.error(
        `Failed to send to device ${deviceId}: ${error.message}`,
      );

      // Check if token is invalid
      if (
        error.code === 'messaging/invalid-registration-token' ||
        error.code === 'messaging/registration-token-not-registered'
      ) {
        await this.removeInvalidTokens([deviceId]);
      }

      return false;
    }
  }

  /**
   * Remove invalid device tokens from database
   * 
   * Called when FCM reports token as invalid or unregistered.
   * 
   * @param deviceIds - Device IDs to remove
   */
  private async removeInvalidTokens(deviceIds: string[]): Promise<void> {
    try {
      const result = await this.prisma.device.updateMany({
        where: {
          id: { in: deviceIds },
        },
        data: {
          pushToken: null, // Clear invalid token
          revokedAt: new Date(), // Mark as revoked
        },
      });

      this.logger.log(
        `Removed ${result.count} invalid device token(s)`,
      );
    } catch (error) {
      this.logger.error(
        `Failed to remove invalid tokens: ${error.message}`,
        error.stack,
      );
    }
  }

  /**
   * Test push notification
   * 
   * Sends test notification to verify FCM configuration.
   * 
   * @param userId - User ID to send test to
   * @returns True if sent successfully
   */
  async sendTestNotification(userId: string): Promise<boolean> {
    const result = await this.sendToUser(userId, {
      title: '🔔 Test Notification',
      body: 'If you see this, push notifications are working!',
      data: {
        type: 'test',
        timestamp: new Date().toISOString(),
      },
    });

    return result > 0;
  }
}
