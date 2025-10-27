import { IsOptional, IsString, MaxLength, IsIn } from 'class-validator';

/**
 * Join a live session. Service enforces role rules (host uniqueness, etc).
 */
export class JoinSessionDto {
  @IsOptional()
  @IsString()
  @MaxLength(60)
  displayName?: string;

  @IsOptional()
  @IsString()
  @IsIn(['host', 'cohost', 'participant'])
  role?: 'host' | 'cohost' | 'participant';
}
