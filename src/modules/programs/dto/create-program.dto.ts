import { IsString, IsInt, IsOptional, IsObject, Min, Max } from 'class-validator';

/**
 * DTO for creating a new workout program/plan
 * 
 * Required fields:
 * - title: Program name (e.g., "12-Week Strength Builder")
 * 
 * Optional fields:
 * - weeks: Duration in weeks (default: 4)
 * - sourceJson: Optional metadata (AI generation params, template info, etc.)
 * 
 * Design decisions:
 * - Status defaults to 'draft' (user can activate when ready)
 * - Days/items are added via separate endpoints (cleaner API)
 * - sourceJson allows flexibility for AI-generated plans or templates
 * 
 * Example:
 * {
 *   "title": "Summer Shred Program",
 *   "weeks": 8,
 *   "sourceJson": { "template": "fat_loss_beginner", "aiGenerated": true }
 * }
 */
export class CreateProgramDto {
  @IsString()
  title: string;

  @IsInt()
  @Min(1)
  @Max(52)
  @IsOptional()
  weeks?: number;

  @IsObject()
  @IsOptional()
  sourceJson?: Record<string, any>;
}