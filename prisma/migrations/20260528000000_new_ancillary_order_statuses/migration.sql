-- AlterEnum: replace ancillary_order_status values with histology workflow statuses
BEGIN;
CREATE TYPE "ancillary_order_status_new" AS ENUM ('PULL_BLOCK', 'MICROTOMY', 'SLIDE_STAIN', 'DISTRIBUTED', 'CANCELLED');
-- Must drop the DEFAULT (which references the old type) before changing column type
ALTER TABLE "ancillary_order" ALTER COLUMN "status" DROP DEFAULT;
ALTER TABLE "ancillary_order"
  ALTER COLUMN "status" TYPE "ancillary_order_status_new"
  USING (
    CASE "status"::text
      WHEN 'PENDING'     THEN 'PULL_BLOCK'
      WHEN 'IN_PROGRESS' THEN 'MICROTOMY'
      WHEN 'COMPLETE'    THEN 'DISTRIBUTED'
      WHEN 'CANCELLED'   THEN 'CANCELLED'
      ELSE 'PULL_BLOCK'
    END
  )::"ancillary_order_status_new";
ALTER TABLE "ancillary_order" ALTER COLUMN "status" SET DEFAULT 'PULL_BLOCK'::"ancillary_order_status_new";
ALTER TYPE "ancillary_order_status" RENAME TO "ancillary_order_status_old";
ALTER TYPE "ancillary_order_status_new" RENAME TO "ancillary_order_status";
DROP TYPE "ancillary_order_status_old";
COMMIT;
