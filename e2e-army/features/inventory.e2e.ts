// Inventory features: items, warehouses, adjustments, transfers, price lists, composite items, movements and stock levels.
//   shards ui-inventory / ui-stock-extras : browser tests on the seeded demo org
//   shard  inventory-api                  : request-level tests on fresh tenants (stock + ledger move together, isolation)
import { test } from "@e2e-dev/web";
import { expect } from "e2e";
import { needsModel } from "../lib.ts";
import { DATE, acct, adminApi, anon, dec, h1, ids, journalOf, ledgerTenant, lineSig, rows, seeded, signIn, stockedItem, subDec, tenant } from "./_mz.e2e.ts";

const A = () => ledgerTenant("inventory");
const B = () => ledgerTenant("inventory-b");

async function arabic({ app, screen, browser }: any, path: string, title?: string) {
  await app.open(path);
  if (title) await expect(h1(screen, title)).toBeVisible({ timeout: 60_000 });
  await expect.poll(() => browser.evaluate(() => document.documentElement.dir)).toBe("rtl");
}

// ───────────────────────────────────────────── ui ─────────────────────────────────────────────
test("[mz-items.1] create an inventory item through the form and find it in the items list", { tags: ["feat:mz-items", "shard:ui-inventory", "lvl:ui"] }, async (fx) => {
  needsModel();
  const { app, agent, screen } = fx;
  const name = seeded("Item"), sku = seeded("SKU-UI").toUpperCase();
  await signIn(fx, "/en/inventory/items/new");
  await expect(h1(screen, "New Item")).toBeVisible({ timeout: 90_000 });
  await agent.act("fill the new item form: name {name}, SKU {sku}, type Goods (if a type must be chosen), selling price 100, then press the save / create button. The step is complete once save was pressed, even if the app then shows another page", { params: { name, sku }, maxModelCalls: 16 });
  const api = await adminApi();
  await expect.poll(async () => rows(await api.get("/items", { search: sku })).some((i) => i.sku === sku && i.name === name && dec(i.sellingPrice) === "100"), { timeout: 30_000 }).toBe(true);
  await app.open("/en/inventory/items");
  await expect(h1(screen, "Items")).toBeVisible({ timeout: 60_000 });
  await agent.waitFor("the items table has finished loading and lists items such as 'Laptop Pro 15\"' and 'USB-C Cable' with SKUs and prices");
  await arabic(fx, "/ar/inventory/items", "الأصناف");
});

test("[mz-warehouses.1] create a warehouse through the form and find it in the warehouses list", { tags: ["feat:mz-warehouses", "shard:ui-inventory", "lvl:ui"] }, async (fx) => {
  needsModel();
  const { app, agent, screen } = fx;
  const code = seeded("WH-UI", 4), name = seeded("Warehouse UI");
  await signIn(fx, "/en/inventory/warehouses/new");
  await expect(h1(screen, "New Warehouse")).toBeVisible({ timeout: 90_000 });
  await agent.act("fill the new warehouse form with the code {code} and the name {name}, then press the save / create button. The step is complete once save was pressed, even if the app then shows another page", { params: { code, name }, maxModelCalls: 12 });
  const api = await adminApi();
  await expect.poll(async () => rows(await api.get("/warehouses", { search: code })).some((w) => w.code === code && w.name === name), { timeout: 30_000 }).toBe(true);
  await app.open("/en/inventory/warehouses");
  await expect(h1(screen, "Warehouses")).toBeVisible({ timeout: 60_000 });
  await agent.waitFor("the warehouses list has finished loading and lists 'Main Warehouse' (WH-MAIN) and 'North Center' (WH-NORTH)");
  await arabic(fx, "/ar/inventory/warehouses", "المستودعات");
});

