export abstract class DomainError extends Error {
  abstract readonly code: string;
  abstract readonly status: number;

  constructor(message: string) {
    super(message);
    this.name = this.constructor.name;
  }
}

export class DomainConflictError extends DomainError {
  readonly code: string;
  readonly status = 409;

  constructor(code: string, message: string) {
    super(message);
    this.code = code;
  }
}

export class DomainNotFoundError extends DomainError {
  readonly code: string;
  readonly status = 404;

  constructor(code: string, message: string) {
    super(message);
    this.code = code;
  }
}
