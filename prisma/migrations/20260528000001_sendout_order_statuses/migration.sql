-- Add send-out / molecular workflow statuses to the ancillary_order_status enum
ALTER TYPE "ancillary_order_status" ADD VALUE IF NOT EXISTS 'PULL_MATERIAL';
ALTER TYPE "ancillary_order_status" ADD VALUE IF NOT EXISTS 'MATERIAL_SENT';
ALTER TYPE "ancillary_order_status" ADD VALUE IF NOT EXISTS 'MATERIAL_RETURNED';
