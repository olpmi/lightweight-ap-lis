/*
  Warnings:

  - The `default_language` column on the `employee` table would be dropped and recreated. This will lead to data loss if there is data in the column.
  - You are about to drop the column `synoptic_data` on the `report` table. All the data in the column will be lost.
  - The `reactivation_type` column on the `report` table would be dropped and recreated. This will lead to data loss if there is data in the column.
  - The `type` column on the `report_template` table would be dropped and recreated. This will lead to data loss if there is data in the column.
  - Added the required column `updated_at` to the `ancillary_order` table without a default value. This is not possible if the table is not empty.
  - Added the required column `updated_at` to the `block` table without a default value. This is not possible if the table is not empty.
  - Added the required column `updated_at` to the `orders` table without a default value. This is not possible if the table is not empty.
  - Changed the type of `sex` on the `patient` table. No cast exists, the column would be dropped and recreated, which cannot be done if there is data, since the column is required.
  - Added the required column `updated_at` to the `report` table without a default value. This is not possible if the table is not empty.
  - Changed the type of `file_type` on the `report_file` table. No cast exists, the column would be dropped and recreated, which cannot be done if there is data, since the column is required.
  - Changed the type of `report_type` on the `report_layout` table. No cast exists, the column would be dropped and recreated, which cannot be done if there is data, since the column is required.
  - Added the required column `updated_at` to the `slide` table without a default value. This is not possible if the table is not empty.
  - Added the required column `updated_at` to the `specimen` table without a default value. This is not possible if the table is not empty.

*/
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

-- AlterTable
ALTER TABLE "ancillary_order" ADD COLUMN     "updated_at" TIMESTAMP(3) NOT NULL;

-- AlterTable
ALTER TABLE "block" ADD COLUMN     "updated_at" TIMESTAMP(3) NOT NULL;

-- AlterTable
ALTER TABLE "employee" DROP COLUMN "default_language",
ADD COLUMN     "default_language" "app_language" NOT NULL DEFAULT 'en';

-- AlterTable
ALTER TABLE "orders" ADD COLUMN     "updated_at" TIMESTAMP(3) NOT NULL;

-- AlterTable
ALTER TABLE "patient" DROP COLUMN "sex",
ADD COLUMN     "sex" "sex" NOT NULL;

-- AlterTable
ALTER TABLE "report" DROP COLUMN "synoptic_data",
ADD COLUMN     "updated_at" TIMESTAMP(3) NOT NULL,
DROP COLUMN "reactivation_type",
ADD COLUMN     "reactivation_type" "reactivation_type";

-- AlterTable
ALTER TABLE "report_file" DROP COLUMN "file_type",
ADD COLUMN     "file_type" "report_file_type" NOT NULL;

-- AlterTable
ALTER TABLE "report_layout" DROP COLUMN "report_type",
ADD COLUMN     "report_type" "report_type" NOT NULL,
ALTER COLUMN "updated_at" DROP DEFAULT;

-- AlterTable
ALTER TABLE "report_template" DROP COLUMN "type",
ADD COLUMN     "type" "report_type" NOT NULL DEFAULT 'final';

-- AlterTable
ALTER TABLE "slide" ADD COLUMN     "updated_at" TIMESTAMP(3) NOT NULL;

-- AlterTable
ALTER TABLE "specimen" ADD COLUMN     "updated_at" TIMESTAMP(3) NOT NULL;

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

-- CreateIndex
CREATE INDEX "report_file_report_id_file_type_created_at_idx" ON "report_file"("report_id", "file_type", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "report_layout_report_type_key" ON "report_layout"("report_type");

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
