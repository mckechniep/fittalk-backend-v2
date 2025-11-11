import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../../prisma/prisma.service';
import { Resend } from 'resend';
import { SendNotificationDto } from '../dtos';
import { NotificationType } from '@prisma/client';

/**
 * Email Service (Resend Integration)
 * 
 * Handles email delivery via Resend API.
 * 
 * LIMITED USE CASES:
 * 1. Consultation Complete - Sends consultation summary email
 * 2. End of Month Reviews - Sends monthly progress report (includes PRs, milestones)
 * 
 * Setup Requirements:
 * 1. Resend account with verified sender domain
 * 2. Environment variable: RESEND_API_KEY
 * 3. Environment variable: RESEND_FROM_EMAIL (e.g., "FitTalk <notifications@fittalk.com>")
 * 
 * Email Templates:
 * - Consultation Summary: Welcome email with plan overview
 * - Monthly Review: Progress summary, PRs, milestones, stats
 * 
 * Design Decisions:
 * - Email sparingly: Only for important, comprehensive communications
 * - HTML + Plain text: Always provide both versions
 * - Branded templates: Professional, on-brand design
 * - Fail gracefully: Never throw errors (just log)
 * - Check preferences: Respect user's notifEmail flag
 * 
 * Rate Limits:
 * - Resend free tier: 100 emails/day, 3000 emails/month
 * - Production: Upgrade to paid plan for higher limits
 */
@Injectable()
export class EmailService {
  private readonly logger = new Logger(EmailService.name);
  private resend: Resend | null = null;
  private fromEmail: string;

  constructor(
    private readonly configService: ConfigService,
    private readonly prisma: PrismaService,
  ) {
    this.initializeResend();
  }

  /**
   * Initialize Resend client
   */
  private initializeResend(): void {
    const apiKey = this.configService.get<string>('RESEND_API_KEY');
    this.fromEmail =
      this.configService.get<string>('RESEND_FROM_EMAIL') ||
      'FitTalk <notifications@fittalk.com>';

    if (!apiKey) {
      this.logger.warn('RESEND_API_KEY not configured - email disabled');
      return;
    }

    try {
      this.resend = new Resend(apiKey);
      this.logger.log(`Resend initialized with from: ${this.fromEmail}`);
    } catch (error) {
      this.logger.error(
        `Failed to initialize Resend: ${error.message}`,
        error.stack,
      );
    }
  }

  /**
   * Send notification email (only for specific types)
   * 
   * @param dto - Notification details
   */
  async sendNotificationEmail(dto: SendNotificationDto): Promise<void> {
    if (!this.resend) {
      this.logger.warn('Resend not initialized - skipping email');
      return;
    }

    // Get user profile for email
    const user = await this.prisma.user.findUnique({
      where: { id: dto.userId },
      include: {
        profile: true,
        preferences: true,
      },
    });

    if (!user || !user.email) {
      this.logger.warn(`User ${dto.userId} has no email address`);
      return;
    }

    // Check if user has email notifications enabled
    if (!user.preferences?.notifEmail) {
      this.logger.log(
        `User ${dto.userId} has email notifications disabled - skipping`,
      );
      return;
    }

    try {
      switch (dto.type) {
        case NotificationType.PLAN_READY:
          await this.sendConsultationSummaryEmail(user, dto);
          break;
        // Monthly reviews are sent by separate cron job, not triggered by notifications
        default:
          this.logger.log(
            `Email not configured for notification type: ${dto.type}`,
          );
      }
    } catch (error) {
      this.logger.error(
        `Failed to send email for ${dto.type}: ${error.message}`,
        error.stack,
      );
      // Don't throw - email is non-critical
    }
  }

  /**
   * Send consultation summary email (Plan Ready)
   * 
   * Sent when user completes consultation and AI generates their plan.
   * 
   * @param user - User with profile and preferences
   * @param dto - Notification DTO
   */
  private async sendConsultationSummaryEmail(
    user: any,
    dto: SendNotificationDto,
  ): Promise<void> {
    const consultationId = dto.meta?.consultationId;
    const firstname = user.profile?.firstname || 'there';

    // TODO: Fetch consultation details and plan summary for email body
    // For now, send basic welcome email

    const html = this.buildConsultationSummaryHtml(firstname);
    const text = this.buildConsultationSummaryText(firstname);

    await this.resend!.emails.send({
      from: this.fromEmail,
      to: user.email,
      subject: '🎉 Your Personalized Workout Plan is Ready!',
      html,
      text,
    });

    this.logger.log(`Consultation summary email sent to ${user.email}`);
  }