test("[mz-stock-adjustments.1] the inventory adjustments list shows the seeded adjustment and the new adjustment form opens", { tags: ["feat:mz-stock-adjustments", "shard:ui-inventory", "lvl:ui"] }, async (fx) => {
  needsModel();
  const { app, agent, screen } = fx;
  await signIn(fx, "/en/inventory/adjustments");
  await expect(h1(screen, "Inventory Adjustments")).toBeVisible({ timeout: 90_000 });
  await agent.waitFor("the adjustments table has finished loading and lists at least one adjustment with a number, an item and a quantity");
  await app.open("/en/inventory/adjustments/new");
  await expect(h1(screen, "New Adjustment")).toBeVisible({ timeout: 60_000 });
  await agent.assert("an adjustment form is shown with a warehouse, an item, an increase/decrease type, a quantity, a reason and an adjustment account");
  await arabic(fx, "/ar/inventory/adjustments", "تسويات المخزون");
});

test("[mz-stock-transfers.1] the stock transfers list shows the seeded transfer and the new transfer form opens", { tags: ["feat:mz-stock-transfers", "shard:ui-inventory", "lvl:ui"] }, async (fx) => {
  needsModel();
  const { app, agent, screen } = fx;
  await signIn(fx, "/en/inventory/transfers");
  await expect(h1(screen, "Stock Transfers")).toBeVisible({ timeout: 90_000 });
  await agent.waitFor("the transfers table has finished loading and lists at least one transfer with a number, source and destination warehouses and a status");
  await app.open("/en/inventory/transfers/new");
  await expect(h1(screen, "New Transfer")).toBeVisible({ timeout: 60_000 });
  await agent.assert("a transfer form is shown with a source warehouse, a destination warehouse, a date and item lines with quantities");
  await arabic(fx, "/ar/inventory/transfers", "تحويلات المخزون");
});

test("[mz-price-lists.1] the price lists page shows the seeded VIP price list and the new price list form opens", { tags: ["feat:mz-price-lists", "shard:ui-stock-extras", "lvl:ui"] }, async (fx) => {
  needsModel();
  const { app, agent, screen } = fx;
  await signIn(fx, "/en/inventory/price-lists");
  await expect(h1(screen, "Price Lists")).toBeVisible({ timeout: 90_000 });
  await agent.waitFor("the price lists have finished loading and 'VIP Customer Pricing' is listed");
  await app.open("/en/inventory/price-lists/new");
  await expect(h1(screen, "New Price List")).toBeVisible({ timeout: 60_000 });
  await arabic(fx, "/ar/inventory/price-lists", "قوائم الأسعار");
});

test("[mz-composite-items.1] the composite items page shows the seeded Workstation Bundle with its components", { tags: ["feat:mz-composite-items", "shard:ui-stock-extras", "lvl:ui"] }, async (fx) => {
  needsModel();
  const { app, agent, screen } = fx;
  await signIn(fx, "/en/inventory/composite-items");
  await expect(h1(screen, "Composite Items")).toBeVisible({ timeout: 90_000 });
  await agent.waitFor("the composite items list has finished loading and 'Workstation Bundle' (BUNDLE-001) is listed");
  await app.open("/en/inventory/composite-items/new");
  await expect(h1(screen, "New Composite Item")).toBeVisible({ timeout: 60_000 });
  await arabic(fx, "/ar/inventory/composite-items"); // hard-coded English titles: only the layout direction is checked
});

test("[mz-stock-movements.1] the inventory movements page lists the seeded stock movements", { tags: ["feat:mz-stock-movements", "shard:ui-stock-extras", "lvl:ui"] }, async (fx) => {
  needsModel();
  const { agent, screen } = fx;
  await signIn(fx, "/en/inventory/movements");
  await expect(h1(screen, "Inventory Movements")).toBeVisible({ timeout: 90_000 });
  await agent.waitFor("the movements table has finished loading and lists stock movements with items, warehouses, quantities and in/out types");
  await arabic(fx, "/ar/inventory/movements");
});

