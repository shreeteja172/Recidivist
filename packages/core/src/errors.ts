export class HttpError extends Error {
  constructor(
    public status: 400 | 404 | 409 | 500,
    message: string,
    public details?: unknown,
  ) {
    super(message);
  }
}
