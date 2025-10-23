// dtos/pagination-query.dto.ts
import { IsOptional, IsInt, Min, Max, IsString } from 'class-validator';
import { Type } from 'class-transformer';

/**
 * Pagination Query DTO
 * 
 * Supports two pagination strategies:
 * 1. Cursor-based (recommended for real-time data, mobile apps)
 * 2. Offset-based (useful for admin panels, analytics)
 * 
 * Design decisions:
 * - Cursor takes precedence over page/offset
 * - Default limit: 20 items (mobile-friendly)
 * - Max limit: 100 items (prevent excessive loads)
 * - Cursor is opaque string (encodes position + direction)
 * 
 * Cursor format (base64 encoded):
 * - Forward: "next_<timestamp>_<id>"
 * - Backward: "prev_<timestamp>_<id>"
 * 
 * Use cases:
 * - Infinite scroll: Use cursor pagination
 * - Traditional pages: Use page + limit
 * - Specific offset: Use offset + limit
 */
export class PaginationQueryDto {
  /**
   * Cursor for cursor-based pagination.
   * Opaque string returned in previous response.
   * 
   * Example: "bmV4dF8xNjQwMDAwMDAwXzEyMzQ1"
   * 
   * Benefits:
   * - Handles real-time data changes gracefully
   * - No skipped/duplicate items during pagination
   * - More efficient for large datasets
   * - Works well with mobile infinite scroll
   * 
   * Takes precedence over page/offset if provided.
   */
  @IsOptional()
  @IsString()
  cursor?: string;

  /**
   * Page number for offset-based pagination.
   * Starts at 1 (not 0).
   * 
   * Example: page=2 with limit=20 returns items 21-40
   * 
   * Converted to offset internally: offset = (page - 1) * limit
   * 
   * Use when:
   * - Building traditional paginated UI with page numbers
   * - Need to jump to specific page
   * - Dataset is relatively static
   */
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  /**
   * Direct offset for offset-based pagination.
   * Number of items to skip.
   * 
   * Example: offset=40 with limit=20 returns items 41-60
   * 
   * Lower-level than page, gives more control.
   * If both page and offset provided, offset takes precedence.
   */
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  offset?: number;

  /**
   * Number of items per page/request.
   * 
   * Default: 20 (mobile-friendly)
   * Max: 100 (prevent excessive loads)
   * 
   * Same limit applies to both cursor and offset pagination.
   */
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number = 20;

  /**
   * Helper: Get normalized limit with default.
   */
  getLimit(): number {
    return this.limit ?? 20;
  }

  /**
   * Helper: Calculate skip for Prisma queries.
   * Returns undefined if using cursor pagination.
   */
  getSkip(): number | undefined {
    // Cursor pagination doesn't use skip
    if (this.cursor) {
      return undefined;
    }

    // Offset takes precedence over page
    if (this.offset !== undefined) {
      return this.offset;
    }

    // Calculate from page number
    if (this.page !== undefined) {
      return (this.page - 1) * this.getLimit();
    }

    // No pagination params = start from beginning
    return 0;
  }

  /**
   * Helper: Check if using cursor-based pagination.
   */
  isCursorBased(): boolean {
    return !!this.cursor;
  }

  /**
   * Helper: Check if using offset-based pagination.
   */
  isOffsetBased(): boolean {
    return !this.cursor && (this.page !== undefined || this.offset !== undefined);
  }
}

/**
 * Pagination metadata for offset-based responses.
 * 
 * Provides clients with navigation information.
 */
export class PaginationMetaDto {
  /**
   * Current page number (1-indexed).
   */
  page: number;

  /**
   * Items per page.
   */
  limit: number;

  /**
   * Total number of items across all pages.
   */
  total: number;

  /**
   * Total number of pages.
   */
  totalPages: number;

  /**
   * Whether there's a previous page.
   */
  hasPrevious: boolean;

  /**
   * Whether there's a next page.
   */
  hasNext: boolean;
}

/**
 * Pagination metadata for cursor-based responses.
 * 
 * Uses opaque cursors instead of page numbers.
 */
export class CursorPaginationMetaDto {
  /**
   * Cursor for next page of results.
   * Undefined if no more results.
   */
  nextCursor?: string;