// ───────────────────────────────────────────── api ─────────────────────────────────────────────
test("[mz-items.2] item API: create, unique SKU, validation, opening-stock rule, update, delete rules, valuation, isolation", { tags: ["feat:mz-items", "shard:inventory-api", "lvl:api"] }, async () => {
  const a = await A(), b = await B();
  expect((await anon.get("/items")).status).toBe(401);
  expect((await anon.post("/items", {})).status).toBe(401);
  const sku = seeded("SKU-API").toUpperCase();
  const body = { name: seeded("Item API"), sku, type: "GOODS", unit: "PCS", sellingPrice: "100.00", costPrice: "60.25", reorderPoint: 3 };
  const created = await a.api.post("/items", body);
  expect(created.status).toBe(201);
  expect(created.body).toMatchObject({ sku, type: "GOODS", currentStock: 0 });
  expect([dec(created.body.sellingPrice), dec(created.body.costPrice)]).toEqual(["100", "60.25"]);
  const id = created.body.id as string;
  expect((await a.api.post("/items", body)).status).toBe(409); // SKU is unique per organization
  expect((await b.api.post("/items", body)).status).toBe(201); // ...but free in another organization
  expect((await a.api.post("/items", { ...body, sku: seeded("SKU-2").toUpperCase(), type: "NOPE" })).status).toBe(400);
  expect((await a.api.post("/items", { ...body, sku: seeded("SKU-3").toUpperCase(), name: "" })).status).toBe(400);
  expect((await a.api.post("/items", { ...body, sku: seeded("SKU-4").toUpperCase(), sellingPrice: "abc" })).status).toBe(400);
  expect((await a.api.post("/items", { ...body, sku: seeded("SKU-5").toUpperCase(), openingStock: 5 })).status).toBe(400); // stock enters through an adjustment so the ledger agrees
  expect((await a.api.post("/items", { ...body, sku: seeded("SKU-6").toUpperCase(), inventoryAccountId: b.chart.cash })).status).toBe(400); // another tenant's account

  await expect.poll(async () => ids(await a.api.get("/items", { search: sku })), { timeout: 20_000 }).toContain(id);
  expect((await a.api.get(`/items/${id}`)).body.name).toBe(body.name);
  const upd = await a.api.patch(`/items/${id}`, { sellingPrice: "120.50", name: `${body.name} v2` });
  expect(upd.status).toBe(200);
  expect(dec(upd.body.sellingPrice)).toBe("120.5");
  expect((await a.api.patch(`/items/${id}`, { sku: "SKU-OF-ANOTHER" })).status).toBe(200);
  // tenant isolation
  expect((await b.api.get(`/items/${id}`)).status).toBe(404);
  expect((await b.api.patch(`/items/${id}`, { name: "Hijacked" })).status).toBe(404);
  expect((await b.api.del(`/items/${id}`)).status).toBe(404);
  expect(ids(await b.api.get("/items", { limit: 100 }))).not.toContain(id);

  // valuation follows real stock: 10 units at 60.25
  const stocked = await stockedItem(a, "valuation", 10, "60.25");
  const valuation = await a.api.get(`/items/${stocked.itemId}/valuation`);
  expect(valuation.status).toBe(200);
  expect(JSON.stringify(valuation.body)).toContain("602.5");
  expect((await a.api.get("/items/valuation")).status).toBe(200);
  expect((await a.api.get("/items/cursor", { take: 2 })).status).toBe(200);
  expect((await a.api.del(`/items/${id}`)).status).toBe(200);
  expect((await a.api.get(`/items/${id}`)).status).toBe(404);
});

