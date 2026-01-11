-- ============================================
-- إنشاء جدول إعدادات التطبيق
-- ============================================

-- جدول الإعدادات العامة
CREATE TABLE IF NOT EXISTS app_settings (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  setting_key TEXT UNIQUE NOT NULL,
  setting_value TEXT NOT NULL,
  setting_type TEXT CHECK (setting_type IN ('number', 'text', 'boolean')) DEFAULT 'text',
  description TEXT,
  category TEXT DEFAULT 'general',
  updated_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- إضافة الإعدادات الافتراضية
INSERT INTO app_settings (setting_key, setting_value, setting_type, description, category) VALUES
  ('driver_response_timeout', '30', 'number', 'مدة انتظار رد السائق بالثواني', 'orders')
ON CONFLICT (setting_key) DO NOTHING;

-- إضافة أعمدة جديدة لجدول orders
ALTER TABLE orders 
ADD COLUMN IF NOT EXISTS driver_response_deadline TIMESTAMP WITH TIME ZONE,
ADD COLUMN IF NOT EXISTS retry_count INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS last_retry_at TIMESTAMP WITH TIME ZONE;

-- تحديث الطلبات الحالية
UPDATE orders 
SET 
  driver_response_deadline = created_at + INTERVAL '30 seconds',
  retry_count = 0
WHERE status = 'pending' 
  AND driver_response_deadline IS NULL;

-- إنشاء index للأداء
CREATE INDEX IF NOT EXISTS idx_orders_response_deadline 
  ON orders(driver_response_deadline) 
  WHERE status = 'pending';

CREATE INDEX IF NOT EXISTS idx_orders_retry_count 
  ON orders(retry_count) 
  WHERE status = 'pending';

-- RLS للإعدادات
ALTER TABLE app_settings ENABLE ROW LEVEL SECURITY;

-- المدراء فقط يمكنهم تعديل الإعدادات
DROP POLICY IF EXISTS "Admins can manage settings" ON app_settings;
CREATE POLICY "Admins can manage settings"
  ON app_settings FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role = 'admin'
    )
  );

-- الجميع يمكنهم قراءة الإعدادات
DROP POLICY IF EXISTS "Everyone can read settings" ON app_settings;
CREATE POLICY "Everyone can read settings"
  ON app_settings FOR SELECT
  USING (true);

-- Function لجلب إعداد معين
CREATE OR REPLACE FUNCTION get_app_setting(p_key TEXT)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_value TEXT;
BEGIN
  SELECT setting_value INTO v_value
  FROM app_settings
  WHERE setting_key = p_key;
  
  RETURN v_value;
END;
$$;

-- Function لتحديث إعداد
CREATE OR REPLACE FUNCTION update_app_setting(
  p_key TEXT,
  p_value TEXT,
  p_user_id UUID
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_is_admin BOOLEAN;
BEGIN
  -- التحقق من أن المستخدم مدير
  SELECT EXISTS (
    SELECT 1 FROM profiles
    WHERE id = p_user_id
    AND role = 'admin'
  ) INTO v_is_admin;
  
  IF NOT v_is_admin THEN
    RAISE EXCEPTION 'Only admins can update settings';
  END IF;
  
  -- تحديث الإعداد
  UPDATE app_settings
  SET 
    setting_value = p_value,
    updated_by = p_user_id,
    updated_at = NOW()
  WHERE setting_key = p_key;
  
  RETURN FOUND;
END;
$$;

-- Function لإعادة محاولة الطلب
-- تم إزالة function retry_order_search - نظام إعادة المحاولات التلقائية غير مفعّل حالياً

-- Trigger لتحديث updated_at تلقائياً
CREATE OR REPLACE FUNCTION update_app_settings_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS app_settings_updated_at ON app_settings;
CREATE TRIGGER app_settings_updated_at
  BEFORE UPDATE ON app_settings
  FOR EACH ROW
  EXECUTE FUNCTION update_app_settings_timestamp();

COMMENT ON TABLE app_settings IS 'إعدادات التطبيق العامة';
COMMENT ON COLUMN app_settings.setting_key IS 'مفتاح الإعداد (فريد)';
COMMENT ON COLUMN app_settings.setting_value IS 'قيمة الإعداد';
COMMENT ON COLUMN app_settings.setting_type IS 'نوع البيانات: number, text, boolean';
COMMENT ON COLUMN app_settings.description IS 'وصف الإعداد';
COMMENT ON COLUMN app_settings.category IS 'تصنيف الإعداد';

COMMENT ON FUNCTION get_app_setting IS 'جلب قيمة إعداد معين';
COMMENT ON FUNCTION update_app_setting IS 'تحديث إعداد (للمدراء فقط)';
-- تم إزالة function retry_order_search











