-- One FIFO cost layer per source event (#206). addCostLayer used check-then-create, so two concurrent
-- retries of the same event could both add stock. Rows with a NULL referenceType/referenceId are
-- distinct in Postgres and never collide. If this fails, duplicate layers already exist: find them with
--   SELECT "organizationId","itemId","warehouseId","referenceType","referenceId",count(*)
--   FROM inventory_cost_layers WHERE "referenceId" IS NOT NULL GROUP BY 1,2,3,4,5 HAVING count(*) > 1;
-- and reconcile them against inventory levels before re-running.
CREATE UNIQUE INDEX "inventory_cost_layers_source_event_key"
  ON "inventory_cost_layers"("organizationId", "itemId", "warehouseId", "referenceType", "referenceId");
