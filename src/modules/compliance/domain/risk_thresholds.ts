export type RiskTier = "low" | "medium" | "high" | "critical";

export interface RiskScoreThresholds {
  readonly low_max: number;
  readonly medium_max: number;
  readonly high_max: number;
  readonly critical_min: number;
}

export interface AmlTriggerThresholds {
  readonly large_transaction_amount_aed: number;
  readonly suspicious_behavior_score: number;
  readonly repeated_default_count_30d: number;
}

export const RISK_SCORE_THRESHOLDS: RiskScoreThresholds = {
  low_max: 29,
  medium_max: 59,
  high_max: 79,
  critical_min: 80,
} as const;

export const AML_TRIGGER_THRESHOLDS: AmlTriggerThresholds = {
  large_transaction_amount_aed: 250000,
  suspicious_behavior_score: 85,
  repeated_default_count_30d: 2,
} as const;
