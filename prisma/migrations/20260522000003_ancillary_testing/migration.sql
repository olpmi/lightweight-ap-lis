-- CreateEnum
CREATE TYPE "ancillary_category" AS ENUM ('HE_LEVELS', 'IHC', 'SPECIAL_STAIN', 'MOLECULAR', 'SEND_OUT');

-- CreateEnum
CREATE TYPE "ancillary_order_status" AS ENUM ('PENDING', 'IN_PROGRESS', 'COMPLETE', 'CANCELLED');

-- CreateTable
CREATE TABLE "ancillary_orderable" (
    "id" SERIAL NOT NULL,
    "name" VARCHAR(200) NOT NULL,
    "category" "ancillary_category" NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "sort_order" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "ancillary_orderable_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ancillary_panel" (
    "id" SERIAL NOT NULL,
    "name" VARCHAR(200) NOT NULL,
    "category" "ancillary_category" NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "sort_order" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "ancillary_panel_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ancillary_panel_item" (
    "panel_id" INTEGER NOT NULL,
    "orderable_id" INTEGER NOT NULL,

    CONSTRAINT "ancillary_panel_item_pkey" PRIMARY KEY ("panel_id","orderable_id")
);

-- CreateTable
CREATE TABLE "ancillary_order" (
    "id" SERIAL NOT NULL,
    "order_id" CHAR(11) NOT NULL,
    "block_id" VARCHAR(30) NOT NULL,
    "orderable_id" INTEGER NOT NULL,
    "status" "ancillary_order_status" NOT NULL DEFAULT 'PENDING',
    "level_count" INTEGER,
    "notes" TEXT,
    "result_notes" TEXT,
    "ordered_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "ordered_by_id" BIGINT,

    CONSTRAINT "ancillary_order_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ancillary_orderable_name_category_key" ON "ancillary_orderable"("name", "category");

-- CreateIndex
CREATE UNIQUE INDEX "ancillary_panel_name_category_key" ON "ancillary_panel"("name", "category");

-- AddForeignKey
ALTER TABLE "ancillary_panel_item" ADD CONSTRAINT "ancillary_panel_item_panel_id_fkey"
    FOREIGN KEY ("panel_id") REFERENCES "ancillary_panel"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ancillary_panel_item" ADD CONSTRAINT "ancillary_panel_item_orderable_id_fkey"
    FOREIGN KEY ("orderable_id") REFERENCES "ancillary_orderable"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ancillary_order" ADD CONSTRAINT "ancillary_order_order_id_fkey"
    FOREIGN KEY ("order_id") REFERENCES "orders"("order_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ancillary_order" ADD CONSTRAINT "ancillary_order_block_id_fkey"
    FOREIGN KEY ("block_id") REFERENCES "block"("block_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ancillary_order" ADD CONSTRAINT "ancillary_order_orderable_id_fkey"
    FOREIGN KEY ("orderable_id") REFERENCES "ancillary_orderable"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ancillary_order" ADD CONSTRAINT "ancillary_order_ordered_by_id_fkey"
    FOREIGN KEY ("ordered_by_id") REFERENCES "employee"("employee_id") ON DELETE SET NULL ON UPDATE CASCADE;