  /**
   * Build HTML for consultation summary email
   */
  private buildConsultationSummaryHtml(firstname: string): string {
    return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Your Plan is Ready</title>
</head>
<body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
  <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 30px; text-align: center; border-radius: 10px 10px 0 0;">
    <h1 style="color: white; margin: 0;">🎉 Your Plan is Ready!</h1>
  </div>
  
  <div style="background: #f9f9f9; padding: 30px; border-radius: 0 0 10px 10px;">
    <p style="font-size: 16px;">Hi ${firstname},</p>
    
    <p style="font-size: 16px;">
      Great news! Based on your consultation responses, we've created a personalized workout plan 
      tailored specifically for your goals, experience level, and available equipment.
    </p>
    
    <div style="background: white; padding: 20px; border-left: 4px solid #667eea; margin: 20px 0;">
      <h2 style="margin-top: 0; color: #667eea;">What's Next?</h2>
      <ol style="padding-left: 20px;">
        <li style="margin-bottom: 10px;">Open the FitTalk app</li>
        <li style="margin-bottom: 10px;">Review your personalized workout plan</li>
        <li style="margin-bottom: 10px;">Schedule your first workout</li>
        <li style="margin-bottom: 10px;">Start crushing your fitness goals! 💪</li>
      </ol>
    </div>
    
    <p style="font-size: 16px;">
      Your plan adapts to your progress, so the more you train, the smarter it gets. 
      We're excited to be part of your fitness journey!
    </p>
    
    <div style="text-align: center; margin: 30px 0;">
      <a href="fittalk://app/plans" 
         style="background: #667eea; color: white; padding: 15px 30px; text-decoration: none; border-radius: 5px; font-weight: bold; display: inline-block;">
        View Your Plan
      </a>
    </div>
    
    <p style="font-size: 14px; color: #666; text-align: center; margin-top: 30px;">
      Have questions? Reply to this email or reach out to our support team.
    </p>
  </div>
  
  <div style="text-align: center; padding: 20px; font-size: 12px; color: #999;">
    <p>© ${new Date().getFullYear()} FitTalk. All rights reserved.</p>
    <p>
      You're receiving this email because you completed your consultation on FitTalk.
      <br>
      <a href="fittalk://app/settings/notifications" style="color: #667eea;">Manage notification preferences</a>
    </p>
  </div>
</body>
</html>
    `.trim();
  }

  /**
   * Build plain text for consultation summary email
   */
  private buildConsultationSummaryText(firstname: string): string {
    return `
Hi ${firstname},

Great news! Based on your consultation responses, we've created a personalized workout plan tailored specifically for your goals, experience level, and available equipment.

WHAT'S NEXT?

1. Open the FitTalk app
2. Review your personalized workout plan
3. Schedule your first workout
4. Start crushing your fitness goals! 💪

Your plan adapts to your progress, so the more you train, the smarter it gets. We're excited to be part of your fitness journey!

VIEW YOUR PLAN: fittalk://app/plans

Have questions? Reply to this email or reach out to our support team.

---

© ${new Date().getFullYear()} FitTalk. All rights reserved.

You're receiving this email because you completed your consultation on FitTalk.
Manage notification preferences: fittalk://app/settings/notifications
    `.trim();
  }

  /**
   * Send monthly review email (called by cron job)
   * 
   * Sent at the end of each month with progress summary, PRs, milestones.
   * 
   * @param userId - User ID
   */
  async sendMonthlyReviewEmail(userId: string): Promise<void> {
    if (!this.resend) {
      this.logger.warn('Resend not initialized - skipping monthly review');
      return;
    }

    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: {
        profile: true,
        preferences: true,
      },
    });

    if (!user || !user.email || !user.preferences?.notifEmail) {
      return;
    }

    // TODO: Fetch monthly stats, PRs, milestones for email body
    const firstname = user.profile?.firstname || 'there';

    const html = this.buildMonthlyReviewHtml(firstname);
    const text = this.buildMonthlyReviewText(firstname);

    await this.resend.emails.send({
      from: this.fromEmail,
      to: user.email,
      subject: '📊 Your Monthly Fitness Review',
      html,
      text,
    });

    this.logger.log(`Monthly review email sent to ${user.email}`);
  }

  /**
   * Build HTML for monthly review email
   */
  private buildMonthlyReviewHtml(firstname: string): string {
    // TODO: Populate with actual stats, PRs, milestones
    return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Monthly Review</title>
</head>
<body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
  <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 30px; text-align: center; border-radius: 10px 10px 0 0;">
    <h1 style="color: white; margin: 0;">📊 Your Monthly Review</h1>
  </div>
  
  <div style="background: #f9f9f9; padding: 30px; border-radius: 0 0 10px 10px;">
    <p style="font-size: 16px;">Hi ${firstname},</p>
    
    <p style="font-size: 16px;">
      Here's a summary of your progress this month. Keep up the great work!
    </p>
    
    <!-- TODO: Add actual stats, PRs, milestones -->
    
    <div style="text-align: center; margin: 30px 0;">
      <a href="fittalk://app/progress" 
         style="background: #667eea; color: white; padding: 15px 30px; text-decoration: none; border-radius: 5px; font-weight: bold; display: inline-block;">
        View Full Report
      </a>
    </div>
  </div>
  
  <div style="text-align: center; padding: 20px; font-size: 12px; color: #999;">
    <p>© ${new Date().getFullYear()} FitTalk. All rights reserved.</p>
  </div>
</body>
</html>
    `.trim();
  }

  /**
   * Build plain text for monthly review email
   */
  private buildMonthlyReviewText(firstname: string): string {
    return `
Hi ${firstname},

Here's a summary of your progress this month. Keep up the great work!

[TODO: Add actual stats, PRs, milestones]

VIEW FULL REPORT: fittalk://app/progress

---

© ${new Date().getFullYear()} FitTalk. All rights reserved.
    `.trim();
  }
}
