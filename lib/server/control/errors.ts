/** Errors raised by the local control plane and their HTTP status. */

export class ControlError extends Error {
  readonly status: number;

  constructor(message: string, status = 400) {
    super(message);
    this.name = "ControlError";
    this.status = status;
  }
}

export function isControlError(error: unknown): error is ControlError {
  return error instanceof ControlError;
}
