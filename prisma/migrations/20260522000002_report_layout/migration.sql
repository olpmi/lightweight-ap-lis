CREATE TABLE "report_layout" (
  "report_layout_id" SERIAL PRIMARY KEY,
  "report_type"      VARCHAR(20)  NOT NULL UNIQUE,
  "name"             VARCHAR(255) NOT NULL,
  "html_template"    TEXT         NOT NULL,
  "is_active"        BOOLEAN      NOT NULL DEFAULT true,
  "created_at"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);