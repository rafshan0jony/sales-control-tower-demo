'use strict';

/**
 * Demo data generator + seeder for the portfolio clone.
 *
 * Generates fully-fake data (territories, products, customers, orders,
 * deliveries, credit, targets, users) so the app can be shown without any
 * real company data.
 *
 *   CLI:  node demo/seed.js
 *   Module: require('./demo/seed').seedIfEmpty()  (used by the Vercel entrypoint)
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const DATA_DIR = path.join(ROOT, 'server', 'data');

process.env.APP_DB_PATH = process.env.APP_DB_PATH || path.join(ROOT, 'data', 'app.db');
process.env.ADMIN_INITIAL_PASSWORD = process.env.ADMIN_INITIAL_PASSWORD || 'admin123';

const config = require('../server/config');
const { hashPassword } = require('../server/lib/passwords');
const db = require('../server/db');
const territoriesRepo = require('../server/repos/territories');
const usersRepo = require('../server/repos/users');
const rolesRepo = require('../server/repos/roles');
const userTerritoriesRepo = require('../server/repos/userTerritories');
const syncRepo = require('../server/repos/sync');
const dates = require('../server/lib/dates');

const PRODUCTS = ['Product A', 'Product B', 'Product C', 'Product D', 'Product E'];
const PRODUCT_WEIGHT = { 'Product A': 25, 'Product B': 25, 'Product C': 50, 'Product D': 25, 'Product E': 50 };
const PRODUCT_PRICE = { 'Product A': 3200, 'Product B': 2800, 'Product C': 3600, 'Product D': 3000, 'Product E': 3400 };

const TERRITORIES = [
  { region: 'North Region', area: 'North Area 1', territory: 'Territory N1' },
  { region: 'North Region', area: 'North Area 1', territory: 'Territory N2' },
  { region: 'North Region', area: 'North Area 1', territory: 'Territory N3' },
  { region: 'North Region', area: 'North Area 2', territory: 'Territory N4' },
  { region: 'North Region', area: 'North Area 2', territory: 'Territory N5' },
  { region: 'South Region', area: 'South Area 1', territory: 'Territory S1' },
  { region: 'South Region', area: 'South Area 1', territory: 'Territory S2' },
  { region: 'South Region', area: 'South Area 1', territory: 'Territory S3' },
  { region: 'South Region', area: 'South Area 2', territory: 'Territory S4' },
  { region: 'South Region', area: 'South Area 2', territory: 'Territory S5' },
  { region: 'East Region', area: 'East Area 1', territory: 'Territory E1' },
  { region: 'East Region', area: 'East Area 1', territory: 'Territory E2' },
  { region: 'East Region', area: 'East Area 2', territory: 'Territory E3' },
  { region: 'West Region', area: 'West Area 1', territory: 'Territory W1' },
  { region: 'West Region', area: 'West Area 1', territory: 'Territory W2' },
];

const CUSTOMERS = [
  'North Traders', 'City Mart', 'Green Bazaar', 'Sunrise Store', 'Delta Enterprise',
  'Blue Ocean Traders', 'Fresh Mart', 'Metro Stores', 'Prime Traders', 'Evergreen Shop',
  'Golden Harvest', 'Skyline Mart', 'Royal Traders', 'United Stores', 'Crown Enterprise',
  'Silver Line', 'Pacific Traders', 'Apex Mart', 'Summit Stores', 'Riverside Traders',
  'Hillview Mart', 'Central Bazaar', 'Peak Traders', 'Harbor Stores', 'Starlight Enterprise',
  'Orchid Traders', 'Vertex Mart', 'Coastal Stores', 'Falcon Traders', 'Zenith Enterprise',
];

function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function writeStaticFiles() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

  const mappingRows = TERRITORIES.map((t) => ({ system: t.territory, territory: t.territory, area: t.area, region: t.region }));
  fs.writeFileSync(path.join(DATA_DIR, 'territoryMapping.json'), JSON.stringify({ updatedAt: new Date().toISOString(), rows: mappingRows }, null, 2));

  const itemRows = [];
  for (const p of PRODUCTS) {
    const w = PRODUCT_WEIGHT[p];
    itemRows.push({ item: `${p} ${w} kg (T)`, weight: String(w), variant: p });
  }
  itemRows.push({ item: 'Rice Bran 1 kg (T)', weight: '1', variant: 'By-Product' });
  fs.writeFileSync(path.join(DATA_DIR, 'itemMapping.json'), JSON.stringify({ updatedAt: new Date().toISOString(), rows: itemRows }, null, 2));

  const today = new Date();
  const rateDate = `${String(today.getDate()).padStart(2, '0')}-${today.toLocaleString('en-US', { month: 'short' })}-${today.getFullYear()}`;
  const rateRows = PRODUCTS.map((p) => ({ date: rateDate, product: p, forecastMt: '0', price: String(PRODUCT_PRICE[p]) }));
  fs.writeFileSync(path.join(DATA_DIR, 'rateSheet.json'), JSON.stringify({ updatedAt: new Date().toISOString(), rows: rateRows }, null, 2));

  fs.writeFileSync(path.join(DATA_DIR, 'tourPlan.json'), JSON.stringify({ updatedAt: '', plans: [] }, null, 2));

  const now = dates.todayStr();
  const month = now.slice(0, 7);
  const rng = mulberry32(42);
  const targetRows = [];
  for (const t of TERRITORIES) {
    const targets = {};
    for (const p of PRODUCTS) targets[p] = Math.round(rng() * 180 + 20);
    targetRows.push({ month, territory: t.territory, targets });
  }
  const nationalTargets = {};
  for (const p of PRODUCTS) nationalTargets[p] = targetRows.reduce((s, r) => s + r.targets[p], 0);
  targetRows.push({ month, territory: 'National', targets: nationalTargets });
  fs.writeFileSync(path.join(DATA_DIR, 'territoryTarget.json'), JSON.stringify({
    updatedAt: new Date().toISOString(), months: [month], products: [...PRODUCTS, 'By-Product', 'Total Target'], rows: targetRows,
  }, null, 2));
}

function seedDb() {
  const channelId = config.app.channelId;
  const national = territoriesRepo.findByName('National') || territoriesRepo.findByCode('NATIONAL');
  if (!national) throw new Error('National territory node missing');

  const seen = { region: new Map(), area: new Map(), territory: new Map() };
  for (const t of TERRITORIES) {
    let region = seen.region.get(t.region);
    if (!region) { region = territoriesRepo.upsertByCode({ code: 'R:' + t.region, name: t.region, level: 1, parentId: national.id, channelId }); seen.region.set(t.region, region); }
    let area = seen.area.get(t.area);
    if (!area) { area = territoriesRepo.upsertByCode({ code: 'A:' + t.area, name: t.area, level: 2, parentId: region.id, channelId }); seen.area.set(t.area, area); }
    seen.territory.set(t.territory, territoriesRepo.upsertByCode({ code: 'T:' + t.territory, name: t.territory, level: 4, parentId: area.id, channelId }));
  }

  const roleId = (code) => rolesRepo.findByCode(code).id;
  const demoUsers = [
    { username: 'national', email: 'national@demo.example.com', name: 'Alex Morgan', title: 'Head of Sales', role: 'NATIONAL', assign: ['NATIONAL'] },
    { username: 'region.north', email: 'region.north@demo.example.com', name: 'Priya Sharma', title: 'Regional Manager', role: 'REGION', assign: ['R:North Region'] },
    { username: 'region.south', email: 'region.south@demo.example.com', name: 'David Kim', title: 'Regional Manager', role: 'REGION', assign: ['R:South Region'] },
    { username: 'area.east', email: 'area.east@demo.example.com', name: 'Sarah Lee', title: 'Area Manager', role: 'AREA', assign: ['A:East Area 1'] },
    { username: 'area.west', email: 'area.west@demo.example.com', name: 'Omar Faruk', title: 'Area Manager', role: 'AREA', assign: ['A:West Area 1'] },
    { username: 'territory.n1', email: 'territory.n1@demo.example.com', name: 'Rahim Uddin', title: 'Territory Officer', role: 'TERRITORY', assign: ['T:Territory N1'] },
    { username: 'territory.s1', email: 'territory.s1@demo.example.com', name: 'Karim Hossain', title: 'Territory Officer', role: 'TERRITORY', assign: ['T:Territory S1'] },
  ];

  for (const u of demoUsers) {
    if (usersRepo.findByUsername(u.username)) continue;
    const user = usersRepo.create({ username: u.username, email: u.email, name: u.name, employeeId: null, passwordHash: hashPassword('demo123'), plainPassword: 'demo123', title: u.title, roleId: roleId(u.role), status: 'active' });
    for (const code of u.assign) {
      if (code === 'NATIONAL') { const nat = territoriesRepo.findByCode('NATIONAL'); if (nat) userTerritoriesRepo.assign(user.id, nat.id); }
      else { const t = territoriesRepo.findByCode(code); if (t) userTerritoriesRepo.assign(user.id, t.id); }
    }
  }
}

function generateSnapshot() {
  const rng = mulberry32(7);
  const now = dates.todayStr();
  const monthStart = now.slice(0, 7) + '-01';
  const prevMonthStart = dates.addDays(monthStart, -28);

  const pick = (arr) => arr[Math.floor(rng() * arr.length)];

  const orders = [];
  const deliveries = [];
  let orderSeq = 1000;
  for (let d = 0; d < 45; d++) {
    const day = dates.addDays(now, -d);
    if (day < prevMonthStart) continue;
    const nOrders = 2 + Math.floor(rng() * 4);
    for (let o = 0; o < nOrders; o++) {
      const terr = pick(TERRITORIES);
      const customer = pick(CUSTOMERS);
      const product = pick(PRODUCTS);
      const weight = PRODUCT_WEIGHT[product];
      const qty = 20 * Math.ceil(rng() * 20);
      const price = PRODUCT_PRICE[product];
      const mt = (qty * weight) / 1000;
      const value = Math.round(qty * (weight === 50 ? price : price * 0.5));
      orderSeq++;
      const orderNo = 'SO-DEMO-' + orderSeq;
      const deliveredQty = Math.round(qty * rng());
      orders.push({
        date: day, orderNo, customer, territory: terr.territory, area: terr.area, region: terr.region, systemTerritory: terr.territory,
        status: deliveredQty >= qty ? 'Completed' : 'Open', item: `${product} ${weight} kg (T)`, product, uom: 'Bag', weight,
        quantity: qty, mt, value, price, rate50: price, deliveredQty, undeliveredQty: qty - deliveredQty,
        undeliveredValue: (qty - deliveredQty) * (weight === 50 ? price : price * 0.5),
      });
    }
    const nDel = 1 + Math.floor(rng() * 3);
    for (let dl = 0; dl < nDel; dl++) {
      const terr = pick(TERRITORIES);
      const customer = pick(CUSTOMERS);
      const product = pick(PRODUCTS);
      const weight = PRODUCT_WEIGHT[product];
      const qty = 20 * Math.ceil(rng() * 15);
      const price = PRODUCT_PRICE[product];
      const mt = (qty * weight) / 1000;
      const value = Math.round(qty * (weight === 50 ? price : price * 0.5));
      deliveries.push({
        date: day, customer, territory: terr.territory, area: terr.area, region: terr.region, systemTerritory: terr.territory,
        status: 'Delivered', orderNo: 'SO-DEMO-' + orderSeq, item: `${product} ${weight} kg (T)`, product, uom: 'Bag', weight,
        quantity: qty, mt, value,
      });
    }
  }

  const credit = [];
  for (let i = 0; i < 20; i++) {
    const terr = TERRITORIES[i % TERRITORIES.length];
    const customer = CUSTOMERS[i % CUSTOMERS.length];
    const ledgerBalance = Math.round((rng() * 4000000 + 200000));
    credit.push({
      partnerCode: 'DEMO-' + (2000 + i), partnerName: customer, creditDays: pick([7, 15, 30]), ledgerBalance,
      overdue: Math.round(ledgerBalance * rng() * 0.5), territory: terr.territory, area: terr.area, region: terr.region,
      lastDeliveryDate: dates.addDays(now, -Math.floor(rng() * 30)), lastPaymentDate: dates.addDays(now, -Math.floor(rng() * 20)),
      deliveryGap: Math.floor(rng() * 30), paymentGap: Math.floor(rng() * 20),
    });
  }
  credit.sort((a, b) => b.ledgerBalance - a.ledgerBalance);

  return { orders, deliveries, credit };
}

function seed() {
  try { writeStaticFiles(); } catch (_) { /* read-only FS on serverless (Vercel) — committed JSON files are the fallback */ }
  db.getDb();
  seedDb();
  const { orders, deliveries, credit } = generateSnapshot();
  const snapshot = {
    orders, deliveries, credit,
    territoryTarget: JSON.parse(fs.readFileSync(path.join(DATA_DIR, 'territoryTarget.json'), 'utf8')),
    syncedAt: new Date().toISOString(), dataSource: 'DEMO',
    from: dates.monthsAgoStart(4, dates.todayStr()), to: dates.todayStr(),
  };
  syncRepo.saveSnapshot(snapshot);
  syncRepo.set({ status: 'success', lastUpdated: snapshot.syncedAt, lastSuccess: snapshot.syncedAt, error: null, dataSource: 'DEMO',
    counts: { orders: orders.length, deliveries: deliveries.length, credit: credit.length, territories: TERRITORIES.length } });
  return { orders: orders.length, deliveries: deliveries.length, credit: credit.length };
}

/** Seed demo data only if the snapshot is empty (idempotent). */
function seedIfEmpty() {
  const existing = syncRepo.loadSnapshot();
  if (existing && existing.orders && existing.orders.length) return false;
  seed();
  return true;
}

if (require.main === module) {
  const counts = seed();
  console.log(`seeded ${counts.orders} orders, ${counts.deliveries} deliveries, ${counts.credit} credit rows`);
  console.log('DONE. Login with admin / admin123 (or any demo user with demo123).');
  db.getDb().close();
}

module.exports = { seed, seedIfEmpty };
