DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_enum enum_value
    JOIN pg_type enum_type ON enum_type.oid = enum_value.enumtypid
    WHERE enum_type.typname = 'LedgerType'
      AND enum_value.enumlabel = 'PAYMENT_RECEIVED'
  ) THEN
    ALTER TYPE "LedgerType" ADD VALUE 'PAYMENT_RECEIVED';
  END IF;
END
$$;
