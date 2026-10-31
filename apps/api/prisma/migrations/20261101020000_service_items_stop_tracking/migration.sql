-- Only goods hold stock: items.service sets "trackInventory" from the type since f093f433, but
-- service and digital items created before that (or imported) kept the old default of true.
-- Turn it off for them. The item type is stored evidence, so this guesses nothing. Items that
-- somehow carry stock or movements are left alone for a person to review, so stock reports and
-- the inventory ledger keep agreeing. Idempotent: a second run matches no rows.
UPDATE "items" AS i
SET "trackInventory" = false,
    "updatedAt" = CURRENT_TIMESTAMP
WHERE i."type" IN ('SERVICE', 'DIGITAL')
  AND i."trackInventory" = true
  AND i."currentStock" = 0
  AND NOT EXISTS (SELECT 1 FROM "inventory_movements" m WHERE m."itemId" = i."id");
