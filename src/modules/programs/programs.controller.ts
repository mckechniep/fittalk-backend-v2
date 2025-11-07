import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
  HttpCode,
  HttpStatus,
  ParseUUIDPipe,
} from '@nestjs/common';
import { ProgramsService } from './programs.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { AuditEntity } from '../../common/decorators/audit-entity.decorator';
import type { AuthenticatedUser } from '../auth/strategies/jwt.strategy';
import { CreateProgramDto } from './dto/create-program.dto';
import { UpdateProgramDto } from './dto/update-program.dto';
import { UpdateProgramStatusDto } from './dto/update-program-status.dto';
import { CreateWorkoutDayDto } from './dto/create-workout-day.dto';
import { UpdateWorkoutDayDto } from './dto/update-workout-day.dto';
import { CreateWorkoutItemDto } from './dto/create-workout-item.dto';
import { UpdateWorkoutItemDto } from './dto/update-workout-item.dto';
import { PlanStatus } from '@prisma/client';
import {
  StandardCreate,
  ReadEndpoint,
  FrequentRead,
  StandardUpdate,
  StandardDelete,
  ExpensiveOperation,
  HighRiskEndpoint,
} from '../../common/guards/throttler/throttler.decorators';

/**
 * Programs Controller
 * 
 * Handles workout program/plan management with nested resources.
 * All routes require JWT authentication.
 * 
 * Route structure (RESTful nested resources):
 * 
 * Programs:
 * - GET    /programs              - List user's programs
 * - POST   /programs              - Create program
 * - GET    /programs/:id          - Get program with full details
 * - PATCH  /programs/:id          - Update program
 * - DELETE /programs/:id          - Delete program
 * - PATCH  /programs/:id/status   - Update status
 * - POST   /programs/:id/clone    - Clone program
 * 
 * Workout Days (nested under programs):
 * - POST   /programs/:id/days                - Add day to program
 * - PATCH  /programs/:id/days/:dayId         - Update day
 * - DELETE /programs/:id/days/:dayId         - Delete day
 * 
 * Workout Items (nested under days):
 * - POST   /programs/:id/days/:dayId/items          - Add exercise to day
 * - PATCH  /programs/:id/days/:dayId/items/:itemId  - Update exercise
 * - DELETE /programs/:id/days/:dayId/items/:itemId  - Delete exercise
 * 
 * Design decisions:
 * - Nested routes reflect data hierarchy
 * - UUID validation on all ID params
 * - Separate status endpoint for audit trail
 * - Clone creates complete deep copy
 */
@Controller('programs')
@UseGuards(JwtAuthGuard)
export class ProgramsController {
  constructor(private readonly programsService: ProgramsService) {}

  // ==================== PROGRAM ROUTES ====================

  /**
   * Create a new workout program
   * POST /programs
   */
  @Post()
  @StandardCreate() // 10/min - creating workout programs
  @AuditEntity('WorkoutPlan')
  @HttpCode(HttpStatus.CREATED)
  async createProgram(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateProgramDto,
  ) {
    return this.programsService.createProgram(user.id, dto);
  }

  /**
   * Get all user's programs
   * GET /programs?status=active
   */
  @Get()
  @FrequentRead() // 100/min - browsing programs list
  async getUserPrograms(
    @CurrentUser() user: AuthenticatedUser,
    @Query('status') status?: PlanStatus,
  ) {
    return this.programsService.getUserPrograms(user.id, status);
  }

