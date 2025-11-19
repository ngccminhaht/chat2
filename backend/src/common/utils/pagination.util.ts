/**
 * Pagination Utilities
 * Common helpers for paginated queries
 */

import { PAGINATION } from '../constants';
import { PaginatedResponse } from '../types';

/**
 * Calculate skip value for pagination
 */
export function calculateSkip(page: number, limit: number): number {
  return (page - 1) * limit;
}

/**
 * Calculate total pages
 */
export function calculateTotalPages(total: number, limit: number): number {
  return Math.ceil(total / limit);
}

/**
 * Validate and normalize page number
 */
export function normalizePage(page?: number): number {
  if (!page || page < 1) {
    return PAGINATION.DEFAULT_PAGE;
  }
  return Math.floor(page);
}

/**
 * Validate and normalize limit
 */
export function normalizeLimit(limit?: number): number {
  if (!limit || limit < 1) {
    return PAGINATION.DEFAULT_LIMIT;
  }
  if (limit > PAGINATION.MAX_LIMIT) {
    return PAGINATION.MAX_LIMIT;
  }
  return Math.floor(limit);
}

/**
 * Build paginated response
 */
export function buildPaginatedResponse<T>(
  data: T[],
  total: number,
  page: number,
  limit: number,
): PaginatedResponse<T> {
  return {
    data,
    meta: {
      total,
      page,
      limit,
      totalPages: calculateTotalPages(total, limit),
    },
  };
}

/**
 * Extract pagination params from query with validation
 */
export function extractPaginationParams(query: {
  page?: number | string;
  limit?: number | string;
}): { page: number; limit: number; skip: number } {
  const page = normalizePage(
    typeof query.page === 'string' ? parseInt(query.page, 10) : query.page,
  );
  const limit = normalizeLimit(
    typeof query.limit === 'string' ? parseInt(query.limit, 10) : query.limit,
  );
  const skip = calculateSkip(page, limit);

  return { page, limit, skip };
}
