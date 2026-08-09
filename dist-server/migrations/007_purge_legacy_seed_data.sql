-- Purge the demo/seed records that builds up to 2026-08-01 wrote into every
-- new database on first launch.
--
-- Removing the seeding code stopped NEW databases being polluted, but it could
-- not clean the ones already on disk: the database lives in the per-user data
-- folder, survives uninstall, and is re-opened by the next install. Asking the
-- operator to delete a file by hand is not a fix. Migrations run automatically
-- on every start, so this cleans every existing machine with no user action.
--
-- Each row is matched on its id AND its distinctive name AND its original date.
-- A real record would have to coincide on all three to be touched, so genuine
-- business data entered under one of these ids is left alone.
--
-- Safe to re-run: DELETE of an already-absent row is a no-op.

-- Ledger allocations first: trip_id is a plain column with no cascade, so
-- deleting the trips below would otherwise strand rows pointing at them.
DELETE FROM client_payment_allocations
WHERE (trip_type = 'transport' AND trip_id IN ('TR-202','TR-203','TR-204','TR-205','TR-206'))
   OR (trip_type = 'resale'    AND trip_id IN ('RS-801','RS-802','RS-803','RS-804'));

DELETE FROM driver_payment_allocations
WHERE (trip_type = 'transport' AND trip_id IN ('TR-202','TR-203','TR-204','TR-205','TR-206'))
   OR (trip_type = 'resale'    AND trip_id IN ('RS-801','RS-802','RS-803','RS-804'));

DELETE FROM client_trips WHERE
  (id = 'TR-202' AND date = '2026-06-01' AND client_name = 'مجموعة حداد للأشغال العامة')
  OR (id = 'TR-203' AND date = '2026-06-03' AND client_name = 'شركة بوعمامة للبناء')
  OR (id = 'TR-204' AND date = '2026-06-05' AND client_name = 'مؤسسة بلحول للري')
  OR (id = 'TR-205' AND date = '2026-06-07' AND client_name = 'الحاج بلخير للمقاولات')
  OR (id = 'TR-206' AND date = '2026-06-09' AND client_name = 'مؤسسة الأشغال الكبرى العيد');

DELETE FROM material_resales WHERE
  (id = 'RS-801' AND date = '2026-06-02' AND end_client = 'المقاول الأخضر لتهيئة الحدائق')
  OR (id = 'RS-802' AND date = '2026-06-04' AND end_client = 'شركة جيل المستقبل العقارية')
  OR (id = 'RS-803' AND date = '2026-06-06' AND end_client = 'مؤسسة الأشغال المائية التل')
  OR (id = 'RS-804' AND date = '2026-06-08' AND end_client = 'تعاونية البناء بلعباس الأنيق');

DELETE FROM expenses WHERE
  (id = 'EXP-101' AND date = '2026-06-02' AND amount = 18000 AND truck_plate = '01345-116-22')
  OR (id = 'EXP-102' AND date = '2026-06-04' AND amount = 45000 AND truck_plate = '44129-113-22')
  OR (id = 'EXP-103' AND date = '2026-06-06' AND amount = 6000  AND truck_plate = '01345-116-22')
  OR (id = 'EXP-104' AND date = '2026-06-07' AND amount = 85000 AND truck_plate = 'جميع الشاحنات')
  OR (id = 'EXP-105' AND date = '2026-06-08' AND amount = 12000 AND truck_plate = 'مكتب الإدارة')
  OR (id = 'EXP-106' AND date = '2026-06-09' AND amount = 22000 AND truck_plate = '09689-115-22');
