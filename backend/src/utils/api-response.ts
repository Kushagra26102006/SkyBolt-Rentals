import { Response } from 'express';
import { ApiResponse } from '../types/api.types.js';

export function sendSuccess<T>(
  res: Response,
  data: T,
  statusCode = 200,
  message?: string
): Response {
  const payload: ApiResponse<T> = {
    success: true,
    data,
    ...(message ? { message } : {})
  };
  return res.status(statusCode).json(payload);
}
