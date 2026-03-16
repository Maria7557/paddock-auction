CREATE TABLE IF NOT EXISTS "password_reset_codes" (
  "id" TEXT NOT NULL,
  "user_id" TEXT NOT NULL,
  "email" TEXT NOT NULL,
  "code_hash" TEXT NOT NULL,
  "attempt_count" INTEGER NOT NULL DEFAULT 0,
  "expires_at" TIMESTAMPTZ(6) NOT NULL,
  "consumed_at" TIMESTAMPTZ(6),
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "password_reset_codes_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "password_reset_codes_user_id_fkey"
    FOREIGN KEY ("user_id") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS "password_reset_codes_user_id_idx"
  ON "password_reset_codes" ("user_id");

CREATE INDEX IF NOT EXISTS "password_reset_codes_email_idx"
  ON "password_reset_codes" ("email");

CREATE INDEX IF NOT EXISTS "password_reset_codes_email_consumed_created_idx"
  ON "password_reset_codes" ("email", "consumed_at", "created_at");
