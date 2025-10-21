// scheduling/scheduling.service.ts
import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
  Logger,
  Inject,
} from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import { PlannerService, ScheduledAssignment } from './planner.service';
import { ScheduleWeekDto } from '../dtos/schedule-week.dto';
import {
  ScheduledWorkoutResponseDto,
  ScheduleWeekResponseDto,
  UnscheduledDayDto,
} from '../dtos/schedule-workout-response.dto';
import { plainToInstance } from 'class-transformer';
import { Redis } from 'ioredis';