// dtos/create-workout-logging.dto.ts
import {
    IsUUID,
    IsOptional,
    IsInt,
    IsString,
    IsArray,
    ValidateNested,
    Min,
    Max,
    IsNumber,
    IsBoolean,
    IsDateString,
    MaxLength,
} from 'class-validator'
import { Type } from 'class-transformer'
