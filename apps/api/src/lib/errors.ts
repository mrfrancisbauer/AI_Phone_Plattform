/** Typed HTTP errors so route handlers can throw and a single error handler
 * maps them to status codes without leaking internals. */
export class HttpError extends Error {
  constructor(
    public statusCode: number,
    public override message: string,
    public code: string = 'error',
  ) {
    super(message);
    this.name = 'HttpError';
  }
}

export const badRequest = (msg: string) => new HttpError(400, msg, 'bad_request');
export const unauthorized = (msg = 'Unauthorized') => new HttpError(401, msg, 'unauthorized');
export const forbidden = (msg = 'Forbidden') => new HttpError(403, msg, 'forbidden');
export const notFound = (msg = 'Not found') => new HttpError(404, msg, 'not_found');
export const conflict = (msg: string) => new HttpError(409, msg, 'conflict');
export const tooManyRequests = (msg = 'Rate limit exceeded') =>
  new HttpError(429, msg, 'rate_limited');
