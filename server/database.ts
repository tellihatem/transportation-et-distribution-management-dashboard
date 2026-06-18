/**
 * SQLite Database Connection & Initialization
 * Uses better-sqlite3 for synchronous, high-performance access.
 */

import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';

const DATA_DIR = path.resolve(process.cwd(), 'data');
const DB_PATH = process.env.DATABASE_PATH || path.join(DATA_DIR, 'logistics.db');

// Ensure data directory exists
if (!fs.existsSync(path.dirname(DB_PATH))) {
  fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });
}

const db = new Database(DB_PATH);

// Enable WAL mode for better read concurrency
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');
db.pragma('busy_timeout = 5000');

/**
 * Run all migration files in order
 */
export function runMigrations(): void {
  const migrationsDir = path.resolve(process.cwd(), 'server', 'migrations');

  if (!fs.existsSync(migrationsDir)) {
    console.error('[DB] Migrations directory not found:', migrationsDir);
    return;
  }

  const migrationFiles = fs.readdirSync(migrationsDir)
    .filter(f => f.endsWith('.sql'))
    .sort();

  for (const file of migrationFiles) {
    const sql = fs.readFileSync(path.join(migrationsDir, file), 'utf-8');
    console.log(`[DB] Running migration: ${file}`);
    db.exec(sql);
  }

  console.log('[DB] All migrations complete.');
}

/**
 * Seed the database with initial data if tables are empty
 */
export function seedIfEmpty(): void {
  const tripCount = (db.prepare('SELECT COUNT(*) as count FROM client_trips').get() as any).count;
  
  if (tripCount > 0) {
    console.log('[DB] Database already has data, skipping seed.');
    return;
  }

  console.log('[DB] Seeding database with initial data...');

  const insertTrip = db.prepare(`
    INSERT OR IGNORE INTO client_trips (id, date, client_name, origin_factory, destination, material_type, total_tonnage, truck_cost, driver_cut, company_profit)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const insertResale = db.prepare(`
    INSERT OR IGNORE INTO material_resales (id, date, end_client, factory_purchase_price, total_tonnage, client_selling_price, truck_cost, driver_cost, explicit_profit)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const insertExpense = db.prepare(`
    INSERT OR IGNORE INTO expenses (id, date, category, truck_plate, amount, status)
    VALUES (?, ?, ?, ?, ?, ?)
  `);

  const seedTransaction = db.transaction(() => {
    // Client Transport Trips
    insertTrip.run('TR-202', '2026-06-01', 'مجموعة حداد للأشغال العامة', 'مصنع الإسمنت سيدي بلعباس', 'ورشة الطريق السريع تلمسان', 'إسمنت رمادي 42.5', 32.5, 15000, 5000, 6000);
    insertTrip.run('TR-203', '2026-06-03', 'شركة بوعمامة للبناء', 'محجرة الغرب تلموني', 'موقع 1500 مسكن عدل', 'حصى غسيل 0/15', 40.0, 12000, 4000, 4500);
    insertTrip.run('TR-204', '2026-06-05', 'مؤسسة بلحول للري', 'مركب الحديد و الصلب وهران', 'قناة جر المياه سفيزف', 'أنابيب حديد قطر 500', 15.0, 20000, 6000, 8000);
    insertTrip.run('TR-205', '2026-06-07', 'الحاج بلخير للمقاولات', 'محجرة الرمال تيموشنت', 'منطقة النشاطات عين تموشنت', 'رمل بناء ناعم', 28.0, 8000, 3500, 3500);
    insertTrip.run('TR-206', '2026-06-09', 'مؤسسة الأشغال الكبرى العيد', 'مصنع الأجر السانية', 'حي السلام بلعباس', 'أجر أحمر 8 عيون', 30.0, 14000, 4500, 5500);

    // Material Resale Transactions
    insertResale.run('RS-801', '2026-06-02', 'المقاول الأخضر لتهيئة الحدائق', 1200, 45.0, 115000, 16000, 5000, 7000);
    insertResale.run('RS-802', '2026-06-04', 'شركة جيل المستقبل العقارية', 2500, 50.0, 220000, 22000, 7000, 11000);
    insertResale.run('RS-803', '2026-06-06', 'مؤسسة الأشغال المائية التل', 1800, 35.0, 145000, 15000, 4500, 7500);
    insertResale.run('RS-804', '2026-06-08', 'تعاونية البناء بلعباس الأنيق', 1100, 60.0, 160000, 18000, 6000, 8000);

    // Other Expenses
    insertExpense.run('EXP-101', '2026-06-02', 'Fuel', '01345-116-22', 18000, 'Paid');
    insertExpense.run('EXP-102', '2026-06-04', 'Spare Parts', '44129-113-22', 45000, 'Paid');
    insertExpense.run('EXP-103', '2026-06-06', 'Fines', '01345-116-22', 6000, 'Pending');
    insertExpense.run('EXP-104', '2026-06-07', 'Salaries', 'جميع الشاحنات', 85000, 'Paid');
    insertExpense.run('EXP-105', '2026-06-08', 'Admin', 'مكتب الإدارة', 12000, 'Paid');
    insertExpense.run('EXP-106', '2026-06-09', 'Fuel', '09689-115-22', 22000, 'Paid');
  });

  seedTransaction();
  console.log('[DB] Seed data inserted successfully.');
}

export default db;
