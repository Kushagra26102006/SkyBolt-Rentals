import { z } from 'zod';

export const commonSchemas = {
  idParam: z.object({
    id: z.string().min(1, 'ID parameter is required')
  }),
  paginationQuery: z.object({
    page: z
      .string()
      .optional()
      .transform((val) => (val ? Math.max(1, parseInt(val, 10)) : 1)),
    limit: z
      .string()
      .optional()
      .transform((val) => (val ? Math.min(100, Math.max(1, parseInt(val, 10))) : 20))
  })
};
