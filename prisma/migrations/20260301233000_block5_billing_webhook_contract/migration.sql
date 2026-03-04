DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_enum enum_value
    JOIN pg_type enum_type ON enum_type.oid = enum_value.enumtypid
    WHERE enum_type.typname = 'PaymentDeadlineStatus'
      AND enum_value.enumlabel = 'PAID'
  ) THEN
    ALTER TYPE "PaymentDeadlineStatus" ADD VALUE 'PAID';
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'payments_invoice_idempotency_key_unique'
  ) THEN
    ALTER TABLE "payments"
    ADD CONSTRAINT "payments_invoice_idempotency_key_unique"
    UNIQUE ("invoice_id", "idempotency_key");
  END IF;
END $$;
