import {
  IsString,
  IsEnum,
  IsOptional,
  IsNumber,
  Min,
  Max,
  IsDecimal,
  IsNotEmpty,
} from 'class-validator';
import { Transform } from 'class-transformer';
import { Sex, ExperienceLevel, GoalType, UnitSystem } from '@prisma/client';

export class CreateProfileDto {
  @IsString()
  @IsNotEmpty()
  firstname: string;

  @IsString()
  @IsNotEmpty()
  lastname: string;

  @IsOptional()
  @IsEnum(Sex)
  sex?: Sex;

  @IsOptional()
  @IsNumber()
  @Min(100)
  @Max(250)
  heightCm?: number;

  @IsOptional()
  @Transform(({ value }) => parseFloat(value))
  @IsNumber()
  @Min(30)
  @Max(300)
  weightKg?: number;

  @IsOptional()
  @IsEnum(ExperienceLevel)
  experienceLevel?: ExperienceLevel;

  @IsOptional()
  @IsString()
  healthNotes?: string;

  @IsOptional()
  @IsEnum(GoalType)
  goalType?: GoalType;

  @IsOptional()
  @IsEnum(UnitSystem)
  unitSystem?: UnitSystem;
}