test("[mz-warehouses.2] warehouse API: create, unique code, update, stock listing, delete rules, isolation", { tags: ["feat:mz-warehouses", "shard:inventory-api", "lvl:api"] }, async () => {
  const a = await A(), b = await B();
  expect((await anon.get("/warehouses")).status).toBe(401);
  const code = seeded("WH-API", 4);
  const created = await a.api.post("/warehouses", { code, name: seeded("Warehouse API"), address: "1 Nile Street" });
  expect(created.status).toBe(201);
  const id = created.body.id as string;
  expect((await a.api.post("/warehouses", { code, name: "again" })).status).toBe(409);
  expect((await b.api.post("/warehouses", { code, name: seeded("Warehouse API B") })).status).toBe(201);
  expect((await a.api.post("/warehouses", { name: "no code" })).status).toBe(400);
  expect((await a.api.post("/warehouses", { code: "C".repeat(21), name: "too long code" })).status).toBe(400);
  expect((await a.api.patch(`/warehouses/${id}`, { name: "Renamed warehouse" })).body.name).toBe("Renamed warehouse");
  await expect.poll(async () => ids(await a.api.get("/warehouses", { search: code })), { timeout: 20_000 }).toContain(id);
  expect((await b.api.get(`/warehouses/${id}`)).status).toBe(404);
  expect((await b.api.patch(`/warehouses/${id}`, { name: "Hijacked" })).status).toBe(404);
  expect((await b.api.del(`/warehouses/${id}`)).status).toBe(404);

  // a warehouse that moved stock cannot be deleted; its stock listing shows the item
  const stocked = await stockedItem(a, "wh-stock", 4);
  const stock = await a.api.get(`/warehouses/${stocked.warehouseId}/stock`);
  expect(stock.status).toBe(200);
  expect(JSON.stringify(stock.body)).toContain(stocked.sku);
  const refused = await a.api.del(`/warehouses/${stocked.warehouseId}`);
  expect(refused.status).toBe(400);
  expect(refused.body.message).toMatch(/movements/i);
  expect((await a.api.del(`/warehouses/${id}`)).status).toBe(200);
  expect((await a.api.get(`/warehouses/${id}`)).status).toBe(404);
});

test("[mz-stock-adjustments.2] adjustment API: stock and one balanced journal move together, exact value, void restores, guards, isolation", { tags: ["feat:mz-stock-adjustments", "shard:inventory-api", "lvl:api"] }, async () => {
  const a = await A(), b = await B();
  expect((await anon.get("/inventory-adjustments")).status).toBe(401);
  const s = await stockedItem(a, "adj", 10, "60.25");
  const stockOf = async () => Number((await a.api.get(`/items/${s.itemId}`)).body.currentStock);
  expect(await stockOf()).toBe(10);
  const payload = (over: Record<string, unknown> = {}) => ({ date: DATE.doc, warehouseId: s.warehouseId, itemId: s.itemId, type: "DECREASE", quantity: 3, reason: "DAMAGED", accountId: s.shrinkageAccountId, ...over });

  const shrink0 = await acct(a.api, s.shrinkageAccountId), inv0 = await acct(a.api, s.inventoryAccountId);
  const dec3 = await a.api.post("/inventory-adjustments", payload());
  expect(dec3.status).toBe(201);
  expect(dec3.body.status).toBe("POSTED");
  expect(dec3.body.adjustmentNumber).toMatch(/^ADJ-\d+$/);
  expect(dec(dec3.body.value)).toBe("180.75"); // 3 x 60.25
  expect(await stockOf()).toBe(7);
  expect(subDec((await acct(a.api, s.shrinkageAccountId)).debit, shrink0.debit)).toBe("180.75");
  expect(subDec((await acct(a.api, s.inventoryAccountId)).credit, inv0.credit)).toBe("180.75");
  const journal = await journalOf(a.api, "INVENTORY_ADJUSTMENT", dec3.body.id);
  expect(lineSig(journal.lines)).toEqual(lineSig([{ accountId: s.shrinkageAccountId, debit: "180.75", credit: "0" }, { accountId: s.inventoryAccountId, debit: "0", credit: "180.75" }]));

  const inc = await a.api.post("/inventory-adjustments", payload({ type: "INCREASE", quantity: 2, reason: "STOCKTAKE" }));
  expect(inc.status).toBe(201);
  expect(dec(inc.body.value)).toBe("120.5");
  expect(await stockOf()).toBe(9);

  // invalid adjustments change nothing
  const insufficient = await a.api.post("/inventory-adjustments", payload({ quantity: 1000 }));
  expect(insufficient.status).toBe(400);
  expect(insufficient.body.message).toMatch(/Insufficient stock/);
  for (const bad of [{ quantity: 0 }, { quantity: 1.5 }, { reason: "NOPE" }, { accountId: s.inventoryAccountId }, { warehouseId: "nope" }]) {
    expect((await a.api.post("/inventory-adjustments", payload(bad))).status).toBe(400);
  }
  expect(await stockOf()).toBe(9);
  const options = await a.api.get("/inventory-adjustments/account-options");
  expect(options.status).toBe(200);
  expect(ids(options)).toContain(s.shrinkageAccountId);
  expect(ids(options)).not.toContain(s.inventoryAccountId);

  // void: stock restored, linked reversal, second void refused
  const voided = await a.api.post(`/inventory-adjustments/${dec3.body.id}/void`, {});
  expect(voided.status).toBe(201);
  expect(voided.body.status).toBe("VOIDED");
  expect(await stockOf()).toBe(12);
  expect((await journalOf(a.api, "INVENTORY_ADJUSTMENT_VOID", dec3.body.id))?.reversalOfId).toBe(journal.id);
  expect((await a.api.post(`/inventory-adjustments/${dec3.body.id}/void`, {})).status).toBe(400);
  expect((await a.api.get(`/inventory-adjustments/${dec3.body.id}`)).body.status).toBe("VOIDED");

  // isolation
  expect((await b.api.get(`/inventory-adjustments/${inc.body.id}`)).status).toBe(404);
  expect((await b.api.post(`/inventory-adjustments/${inc.body.id}/void`, {})).status).toBe(404);
  expect((await b.api.post("/inventory-adjustments", payload())).status).toBe(400);
  expect(ids(await b.api.get("/inventory-adjustments", { limit: 100 }))).not.toContain(inc.body.id);
  await expect.poll(async () => ids(await a.api.get("/inventory-adjustments", { limit: 100 })), { timeout: 20_000 }).toContain(inc.body.id);
});

