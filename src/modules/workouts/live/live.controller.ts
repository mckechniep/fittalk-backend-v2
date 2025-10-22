// src/modules/workouts/live/live.controller.ts
import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Patch,
  Delete,
  Query,
  Req,
  UseGuards,
  HttpCode,
  HttpStatus,
  Headers,
  ParseUUIDPipe,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags, ApiOperation, ApiOkResponse, ApiCreatedResponse, ApiNoContentResponse, ApiBadRequestResponse, ApiUnauthorizedResponse, ApiConflictResponse, ApiQuery } from '@nestjs/swagger';
import { AuthGuard } from '@nestjs/passport';
import { LiveService } from './live.service';
import { SessionStateService } from './session-state.service';
import { CreateLiveSessionDto } from './dto/create-live-session.dto';
import { JoinSessionDto } from './dto/join-session.dto';
import { LiveEventDto } from './dto/live-event.dto';
import { PaginationQueryDto } from '../../common/dto/pagination-query.dto';

ApiTags('Live Workouts')
@ApiBearerAuth()
@UseGuards(AuthGuard('jwt'))
@Controller({
  path: 'live',
  version: '1',
})
export class LiveController {
  constructor(
    private readonly liveService: LiveService,
    private readonly sessionState: SessionStateService,
  ) {}

}