  /**
   * Get specific program with full details (days + items + exercises)
   * GET /programs/:id
   */
  @Get(':id')
  @ReadEndpoint() // 60/min - viewing program details
  async getProgramById(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) programId: string,
  ) {
    return this.programsService.getProgramById(user.id, programId);
  }

  /**
   * Update program details
   * PATCH /programs/:id
   */
  @Patch(':id')
  @StandardUpdate() // 15/min - updating program details
  @AuditEntity('WorkoutPlan')
  async updateProgram(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) programId: string,
    @Body() dto: UpdateProgramDto,
  ) {
    return this.programsService.updateProgram(user.id, programId, dto);
  }

  /**
   * Update program status
   * PATCH /programs/:id/status
   */
  @Patch(':id/status')
  @StandardUpdate() // 15/min - changing program status
  @AuditEntity('WorkoutPlan')
  async updateProgramStatus(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) programId: string,
    @Body() dto: UpdateProgramStatusDto,
  ) {
    return this.programsService.updateProgramStatus(user.id, programId, dto);
  }

  /**
   * Delete a program (cascade deletes days and items)
   * DELETE /programs/:id
   */
  @Delete(':id')
  @HighRiskEndpoint() // 5/min - deletes entire program with cascades
  @AuditEntity('WorkoutPlan')
  @HttpCode(HttpStatus.NO_CONTENT)
  async deleteProgram(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) programId: string,
  ) {
    return this.programsService.deleteProgram(user.id, programId);
  }

  /**
   * Clone an existing program (deep copy)
   * POST /programs/:id/clone
   */
  @Post(':id/clone')
  @ExpensiveOperation() // 5/min - deep copy operation
  @AuditEntity('WorkoutPlan')
  @HttpCode(HttpStatus.CREATED)
  async cloneProgram(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) programId: string,
  ) {
    return this.programsService.cloneProgram(user.id, programId);
  }

  // ==================== WORKOUT DAY ROUTES ====================

  /**
   * Add a workout day to a program
   * POST /programs/:id/days
   */
  @Post(':id/days')
  @StandardCreate() // 10/min - adding days to programs
  @AuditEntity('WorkoutDay')
  @HttpCode(HttpStatus.CREATED)
  async createWorkoutDay(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) programId: string,
    @Body() dto: CreateWorkoutDayDto,
  ) {
    return this.programsService.createWorkoutDay(user.id, programId, dto);
  }

  /**
   * Update a workout day
   * PATCH /programs/:id/days/:dayId
   */
  @Patch(':id/days/:dayId')
  @StandardUpdate() // 15/min - updating workout day details
  @AuditEntity('WorkoutDay')
  async updateWorkoutDay(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) programId: string,
    @Param('dayId', ParseUUIDPipe) dayId: string,
    @Body() dto: UpdateWorkoutDayDto,
  ) {
    return this.programsService.updateWorkoutDay(user.id, programId, dayId, dto);
  }

  /**
   * Delete a workout day (cascade deletes items)
   * DELETE /programs/:id/days/:dayId
   */
  @Delete(':id/days/:dayId')
  @StandardDelete() // 10/min - removing workout days
  @AuditEntity('WorkoutDay')
  @HttpCode(HttpStatus.NO_CONTENT)
  async deleteWorkoutDay(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) programId: string,
    @Param('dayId', ParseUUIDPipe) dayId: string,
  ) {
    return this.programsService.deleteWorkoutDay(user.id, programId, dayId);
  }

  // ==================== WORKOUT ITEM ROUTES ====================

  /**
   * Add an exercise item to a workout day
   * POST /programs/:id/days/:dayId/items
   */
  @Post(':id/days/:dayId/items')
  @StandardCreate() // 10/min - adding exercises to days
  @AuditEntity('WorkoutItem')
  @HttpCode(HttpStatus.CREATED)
  async createWorkoutItem(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) programId: string,
    @Param('dayId', ParseUUIDPipe) dayId: string,
    @Body() dto: CreateWorkoutItemDto,
  ) {
    return this.programsService.createWorkoutItem(user.id, programId, dayId, dto);
  }

  /**
   * Update a workout item
   * PATCH /programs/:id/days/:dayId/items/:itemId
   */
  @Patch(':id/days/:dayId/items/:itemId')
  @StandardUpdate() // 15/min - updating exercise details
  @AuditEntity('WorkoutItem')
  async updateWorkoutItem(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) programId: string,
    @Param('dayId', ParseUUIDPipe) dayId: string,
    @Param('itemId', ParseUUIDPipe) itemId: string,
    @Body() dto: UpdateWorkoutItemDto,
  ) {
    return this.programsService.updateWorkoutItem(user.id, programId, dayId, itemId, dto);
  }

  /**
   * Delete a workout item
   * DELETE /programs/:id/days/:dayId/items/:itemId
   */
  @Delete(':id/days/:dayId/items/:itemId')
  @StandardDelete() // 10/min - removing exercises from days
  @AuditEntity('WorkoutItem')
  @HttpCode(HttpStatus.NO_CONTENT)
  async deleteWorkoutItem(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) programId: string,
    @Param('dayId', ParseUUIDPipe) dayId: string,
    @Param('itemId', ParseUUIDPipe) itemId: string,
  ) {
    return this.programsService.deleteWorkoutItem(user.id, programId, dayId, itemId);
  }
}