test("[mz-stock-transfers.2] transfer API: pending -> in transit -> completed moves stock between warehouses; cancel and guards", { tags: ["feat:mz-stock-transfers", "shard:inventory-api", "lvl:api"] }, async () => {
  const a = await A(), b = await B();
  expect((await anon.get("/transfers")).status).toBe(401);
  const s = await stockedItem(a, "transfer", 10);
  const to = (await a.api.post("/warehouses", { code: seeded("WH-TO", 4), name: seeded("Destination warehouse") })).body;
  const toId = to?.id ?? rows(await a.api.get("/warehouses", { search: seeded("WH-TO", 4) }))[0].id;
  const body = (qty: number, over: Record<string, unknown> = {}) => ({ fromWarehouseId: s.warehouseId, toWarehouseId: toId, date: DATE.doc, notes: "e2e", lines: [{ itemId: s.itemId, quantity: qty }], ...over });
  const level = async (warehouseId: string) => { const r = await a.api.get("/inventory-levels", { itemId: s.itemId, warehouseId }); return Number(rows(r)[0]?.quantity ?? 0); };

  expect((await a.api.post("/transfers", body(1, { toWarehouseId: s.warehouseId }))).status).toBe(400); // same warehouse
  expect((await a.api.post("/transfers", body(1, { toWarehouseId: "nope" }))).status).toBe(404);
  expect((await b.api.post("/transfers", body(1))).status).toBe(404); // another tenant's warehouses
  const created = await a.api.post("/transfers", body(4));
  expect(created.status).toBe(201);
  expect(created.body.status).toBe("PENDING");
  expect(created.body.transferNumber).toBeTruthy();
  const id = created.body.id as string;
  expect((await b.api.get(`/transfers/${id}`)).status).toBe(404);
  expect((await b.api.patch(`/transfers/${id}/complete`)).status).toBe(404);

  expect((await a.api.patch(`/transfers/${id}/in-transit`)).body.status).toBe("IN_TRANSIT");
  expect((await a.api.patch(`/transfers/${id}/in-transit`)).status).toBe(400);
  expect(await level(s.warehouseId)).toBe(10); // nothing moved yet
  const done = await a.api.patch(`/transfers/${id}/complete`);
  expect(done.status).toBe(200);
  expect(done.body.status).toBe("COMPLETED");
  expect(await level(s.warehouseId)).toBe(6);
  expect(await level(toId)).toBe(4);
  expect((await a.api.patch(`/transfers/${id}/complete`)).status).toBe(400);
  expect((await a.api.patch(`/transfers/${id}/cancel`)).status).toBe(400);
  const movements = await a.api.get("/inventory-movements", { itemId: s.itemId, type: "transfer" });
  expect(rows(movements).map((m: any) => m.movementType).sort()).toEqual(["IN", "OUT"]);

  // more than the source holds is refused at completion; a pending transfer can be cancelled
  const greedy = (await a.api.post("/transfers", body(99))).body.id;
  const refused = await a.api.patch(`/transfers/${greedy}/complete`);
  expect(refused.status).toBe(400);
  expect(refused.body.message).toMatch(/Insufficient stock/);
  expect((await a.api.patch(`/transfers/${greedy}/cancel`)).body.status).toBe("CANCELLED");
  expect(await level(s.warehouseId)).toBe(6);
  await expect.poll(async () => ids(await a.api.get("/transfers", { limit: 100 })), { timeout: 20_000 }).toContain(id);
});

