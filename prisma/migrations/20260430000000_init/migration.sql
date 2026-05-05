-- CreateTable
CREATE TABLE "doctor" (
    "doctor_id" BIGSERIAL NOT NULL,
    "last_name" VARCHAR(100) NOT NULL,
    "first_name" VARCHAR(100) NOT NULL,

    CONSTRAINT "doctor_pkey" PRIMARY KEY ("doctor_id")
);

-- CreateTable
CREATE TABLE "patient" (
    "patient_id" VARCHAR(50) NOT NULL,
    "last_name" VARCHAR(100) NOT NULL,
    "first_name" VARCHAR(100) NOT NULL,
    "date_of_birth" DATE NOT NULL,
    "sex" VARCHAR(20) NOT NULL,

    CONSTRAINT "patient_pkey" PRIMARY KEY ("patient_id")
);

-- CreateTable
CREATE TABLE "employee_role" (
    "employee_role_id" SERIAL NOT NULL,
    "role_name" VARCHAR(30) NOT NULL,

    CONSTRAINT "employee_role_pkey" PRIMARY KEY ("employee_role_id")
);

-- CreateTable
CREATE TABLE "employee" (
    "employee_id" BIGSERIAL NOT NULL,
    "last_name" VARCHAR(100) NOT NULL,
    "first_name" VARCHAR(100) NOT NULL,
    "user_name" VARCHAR(100) NOT NULL,
    "employee_role_id" INTEGER NOT NULL,
    "default_language" VARCHAR(10) NOT NULL DEFAULT 'en',

    CONSTRAINT "employee_pkey" PRIMARY KEY ("employee_id")
);

-- CreateTable
CREATE TABLE "body_site" (
    "body_site_id" SERIAL NOT NULL,
    "body_site_name" VARCHAR(255) NOT NULL,
    "description" TEXT,

    CONSTRAINT "body_site_pkey" PRIMARY KEY ("body_site_id")
);

-- CreateTable
CREATE TABLE "specimen_type" (
    "specimen_type_id" SERIAL NOT NULL,
    "specimen_type_name" VARCHAR(255) NOT NULL,
    "description" TEXT,

    CONSTRAINT "specimen_type_pkey" PRIMARY KEY ("specimen_type_id")
);

-- CreateTable
CREATE TABLE "report_template" (
    "report_template_id" SERIAL NOT NULL,
    "template_name" VARCHAR(255) NOT NULL,
    "template_text" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "report_template_pkey" PRIMARY KEY ("report_template_id")
);

-- CreateTable
CREATE TABLE "order_sequence_year" (
    "year_two_digit" INTEGER NOT NULL,
    "prefix" CHAR(2) NOT NULL,
    "last_value" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "order_sequence_year_pkey" PRIMARY KEY ("year_two_digit","prefix")
);

-- CreateTable
CREATE TABLE "orders" (
    "order_id" CHAR(11) NOT NULL,
    "patient_id" VARCHAR(50) NOT NULL,
    "doctor_id" BIGINT NOT NULL,
    "case_type" VARCHAR(50),
    "clinical_history" TEXT,
    "registered_date" TIMESTAMP(3) NOT NULL,
    "completed_date" TIMESTAMP(3),
    "is_reactivated" BOOLEAN NOT NULL DEFAULT false,
    "reactivated_from_report_id" BIGINT,

    CONSTRAINT "orders_pkey" PRIMARY KEY ("order_id")
);

-- CreateTable
CREATE TABLE "specimen" (
    "specimen_id" VARCHAR(20) NOT NULL,
    "order_id" CHAR(11) NOT NULL,
    "specimen_code" VARCHAR(10) NOT NULL,
    "body_site_id" INTEGER,
    "specimen_type_id" INTEGER,
    "cold_ischemic_time" INTEGER,

    CONSTRAINT "specimen_pkey" PRIMARY KEY ("specimen_id")
);

-- CreateTable
CREATE TABLE "block" (
    "block_id" VARCHAR(30) NOT NULL,
    "specimen_id" VARCHAR(20) NOT NULL,
    "block_number" INTEGER NOT NULL,
    "created_datetime" TIMESTAMP(3),

    CONSTRAINT "block_pkey" PRIMARY KEY ("block_id")
);

-- CreateTable
CREATE TABLE "slide" (
    "slide_id" VARCHAR(40) NOT NULL,
    "block_id" VARCHAR(30) NOT NULL,
    "slide_number" INTEGER NOT NULL,
    "slide_type" VARCHAR(50),

    CONSTRAINT "slide_pkey" PRIMARY KEY ("slide_id")
);

