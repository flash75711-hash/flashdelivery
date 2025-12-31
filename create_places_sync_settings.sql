-- ============================================
-- إنشاء جدول إعدادات مزامنة الأماكن
-- ============================================

-- إنشاء جدول places_sync_settings
CREATE TABLE IF NOT EXISTS places_sync_settings (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  city_name TEXT NOT NULL UNIQUE,
  auto_sync_enabled BOOLEAN DEFAULT true,
  sync_interval_days INTEGER DEFAULT 7, -- عدد الأيام بين كل تحديث
  sync_malls BOOLEAN DEFAULT true,
  sync_markets BOOLEAN DEFAULT true,
  sync_areas BOOLEAN DEFAULT true,
  priority INTEGER DEFAULT 0, -- أولوية المدينة (الأعلى أولاً)
  last_sync_at TIMESTAMP WITH TIME ZONE,
  next_sync_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- إنشاء Indexes
CREATE INDEX IF NOT EXISTS idx_places_sync_settings_city ON places_sync_settings(city_name);
CREATE INDEX IF NOT EXISTS idx_places_sync_settings_auto_sync ON places_sync_settings(auto_sync_enabled);
CREATE INDEX IF NOT EXISTS idx_places_sync_settings_priority ON places_sync_settings(priority DESC);
CREATE INDEX IF NOT EXISTS idx_places_sync_settings_next_sync ON places_sync_settings(next_sync_at) WHERE next_sync_at IS NOT NULL;

-- تفعيل RLS
ALTER TABLE places_sync_settings ENABLE ROW LEVEL SECURITY;

-- سياسات RLS - جميع المستخدمين يمكنهم قراءة الإعدادات
DROP POLICY IF EXISTS "Anyone can read sync settings" ON places_sync_settings;
CREATE POLICY "Anyone can read sync settings"
  ON places_sync_settings FOR SELECT
  USING (true);

-- فقط الـ admins يمكنهم إدارة الإعدادات
DROP POLICY IF EXISTS "Admins can manage sync settings" ON places_sync_settings;
CREATE POLICY "Admins can manage sync settings"
  ON places_sync_settings FOR ALL
  USING (public.is_admin(auth.uid()))
  WITH CHECK (public.is_admin(auth.uid()));

-- إدراج إعدادات افتراضية لمدينة السادات (أولوية عالية)
INSERT INTO places_sync_settings (
  city_name,
  auto_sync_enabled,
  sync_interval_days,
  sync_malls,
  sync_markets,
  sync_areas,
  priority,
  last_sync_at,
  next_sync_at
) VALUES (
  'السادات',
  true,
  7, -- تحديث كل أسبوع
  true,
  true,
  true,
  100, -- أولوية عالية جداً
  NOW(),
  NOW() + INTERVAL '7 days'
) ON CONFLICT (city_name) DO UPDATE SET
  priority = 100,
  auto_sync_enabled = true,
  updated_at = NOW();

-- دالة لتحديث next_sync_at تلقائياً
CREATE OR REPLACE FUNCTION update_next_sync_at()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.last_sync_at IS NOT NULL THEN
    NEW.next_sync_at = NEW.last_sync_at + (NEW.sync_interval_days || ' days')::INTERVAL;
  END IF;
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger لتحديث next_sync_at تلقائياً
DROP TRIGGER IF EXISTS trigger_update_next_sync_at ON places_sync_settings;
CREATE TRIGGER trigger_update_next_sync_at
  BEFORE UPDATE ON places_sync_settings
  FOR EACH ROW
  EXECUTE FUNCTION update_next_sync_at();

-- ============================================
-- ✅ تم الإنشاء!
-- ============================================

