import { DomainConflictError } from "../../../lib/domain_errors";
import { bidErrorCodes } from "./bid_error_codes";

export class BidContentionConflictError extends DomainConflictError {
  readonly lockWaitMs: number;

  constructor(lockWaitMs: number) {
    super(bidErrorCodes.bidContentionConflict, "Bid contention conflict");
    this.lockWaitMs = lockWaitMs;
  }
}
