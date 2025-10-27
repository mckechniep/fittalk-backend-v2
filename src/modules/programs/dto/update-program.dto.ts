import { IsString, IsInt, IsOptional, IsObject, Min, Max } from 'class-validator';

/**
 * DTO for updating a workout program
 * 
 * All fields optional - partial updates only
 * Status updates use separate endpoint
 */
export class UpdateProgramDto {
  @IsString()
  @IsOptional()
  title?: string;

  @IsInt()
  @Min(1)
  @Max(52)
  @IsOptional()
  weeks?: number;

  @IsObject()
  @IsOptional()
  sourceJson?: Record<string, any>;
}