test("[mz-price-lists.2] price list API: create with item prices, update, validation and tenant isolation", { tags: ["feat:mz-price-lists", "shard:inventory-api", "lvl:api"] }, async () => {
  const a = await A(), b = await B();
  expect((await anon.get("/price-lists")).status).toBe(401);
  const s = await stockedItem(a, "pricelist", 1);
  const created = await a.api.post("/price-lists", { name: seeded("Price list"), description: "e2e", type: "PERCENTAGE", adjustment: "10", items: [{ itemId: s.itemId, customPrice: "90" }] });
  expect(created.status).toBe(201);
  expect(dec(created.body.adjustment)).toBe("10");
  const id = created.body.id as string;
  const read = await a.api.get(`/price-lists/${id}`);
  expect(read.status).toBe(200);
  expect(JSON.stringify(read.body)).toContain(s.itemId);
  const upd = await a.api.patch(`/price-lists/${id}`, { name: seeded("Price list v2"), adjustment: "12.5", isActive: false });
  expect(upd.status).toBe(200);
  expect([upd.body.name, dec(upd.body.adjustment), upd.body.isActive]).toEqual([seeded("Price list v2"), "12.5", false]);
  expect(ids(await a.api.get("/price-lists"))).toContain(id);
  expect((await a.api.post("/price-lists", { description: "no name", type: "PERCENTAGE", adjustment: "1" })).status).toBe(400);
  expect((await a.api.post("/price-lists", { name: "bad type", type: "WEIRD", adjustment: "1" })).status).toBe(400);
  expect((await b.api.get(`/price-lists/${id}`)).status).toBe(404);
  expect((await b.api.patch(`/price-lists/${id}`, { name: "Hijacked" })).status).toBe(404);
  expect((await b.api.del(`/price-lists/${id}`)).status).toBe(404);
  expect(ids(await b.api.get("/price-lists"))).not.toContain(id);
  expect((await a.api.del(`/price-lists/${id}`)).status).toBe(200);
  expect((await a.api.get(`/price-lists/${id}`)).status).toBe(404);
});

