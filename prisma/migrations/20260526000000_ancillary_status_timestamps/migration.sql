ALTER TABLE "ancillary_order"
  ADD COLUMN "in_progress_at" TIMESTAMP(3),
  ADD COLUMN "completed_at" TIMESTAMP(3),
  ADD COLUMN "cancelled_at" TIMESTAMP(3);
