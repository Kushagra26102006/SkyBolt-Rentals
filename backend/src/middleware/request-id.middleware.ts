import { Response, NextFunction } from 'express';
import { randomUUID } from 'crypto';
import { RequestWithId } from '../types/api.types.js';

export function requestIdMiddleware(
  req: RequestWithId,
  res: Response,
  next: NextFunction
): void {
  const headerId = req.headers['x-request-id'];

  // Accept valid alphanumeric/UUID from client if provided, otherwise generate a secure UUIDv4
  const validIdPattern = /^[a-zA-Z0-9_-]{8,64}$/;
  const requestId =
    typeof headerId === 'string' && validIdPattern.test(headerId)
      ? headerId
      : randomUUID();

  req.id = requestId;
  req.startTime = Date.now();
  res.setHeader('X-Request-ID', requestId);

  next();
}
