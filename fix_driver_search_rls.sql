-- ============================================
-- إصلاح سياسات RLS للسماح للعملاء بالبحث عن السائقين
-- ============================================
-- المشكلة: العملاء لا يستطيعون قراءة ملفات السائقين للبحث عنهم
-- الحل: إضافة سياسة تسمح للعملاء بقراءة ملفات السائقين النشطين والموافق عليهم
-- ============================================

-- سياسة تسمح للعملاء بقراءة ملفات السائقين النشطين والموافق عليهم
-- هذا ضروري للبحث عن السائقين القريبين
DROP POLICY IF EXISTS "Customers can read active approved drivers" ON profiles;
CREATE POLICY "Customers can read active approved drivers"
  ON profiles FOR SELECT
  USING (
    role = 'driver' 
    AND status = 'active' 
    AND approval_status = 'approved'
  );

-- سياسة تسمح للعملاء بقراءة مواقع السائقين
-- هذا ضروري لحساب المسافة بين العميل والسائقين
DROP POLICY IF EXISTS "Customers can read driver locations" ON driver_locations;
CREATE POLICY "Customers can read driver locations"
  ON driver_locations FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = driver_locations.driver_id
        AND profiles.role = 'driver'
        AND profiles.status = 'active'
        AND profiles.approval_status = 'approved'
    )
  );

-- التحقق من أن السياسات تم إنشاؤها بنجاح
SELECT 
  schemaname,
  tablename,
  policyname,
  permissive,
  roles,
  cmd,
  qual
FROM pg_policies
WHERE tablename IN ('profiles', 'driver_locations')
  AND (policyname LIKE '%driver%' OR policyname LIKE '%Customer%')
ORDER BY tablename, policyname;
