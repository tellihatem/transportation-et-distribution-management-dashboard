/**
 * SQLite Database Connection & Initialization
 * Uses better-sqlite3 for synchronous, high-performance access.
 */

import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';

/**
 * Resolve the data directory. In a packaged Electron app process.cwd() is
 * unreliable, so we prefer the DATABASE_PATH env var (set by electron/main.js)
 * and fall back to a path relative to the user data folder.
 */
function resolveDataDir(): string {
  if (process.env.DATABASE_PATH) {
    return path.dirname(process.env.DATABASE_PATH);
  }
  // In development, use cwd-relative data/
  return path.resolve(process.cwd(), 'data');
}

const DATA_DIR = resolveDataDir();
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
  // In packaged Electron apps process.cwd() is unreliable.
  // When built, migrations are copied into dist-server/migrations/
  // so __dirname (dist-server) is the correct base.
  const migrationsDir = path.resolve(__dirname, 'migrations');

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
    try {
      db.exec(sql);
    } catch (err: any) {
      // Migrations re-run on every boot; CREATE TABLE/INDEX use IF NOT EXISTS,
      // but ALTER TABLE ADD COLUMN has no such guard, so tolerate a rerun.
      if (typeof err?.message === 'string' && err.message.includes('duplicate column name')) {
        console.log(`[DB] Migration ${file} already applied, skipping.`);
      } else {
        throw err;
      }
    }
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
    INSERT OR IGNORE INTO client_trips (id, date, client_name, origin_factory, destination, material_type, total_tonnage, truck_cost, driver_cut, company_profit, driver_name, client_paid, driver_paid)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const insertResale = db.prepare(`
    INSERT OR IGNORE INTO material_resales (id, date, end_client, destination, factory_purchase_price, total_tonnage, client_selling_price, truck_cost, driver_cost, explicit_profit, driver_name, client_paid, driver_paid)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const insertExpense = db.prepare(`
    INSERT OR IGNORE INTO expenses (id, date, category, truck_plate, amount, status)
    VALUES (?, ?, ?, ?, ?, ?)
  `);

  const seedTransaction = db.transaction(() => {
    // Client Transport Trips
    insertTrip.run('TR-202', '2026-06-01', 'مجموعة حداد للأشغال العامة', 'مصنع الإسمنت سيدي بلعباس', 'ورشة الطريق السريع تلمسان', 'إسمنت رمادي 42.5', 32.5, 15000, 5000, 6000, 'بلال رحماني', 0, 0);
    insertTrip.run('TR-203', '2026-06-03', 'شركة بوعمامة للبناء', 'محجرة الغرب تلموني', 'موقع 1500 مسكن عدل', 'حصى غسيل 0/15', 40.0, 12000, 4000, 4500, 'عمر بوزيد', 0, 0);
    insertTrip.run('TR-204', '2026-06-05', 'مؤسسة بلحول للري', 'مركب الحديد و الصلب وهران', 'قناة جر المياه سفيزف', 'أنابيب حديد قطر 500', 15.0, 20000, 6000, 8000, 'بلال رحماني', 0, 0);
    insertTrip.run('TR-205', '2026-06-07', 'الحاج بلخير للمقاولات', 'محجرة الرمال تيموشنت', 'منطقة النشاطات عين تموشنت', 'رمل بناء ناعم', 28.0, 8000, 3500, 3500, 'حسين مقراني', 0, 0);
    insertTrip.run('TR-206', '2026-06-09', 'مؤسسة الأشغال الكبرى العيد', 'مصنع الأجر السانية', 'حي السلام بلعباس', 'أجر أحمر 8 عيون', 30.0, 14000, 4500, 5500, 'عمر بوزيد', 0, 0);

    // Material Resale Transactions
    insertResale.run('RS-801', '2026-06-02', 'المقاول الأخضر لتهيئة الحدائق', 'حديقة المسيلة الحضرية', 1200, 45.0, 115000, 16000, 5000, 7000, 'بلال رحماني', 0, 0);
    insertResale.run('RS-802', '2026-06-04', 'شركة جيل المستقبل العقارية', 'مشروع سكني حي الأمل', 2500, 50.0, 220000, 22000, 7000, 11000, 'حسين مقراني', 0, 0);
    insertResale.run('RS-803', '2026-06-06', 'مؤسسة الأشغال المائية التل', 'سد وادي التل', 1800, 35.0, 145000, 15000, 4500, 7500, 'عمر بوزيد', 0, 0);
    insertResale.run('RS-804', '2026-06-08', 'تعاونية البناء بلعباس الأنيق', 'حي التعاونية بلعباس', 1100, 60.0, 160000, 18000, 6000, 8000, 'بلال رحماني', 0, 0);

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
