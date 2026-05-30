-- Pessimistic edit-lock fields on orders.
-- Held by one user at a time while they are on the result page; cleared on
-- explicit release or when "editing_expires_at" elapses (the heartbeat from
-- the active client refreshes the lease).
ALTER TABLE "orders"
  ADD COLUMN "editing_employee_id" BIGINT,
  ADD COLUMN "editing_employee_name" VARCHAR(255),
  ADD COLUMN "editing_expires_at" TIMESTAMP(3);
