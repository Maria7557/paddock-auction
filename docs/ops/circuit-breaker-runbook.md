# Circuit Breaker Runbook

## Purpose
Use the runtime breaker to stop new bidding traffic during incident response while preserving deterministic failure behavior.

## Breaker Key
- Redis key: `flags:disable_bidding`
- Allowed values: `true` or `false`

## Trip Conditions
Trip breaker when one or more are true for at least 5 minutes:
- Bid endpoint error rate exceeds `BID_ERROR_RATE_BREAKER_THRESHOLD_PCT`
- Repeated lock/contention storms causing user-impacting retries
- Repeated wallet mutation failures in bid/deadline/payment paths

## Activation Procedure
1. Set breaker flag:
```bash
redis-cli SET flags:disable_bidding true
```
2. Verify behavior:
- `POST /api/bids` returns `503`
- response error code: `BIDDING_DISABLED`
3. Announce incident state and freeze non-essential auction mutations.

## Stabilization Checklist
- Confirm DB and Redis health
- Confirm no migration drift
- Inspect lock contention profile on live auctions
- Validate Stripe webhook processor continues safe dedupe/no-op behavior

## Recovery Procedure
1. Confirm incident mitigated.
2. Reset breaker:
```bash
redis-cli SET flags:disable_bidding false
```
3. Verify `POST /api/bids` no longer returns `503` from breaker.
4. Monitor bid error rate and contention for 30 minutes.

## Rollback / Escalation
- If error rate re-spikes after reset, immediately set breaker to `true` again.
- Escalate to engineering incident owner and keep breaker active until root cause fix is verified.
