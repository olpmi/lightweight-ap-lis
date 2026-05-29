-- This migration is safe to run on tables that contain data:
--   * New `updated_at` columns are added with a DEFAULT CURRENT_TIMESTAMP so
--     existing rows get a value; the default is then dropped to match Prisma's
--     @updatedAt semantics (app-managed timestamp on every write).
--   * Enum migrations on existing string columns use ALTER COLUMN ... TYPE ...
--     USING (col::text::enum_type), preserving existing values that already
--     match an enum label. Defaults are dropped before the type change and
--     restored after, because PostgreSQL otherwise refuses to alter a column
--     whose DEFAULT still references the prior type.
--   * `report.synoptic_data` is dropped (replaced by `synopticPayload`); if you
--     need to preserve historical values, copy them out before applying.

-- CreateEnum
CREATE TYPE "sex" AS ENUM ('Male', 'Female', 'Other', 'Unknown');

-- CreateEnum
CREATE TYPE "app_language" AS ENUM ('en', 'fr', 'ar', 'ur', 'sw');

-- CreateEnum
CREATE TYPE "report_type" AS ENUM ('final', 'preliminary', 'addendum', 'revision');

-- CreateEnum
CREATE TYPE "reactivation_type" AS ENUM ('revise', 'addend');

-- CreateEnum
CREATE TYPE "report_file_type" AS ENUM ('report_pdf', 'prelim_pdf', 'amended_pdf');

-- DropForeignKey
ALTER TABLE "ancillary_order" DROP CONSTRAINT "ancillary_order_block_id_fkey";

-- DropForeignKey
ALTER TABLE "ancillary_order" DROP CONSTRAINT "ancillary_order_order_id_fkey";

-- DropForeignKey
ALTER TABLE "block" DROP CONSTRAINT "block_specimen_id_fkey";

-- DropForeignKey
ALTER TABLE "report_file" DROP CONSTRAINT "report_file_report_id_fkey";

-- DropForeignKey
ALTER TABLE "slide" DROP CONSTRAINT "slide_block_id_fkey";

-- DropForeignKey
ALTER TABLE "specimen" DROP CONSTRAINT "specimen_order_id_fkey";

-- AlterTable: ancillary_order — add updated_at safely
ALTER TABLE "ancillary_order" ADD COLUMN "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE "ancillary_order" ALTER COLUMN "updated_at" DROP DEFAULT;

-- AlterTable: block — add updated_at safely
ALTER TABLE "block" ADD COLUMN "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE "block" ALTER COLUMN "updated_at" DROP DEFAULT;

-- AlterTable: employee.default_language — convert to enum, preserving existing values
ALTER TABLE "employee" ALTER COLUMN "default_language" DROP DEFAULT;
ALTER TABLE "employee"
  ALTER COLUMN "default_language" TYPE "app_language"
  USING ("default_language"::text::"app_language");
ALTER TABLE "employee" ALTER COLUMN "default_language" SET DEFAULT 'en';

-- AlterTable: orders — add updated_at safely
ALTER TABLE "orders" ADD COLUMN "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE "orders" ALTER COLUMN "updated_at" DROP DEFAULT;

-- AlterTable: patient.sex — convert to enum, preserving existing values
ALTER TABLE "patient"
  ALTER COLUMN "sex" TYPE "sex"
  USING ("sex"::text::"sex");

-- AlterTable: report — drop synoptic_data, add updated_at, convert reactivation_type to enum
ALTER TABLE "report" DROP COLUMN "synoptic_data";
ALTER TABLE "report" ADD COLUMN "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE "report" ALTER COLUMN "updated_at" DROP DEFAULT;
ALTER TABLE "report"
  ALTER COLUMN "reactivation_type" TYPE "reactivation_type"
  USING ("reactivation_type"::text::"reactivation_type");

-- AlterTable: report_file.file_type — convert to enum
ALTER TABLE "report_file"
  ALTER COLUMN "file_type" TYPE "report_file_type"
  USING ("file_type"::text::"report_file_type");

