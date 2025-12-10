-- إنشاء جدول places (الأماكن: المولات، الأسواق، المناطق)
CREATE TABLE IF NOT EXISTS places (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  address TEXT,
  type TEXT CHECK (type IN ('mall', 'market', 'area')) NOT NULL,
  latitude DOUBLE PRECISION,
  longitude DOUBLE PRECISION,
  phone TEXT,
  description TEXT,
  is_manual BOOLEAN DEFAULT false,
  city TEXT,
  last_api_update TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- إنشاء Indexes
CREATE INDEX IF NOT EXISTS idx_places_type ON places(type);
CREATE INDEX IF NOT EXISTS idx_places_location ON places(latitude, longitude) WHERE latitude IS NOT NULL AND longitude IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_places_is_manual ON places(is_manual);
CREATE INDEX IF NOT EXISTS idx_places_city ON places(city) WHERE city IS NOT NULL;

-- تفعيل RLS
ALTER TABLE places ENABLE ROW LEVEL SECURITY;

-- سياسات RLS - جميع المستخدمين يمكنهم قراءة الأماكن
DROP POLICY IF EXISTS "Anyone can read places" ON places;
CREATE POLICY "Anyone can read places"
  ON places FOR SELECT
  USING (true);

-- فقط الـ admins يمكنهم إضافة/تعديل/حذف الأماكن
-- سياسة منفصلة للـ INSERT (الإضافة)
DROP POLICY IF EXISTS "Admins can insert places" ON places;
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
DROP POLICY IF EXISTS "Admins can update places" ON places;
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
DROP POLICY IF EXISTS "Admins can delete places" ON places;
CREATE POLICY "Admins can delete places"
  ON places FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role = 'admin'
    )
  );

-- Trigger لتحديث updated_at
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS update_places_updated_at ON places;
CREATE TRIGGER update_places_updated_at
  BEFORE UPDATE ON places
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- إضافة بعض البيانات التجريبية (اختياري)
-- يمكنك حذف هذا الجزء إذا كنت تريد إضافة البيانات يدوياً
INSERT INTO places (name, address, type, latitude, longitude) VALUES
  ('مول مصر', 'مدينة نصر، القاهرة', 'mall', 30.0626, 31.3197),
  ('مول سيتي ستارز', 'مدينة نصر، القاهرة', 'mall', 30.0689, 31.3194),
  ('مول العروبة', 'المعادي، القاهرة', 'mall', 29.9608, 31.2700),
  ('سوق العتبة', 'وسط البلد، القاهرة', 'market', 30.0444, 31.2357),
  ('سوق الخضار', 'المعادي، القاهرة', 'market', 29.9608, 31.2700),
  ('منطقة الزمالك', 'الزمالك، القاهرة', 'area', 30.0626, 31.2197),
  ('منطقة مدينة نصر', 'مدينة نصر، القاهرة', 'area', 30.0626, 31.3197)
ON CONFLICT DO NOTHING;