  /**
   * Cursor for previous page of results.
   * Undefined if at beginning.
   */
  prevCursor?: string;

  /**
   * Whether there are more results after current page.
   */
  hasMore: boolean;

  /**
   * Number of items in current page.
   */
  count: number;
}

/**
 * Generic paginated response for offset-based pagination.
 * 
 * Use for endpoints that return lists with page numbers.
 */
export class PaginatedResponseDto<T> {
  /**
   * Array of items for current page.
   */
  items: T[];

  /**
   * Pagination metadata.
   */
  meta: PaginationMetaDto;
}

/**
 * Generic cursor-paginated response.
 * 
 * Use for endpoints with infinite scroll.
 */
export class CursorPaginatedResponseDto<T> {
  /**
   * Array of items for current cursor position.
   */
  items: T[];

  /**
   * Cursor for fetching next page.
   */
  nextCursor?: string;

  /**
   * Cursor for fetching previous page.
   */
  prevCursor?: string;

  /**
   * Whether more results exist after current page.
   */
  hasMore: boolean;
}

/**
 * Utility class for building pagination responses.
 * 
 * Example usage in service:
 * 
 * ```typescript
 * const query = new PaginationQueryDto();
 * query.page = 1;
 * query.limit = 20;
 * 
 * const [items, total] = await Promise.all([
 *   prisma.item.findMany({
 *     skip: query.getSkip(),
 *     take: query.getLimit(),
 *   }),
 *   prisma.item.count(),
 * ]);
 * 
 * return PaginationHelper.buildOffsetResponse(items, total, query);
 * ```
 */
export class PaginationHelper {
  /**
   * Build offset-based pagination response.
   */
  static buildOffsetResponse<T>(
    items: T[],
    total: number,
    query: PaginationQueryDto,
  ): PaginatedResponseDto<T> {
    const limit = query.getLimit();
    const page = query.page || Math.floor((query.getSkip() || 0) / limit) + 1;
    const totalPages = Math.ceil(total / limit);

    return {
      items,
      meta: {
        page,
        limit,
        total,
        totalPages,
        hasPrevious: page > 1,
        hasNext: page < totalPages,
      },
    };
  }

  /**
   * Build cursor-based pagination response.
   * 
   * @param items - Items in current page
   * @param query - Pagination query
   * @param getCursor - Function to extract cursor from item
   */
  static buildCursorResponse<T>(
    items: T[],
    query: PaginationQueryDto,
    getCursor: (item: T) => string,
  ): CursorPaginatedResponseDto<T> {
    const limit = query.getLimit();
    const hasMore = items.length > limit;

    // If we fetched limit+1 items, we have more
    const returnItems = hasMore ? items.slice(0, limit) : items;

    // Generate next cursor from last item
    const nextCursor =
      hasMore && returnItems.length > 0
        ? getCursor(returnItems[returnItems.length - 1])
        : undefined;

    return {
      items: returnItems,
      nextCursor,
      hasMore,
    };
  }

  /**
   * Encode cursor for response.
   * 
   * @param direction - 'next' or 'prev'
   * @param timestamp - ISO timestamp for ordering
   * @param id - Entity ID for uniqueness
   */
  static encodeCursor(
    direction: 'next' | 'prev',
    timestamp: string | Date,
    id: string,
  ): string {
    const ts = timestamp instanceof Date ? timestamp.toISOString() : timestamp;
    const raw = `${direction}_${ts}_${id}`;
    return Buffer.from(raw).toString('base64url');
  }

  /**
   * Decode cursor from request.
   * 
   * @returns { direction, timestamp, id } or null if invalid
   */
  static decodeCursor(cursor: string): {
    direction: 'next' | 'prev';
    timestamp: string;
    id: string;
  } | null {
    try {
      const raw = Buffer.from(cursor, 'base64url').toString('utf-8');
      const [direction, timestamp, id] = raw.split('_');

      if (!direction || !timestamp || !id) {
        return null;
      }

      if (direction !== 'next' && direction !== 'prev') {
        return null;
      }

      return { direction, timestamp, id };
    } catch {
      return null;
    }
  }
}