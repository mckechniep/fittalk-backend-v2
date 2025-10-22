// live/live.controller.ts
import {
  Body,
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Param,
  Query,
  HttpCode,
  HttpStatus,
  UseGuards,
  ParseUUIDPipe,
  Headers,
} from '@nestjs/common';
import { JwtAuthGuard } from '../../../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import { LiveService } from './live.service';
import { SessionStateService } from './session-state.service';

// DTOs (place these in ./dto/* to match your structure)
import { CreateLiveSessionDto } from './dto/create-live-session.dto';
import { JoinSessionDto } from './dto/join-session.dto';
import { LiveEventDto } from './dto/live-event.dto';
import { PaginationQueryDto } from '../../../common/dto/pagination-query.dto';
