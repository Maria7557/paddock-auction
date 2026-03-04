import { DomainError } from "../../../lib/domain_errors";

export class BillingUpstreamError extends DomainError {
  readonly code: string;
  readonly status = 503;

  constructor(code: string, message: string) {
    super(message);
    this.code = code;
  }
}
