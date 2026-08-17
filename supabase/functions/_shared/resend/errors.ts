export class ResendError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly body: unknown = null,
  ) {
    super(message);
    this.name = "ResendError";
  }
}

export function isResendError(error: unknown): error is ResendError {
  return error instanceof ResendError;
}

// Same "hide 5xx behind a retry message, forward 4xx as-is" rule as
// userFacingPacMessage in _shared/facturama/errors.ts — a 5xx is Resend's
// own infra failing and isn't actionable by the user, a 4xx (invalid
// recipient, bad attachment, etc.) is usually specific and safe to forward.
export function userFacingResendMessage(error: ResendError, retryFallback: string): string {
  if (error.status >= 500) return retryFallback;
  return error.message;
}
