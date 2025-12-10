-- ============================================
-- إصلاح جدول places - إضافة الأعمدة المفقودة وإصلاح سياسات RLS
-- ============================================

-- 1. إضافة الأعمدة المفقودة
ALTER TABLE places 
ADD COLUMN IF NOT EXISTS is_manual BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS city TEXT,
ADD COLUMN IF NOT EXISTS last_api_update TIMESTAMP WITH TIME ZONE;

-- 2. إنشاء Index للأعمدة الجديدة
CREATE INDEX IF NOT EXISTS idx_places_is_manual ON places(is_manual);
CREATE INDEX IF NOT EXISTS idx_places_city ON places(city) WHERE city IS NOT NULL;

-- 3. إصلاح سياسة RLS - إضافة WITH CHECK للعمليات INSERT و UPDATE
DROP POLICY IF EXISTS "Admins can manage places" ON places;

-- سياسة منفصلة للـ SELECT (القراءة)
CREATE POLICY "Anyone can read places"
  ON places FOR SELECT
  USING (true);

-- سياسة منفصلة للـ INSERT (الإضافة)
CREATE POLICY "Admins can insert places"
  ON places FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role = 'admin'
    )
  );

-- سياسة منفصلة للـ UPDATE (التحديث)
CREATE POLICY "Admins can update places"
  ON places FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role = 'admin'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role = 'admin'
    )
  );

-- سياسة منفصلة للـ DELETE (الحذف)
CREATE POLICY "Admins can delete places"
  ON places FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role = 'admin'
    )
  );

-- ============================================
-- ✅ تم الإصلاح!
-- ============================================