-- AlterTable: report_layout.report_type — convert to enum, drop stale default on updated_at
ALTER TABLE "report_layout"
  ALTER COLUMN "report_type" TYPE "report_type"
  USING ("report_type"::text::"report_type");
ALTER TABLE "report_layout" ALTER COLUMN "updated_at" DROP DEFAULT;

-- AlterTable: report_template.type — convert to enum, preserving default
ALTER TABLE "report_template" ALTER COLUMN "type" DROP DEFAULT;
ALTER TABLE "report_template"
  ALTER COLUMN "type" TYPE "report_type"
  USING ("type"::text::"report_type");
ALTER TABLE "report_template" ALTER COLUMN "type" SET DEFAULT 'final';

-- AlterTable: slide — add updated_at safely
ALTER TABLE "slide" ADD COLUMN "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE "slide" ALTER COLUMN "updated_at" DROP DEFAULT;

-- AlterTable: specimen — add updated_at safely
ALTER TABLE "specimen" ADD COLUMN "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE "specimen" ALTER COLUMN "updated_at" DROP DEFAULT;

-- CreateIndex
CREATE INDEX "ancillary_order_order_id_idx" ON "ancillary_order"("order_id");

-- CreateIndex
CREATE INDEX "ancillary_order_block_id_idx" ON "ancillary_order"("block_id");

-- CreateIndex
CREATE INDEX "ancillary_order_orderable_id_idx" ON "ancillary_order"("orderable_id");

-- CreateIndex
CREATE INDEX "ancillary_order_ordered_by_id_idx" ON "ancillary_order"("ordered_by_id");

-- CreateIndex
CREATE INDEX "ancillary_order_status_ordered_at_idx" ON "ancillary_order"("status", "ordered_at");

-- CreateIndex
CREATE INDEX "ancillary_panel_item_orderable_id_idx" ON "ancillary_panel_item"("orderable_id");

-- CreateIndex
CREATE INDEX "employee_employee_role_id_idx" ON "employee"("employee_role_id");

-- CreateIndex
CREATE INDEX "orders_patient_id_idx" ON "orders"("patient_id");

-- CreateIndex
CREATE INDEX "orders_doctor_id_idx" ON "orders"("doctor_id");

-- CreateIndex
CREATE INDEX "orders_reactivated_from_report_id_idx" ON "orders"("reactivated_from_report_id");

-- CreateIndex
CREATE INDEX "orders_registered_date_idx" ON "orders"("registered_date");

-- CreateIndex
CREATE INDEX "report_report_template_id_idx" ON "report"("report_template_id");

-- CreateIndex
CREATE INDEX "report_pathologist_employee_id_idx" ON "report"("pathologist_employee_id");

-- CreateIndex
CREATE INDEX "report_supersedes_report_id_idx" ON "report"("supersedes_report_id");

-- report_file_report_id_file_type_created_at_idx was already created by 20260430000000_init.

-- report_layout_report_type_key is created implicitly by the UNIQUE constraint in
-- 20260522000002_report_layout.

-- CreateIndex
CREATE INDEX "specimen_body_site_id_idx" ON "specimen"("body_site_id");

-- CreateIndex
CREATE INDEX "specimen_specimen_type_id_idx" ON "specimen"("specimen_type_id");

-- AddForeignKey
ALTER TABLE "specimen" ADD CONSTRAINT "specimen_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "orders"("order_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "block" ADD CONSTRAINT "block_specimen_id_fkey" FOREIGN KEY ("specimen_id") REFERENCES "specimen"("specimen_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "slide" ADD CONSTRAINT "slide_block_id_fkey" FOREIGN KEY ("block_id") REFERENCES "block"("block_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "report_file" ADD CONSTRAINT "report_file_report_id_fkey" FOREIGN KEY ("report_id") REFERENCES "report"("report_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ancillary_order" ADD CONSTRAINT "ancillary_order_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "orders"("order_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ancillary_order" ADD CONSTRAINT "ancillary_order_block_id_fkey" FOREIGN KEY ("block_id") REFERENCES "block"("block_id") ON DELETE CASCADE ON UPDATE CASCADE;
