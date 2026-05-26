-- CreateTable
CREATE TABLE "custom_template" (
    "id" TEXT NOT NULL,
    "template_key" VARCHAR(500) NOT NULL,
    "family" VARCHAR(100) NOT NULL,
    "kind" VARCHAR(20) NOT NULL,
    "schema_style" VARCHAR(20) NOT NULL,
    "title" VARCHAR(500) NOT NULL,
    "core_json" JSONB NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "custom_template_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "custom_template_translation" (
    "id" TEXT NOT NULL,
    "template_key" VARCHAR(500) NOT NULL,
    "language_code" VARCHAR(10) NOT NULL,
    "translation_json" JSONB NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "custom_template_translation_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "custom_template_template_key_key" ON "custom_template"("template_key");

-- CreateIndex
CREATE UNIQUE INDEX "custom_template_translation_template_key_language_code_key" ON "custom_template_translation"("template_key", "language_code");

-- AddForeignKey
ALTER TABLE "custom_template_translation" ADD CONSTRAINT "custom_template_translation_template_key_fkey" FOREIGN KEY ("template_key") REFERENCES "custom_template"("template_key") ON DELETE CASCADE ON UPDATE CASCADE;
