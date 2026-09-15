import crypto from 'crypto';

/**
 * Centralized Type-Safe Cache Key Generators
 * Uses explicit namespacing and version prefixes to prevent collision or stale schema parsing.
 */
export const cacheKeys = {
  // Vehicle single detail
  vehicle: (id: string): string => `v1:vehicle:${id}`,
  vehicleByCode: (code: string): string => `v1:vehicle:code:${code.toUpperCase()}`,

  // Vehicle catalog queries
  vehicleCatalog: (query: Record<string, any>): string => {
    const serialized = Object.keys(query)
      .sort()
      .map((k) => `${k}=${String(query[k])}`)
      .join('&');
    const hash = crypto.createHash('md5').update(serialized || 'all').digest('hex').slice(0, 16);
    return `v1:vehicles:catalog:${hash}`;
  },

  // Vehicle static categories
  vehicleCategories: (): string => 'v1:vehicles:categories',

  // Review aggregate summaries
  reviewSummary: (vehicleId: string): string => `v1:reviews:summary:${vehicleId}`,

  // Public reviews paginated list
  reviewsList: (vehicleId: string, page: number, limit: number, sort: string, rating?: number): string => {
    return `v1:reviews:list:${vehicleId}:p${page}:l${limit}:s${sort}:r${rating || 'all'}`;
  },

  // Hubs
  hubsAll: (): string => 'v1:hubs:all',
  hub: (id: string): string => `v1:hub:${id}`,

  // Distributed locks
  lock: (resource: string): string => `v1:lock:${resource}`,

  // Patterns for bulk invalidations
  patterns: {
    vehicleCatalog: (): string => 'v1:vehicles:catalog:*',
    vehicleReviews: (vehicleId: string): string => `v1:reviews:list:${vehicleId}:*`
  }
};