test("[mz-composite-items.2] composite item API: bundle of components, availability, assembling consumes component stock, isolation", { tags: ["feat:mz-composite-items", "shard:inventory-api", "lvl:api"] }, async () => {
  const a = await A(), b = await B();
  expect((await anon.get("/composite-items")).status).toBe(401);
  const s = await stockedItem(a, "bundle", 6);
  const sku = seeded("BUNDLE").toUpperCase();
  const created = await a.api.post("/composite-items", { name: seeded("Bundle"), sku, sellingPrice: "250", components: [{ itemId: s.itemId, quantity: 2 }] });
  expect(created.status).toBe(201);
  const id = created.body.id as string;
  expect((await a.api.post("/composite-items", { name: "dup", sku, components: [] })).status).toBe(400);
  expect((await a.api.post("/composite-items", { name: "ghost", sku: seeded("B2").toUpperCase(), components: [{ itemId: "nope", quantity: 1 }] })).status).toBe(404);
  const ok = await a.api.get(`/composite-items/${id}/availability`, { quantity: 3 });
  expect(ok.status).toBe(200);
  expect(ok.body).toMatchObject({ isAvailable: true, quantity: 3 });
  expect(ok.body.components[0]).toMatchObject({ required: 6, available: 6, shortfall: 0 });
  const short = await a.api.get(`/composite-items/${id}/availability`, { quantity: 4 });
  expect(short.body.isAvailable).toBe(false);
  expect(short.body.components[0].shortfall).toBe(2);

  const stockOf = async () => Number((await a.api.get(`/items/${s.itemId}`)).body.currentStock);
  expect((await a.api.post(`/composite-items/${id}/assemble`, { quantity: 4, warehouseId: s.warehouseId })).status).toBe(400); // not enough components
  expect(await stockOf()).toBe(6);
  const built = await a.api.post(`/composite-items/${id}/assemble`, { quantity: 3, warehouseId: s.warehouseId });
  expect(built.status).toBe(201);
  expect(await stockOf()).toBe(0);
  expect((await b.api.get(`/composite-items/${id}`)).status).toBe(404);
  expect((await b.api.post(`/composite-items/${id}/assemble`, { quantity: 1, warehouseId: b.chart.cash })).status).toBe(404);
  expect((await a.api.patch(`/composite-items/${id}`, { name: seeded("Bundle v2") })).body.name).toBe(seeded("Bundle v2"));
  expect(ids(await a.api.get("/composite-items", { limit: 50 }))).toContain(id);
  expect((await a.api.del(`/composite-items/${id}`)).status).toBe(200);
  expect((await a.api.get(`/composite-items/${id}`)).status).toBe(404);
});

test("[mz-stock-movements.2] movements and levels API: every stock change leaves a movement and a level that adds up", { tags: ["feat:mz-stock-movements", "shard:inventory-api", "lvl:api"] }, async () => {
  const a = await A(), b = await B();
  expect((await anon.get("/inventory-movements")).status).toBe(401);
  expect((await anon.get("/inventory-levels")).status).toBe(401);
  const s = await stockedItem(a, "moves", 8);
  const dec2 = await a.api.post("/inventory-adjustments", { date: DATE.doc, warehouseId: s.warehouseId, itemId: s.itemId, type: "DECREASE", quantity: 3, reason: "DAMAGED", accountId: s.shrinkageAccountId });
  expect(dec2.status).toBe(201);
  const moves = await a.api.get("/inventory-movements", { itemId: s.itemId, limit: 50 });
  expect(moves.status).toBe(200);
  const list = rows(moves);
  expect(list.length).toBeGreaterThanOrEqual(2);
  const net = list.reduce((sum: number, m: any) => sum + (m.movementType === "IN" ? 1 : -1) * Number(m.quantity), 0);
  expect(net).toBe(5); // +8 opening, -3 damaged
  expect(list.every((m: any) => m.item?.id === s.itemId)).toBe(true);
  const levels = await a.api.get("/inventory-levels", { itemId: s.itemId });
  expect(rows(levels).map((l: any) => Number(l.quantity))).toEqual([5]);
  const byItem = await a.api.get(`/inventory-levels/by-item/${s.itemId}`);
  expect(rows(byItem).map((l: any) => Number(l.quantity))).toEqual([5]);
  expect((await a.api.get("/inventory-movements/cursor", { take: 5 })).status).toBe(200);
  // another tenant sees none of it
  expect(rows(await b.api.get("/inventory-movements", { itemId: s.itemId }))).toHaveLength(0);
  expect(rows(await b.api.get("/inventory-levels", { itemId: s.itemId }))).toHaveLength(0);
});