-- CreateTable
CREATE TABLE "report" (
    "report_id" BIGSERIAL NOT NULL,
    "order_id" CHAR(11) NOT NULL,
    "version_number" INTEGER NOT NULL,
    "diagnosis" TEXT,
    "comment" TEXT,
    "report_template_id" INTEGER,
    "gross" TEXT,
    "gross_payload" TEXT,
    "synoptic_data" TEXT,
    "synoptic_payload" TEXT,
    "pathologist_employee_id" BIGINT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "signed_out_datetime" TIMESTAMP(3),
    "is_final" BOOLEAN NOT NULL DEFAULT false,
    "is_prelim" BOOLEAN NOT NULL DEFAULT false,
    "reactivation_type" VARCHAR(20),
    "reactivation_reason" TEXT,
    "supersedes_report_id" BIGINT,

    CONSTRAINT "report_pkey" PRIMARY KEY ("report_id")
);

-- CreateTable
CREATE TABLE "report_file" (
    "report_file_id" BIGSERIAL NOT NULL,
    "report_id" BIGINT NOT NULL,
    "file_type" VARCHAR(50) NOT NULL,
    "file_name" VARCHAR(255),
    "original_file_name" VARCHAR(255),
    "mime_type" VARCHAR(100) NOT NULL DEFAULT 'application/pdf',
    "storage_path" VARCHAR(500),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "report_file_pkey" PRIMARY KEY ("report_file_id")
);

-- CreateIndex
CREATE UNIQUE INDEX "employee_role_role_name_key" ON "employee_role"("role_name");

-- CreateIndex
CREATE UNIQUE INDEX "employee_user_name_key" ON "employee"("user_name");

-- CreateIndex
CREATE UNIQUE INDEX "body_site_body_site_name_key" ON "body_site"("body_site_name");

-- CreateIndex
CREATE UNIQUE INDEX "specimen_type_specimen_type_name_key" ON "specimen_type"("specimen_type_name");

-- CreateIndex
CREATE UNIQUE INDEX "report_template_template_name_key" ON "report_template"("template_name");

-- CreateIndex
CREATE UNIQUE INDEX "specimen_order_id_specimen_code_key" ON "specimen"("order_id", "specimen_code");

-- CreateIndex
CREATE UNIQUE INDEX "block_specimen_id_block_number_key" ON "block"("specimen_id", "block_number");

-- CreateIndex
CREATE UNIQUE INDEX "slide_block_id_slide_number_key" ON "slide"("block_id", "slide_number");

-- CreateIndex
CREATE UNIQUE INDEX "report_order_id_version_number_key" ON "report"("order_id", "version_number");

-- CreateIndex
CREATE INDEX "report_file_report_id_file_type_created_at_idx" ON "report_file"("report_id", "file_type", "created_at");

-- AddForeignKey
ALTER TABLE "employee" ADD CONSTRAINT "employee_employee_role_id_fkey" FOREIGN KEY ("employee_role_id") REFERENCES "employee_role"("employee_role_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "orders" ADD CONSTRAINT "orders_patient_id_fkey" FOREIGN KEY ("patient_id") REFERENCES "patient"("patient_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "orders" ADD CONSTRAINT "orders_doctor_id_fkey" FOREIGN KEY ("doctor_id") REFERENCES "doctor"("doctor_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "orders" ADD CONSTRAINT "orders_reactivated_from_report_id_fkey" FOREIGN KEY ("reactivated_from_report_id") REFERENCES "report"("report_id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "specimen" ADD CONSTRAINT "specimen_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "orders"("order_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "specimen" ADD CONSTRAINT "specimen_body_site_id_fkey" FOREIGN KEY ("body_site_id") REFERENCES "body_site"("body_site_id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "specimen" ADD CONSTRAINT "specimen_specimen_type_id_fkey" FOREIGN KEY ("specimen_type_id") REFERENCES "specimen_type"("specimen_type_id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "block" ADD CONSTRAINT "block_specimen_id_fkey" FOREIGN KEY ("specimen_id") REFERENCES "specimen"("specimen_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "slide" ADD CONSTRAINT "slide_block_id_fkey" FOREIGN KEY ("block_id") REFERENCES "block"("block_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "report" ADD CONSTRAINT "report_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "orders"("order_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "report" ADD CONSTRAINT "report_report_template_id_fkey" FOREIGN KEY ("report_template_id") REFERENCES "report_template"("report_template_id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "report" ADD CONSTRAINT "report_pathologist_employee_id_fkey" FOREIGN KEY ("pathologist_employee_id") REFERENCES "employee"("employee_id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "report" ADD CONSTRAINT "report_supersedes_report_id_fkey" FOREIGN KEY ("supersedes_report_id") REFERENCES "report"("report_id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "report_file" ADD CONSTRAINT "report_file_report_id_fkey" FOREIGN KEY ("report_id") REFERENCES "report"("report_id") ON DELETE RESTRICT ON UPDATE CASCADE;

