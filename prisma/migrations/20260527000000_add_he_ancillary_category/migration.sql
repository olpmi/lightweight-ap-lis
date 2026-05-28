-- AlterEnum: add HE value to ancillary_category
BEGIN;
CREATE TYPE "ancillary_category_new" AS ENUM ('HE_LEVELS', 'IHC', 'SPECIAL_STAIN', 'MOLECULAR', 'SEND_OUT', 'HE');
ALTER TABLE "ancillary_orderable" ALTER COLUMN "category" TYPE "ancillary_category_new" USING ("category"::text::"ancillary_category_new");
ALTER TABLE "ancillary_panel" ALTER COLUMN "category" TYPE "ancillary_category_new" USING ("category"::text::"ancillary_category_new");
ALTER TYPE "ancillary_category" RENAME TO "ancillary_category_old";
ALTER TYPE "ancillary_category_new" RENAME TO "ancillary_category";
DROP TYPE "ancillary_category_old";
COMMIT;

-- Insert the default H&E Staining orderable (idempotent)
INSERT INTO "ancillary_orderable" ("name", "category", "is_active", "sort_order")
VALUES ('H&E Staining', 'HE', true, 0)
ON CONFLICT ("name", "category") DO NOTHING;

-- Backfill: create PENDING HE orders for all existing blocks that don't already have one
INSERT INTO "ancillary_order" ("order_id", "block_id", "orderable_id", "status", "ordered_at")
SELECT s."order_id", b."block_id", o."id", 'PENDING'::"ancillary_order_status", NOW()
FROM "block" b
JOIN "specimen" s ON b."specimen_id" = s."specimen_id"
CROSS JOIN (
  SELECT "id" FROM "ancillary_orderable" WHERE "name" = 'H&E Staining' AND "category" = 'HE'
) o
WHERE NOT EXISTS (
  SELECT 1 FROM "ancillary_order" ao
  JOIN "ancillary_orderable" ao2 ON ao."orderable_id" = ao2."id"
  WHERE ao."block_id" = b."block_id" AND ao2."category" = 'HE'
);
