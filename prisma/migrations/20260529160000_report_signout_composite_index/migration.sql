-- Composite index supporting the "is this order signed out?" semi-join used
-- by every queue query (processing-queue, result-queue, histology-queue) and
-- by /api/orders/query. The existing UNIQUE(order_id, version_number) index
-- covers the order_id term but forces a heap fetch + filter on is_final and
-- signed_out_datetime for every order. This index lets postgres answer the
-- EXISTS check from the index alone.
CREATE INDEX "report_order_id_is_final_signed_out_datetime_idx"
  ON "report" ("order_id", "is_final", "signed_out_datetime");
