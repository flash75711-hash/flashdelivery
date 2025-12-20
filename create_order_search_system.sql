-- ============================================
-- نظام البحث التلقائي عن السائقين
-- ============================================
-- نفذ هذا الملف في Supabase SQL Editor

-- 1. إضافة حقل search_status لجدول orders
ALTER TABLE orders 
ADD COLUMN IF NOT EXISTS search_status TEXT CHECK (search_status IN ('searching', 'expanded', 'stopped', 'found')) DEFAULT NULL;

ALTER TABLE orders 
ADD COLUMN IF NOT EXISTS search_started_at TIMESTAMP WITH TIME ZONE DEFAULT NULL;

ALTER TABLE orders 
ADD COLUMN IF NOT EXISTS search_expanded_at TIMESTAMP WITH TIME ZONE DEFAULT NULL;

-- 2. إنشاء جدول إعدادات البحث
CREATE TABLE IF NOT EXISTS order_search_settings (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  setting_key TEXT UNIQUE NOT NULL,
  setting_value TEXT NOT NULL,
  description TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- إدراج الإعدادات الافتراضية
INSERT INTO order_search_settings (setting_key, setting_value, description) VALUES
  ('initial_search_radius_km', '3', 'نطاق البحث الأولي بالكيلومتر'),
  ('expanded_search_radius_km', '6', 'نطاق البحث الموسع بالكيلومتر'),
  ('initial_search_duration_seconds', '10', 'مدة البحث الأولي بالثواني'),
  ('expanded_search_duration_seconds', '10', 'مدة البحث الموسع بالثواني')
ON CONFLICT (setting_key) DO NOTHING;

-- 3. إنشاء Index لتحسين الأداء
CREATE INDEX IF NOT EXISTS idx_orders_search_status ON orders(search_status);
CREATE INDEX IF NOT EXISTS idx_orders_search_started_at ON orders(search_started_at);

-- 4. دالة لجلب إعدادات البحث
CREATE OR REPLACE FUNCTION get_search_setting(p_key TEXT)
RETURNS TEXT AS $$
DECLARE
  v_value TEXT;
BEGIN
  SELECT setting_value INTO v_value
  FROM order_search_settings
  WHERE setting_key = p_key;
  
  RETURN COALESCE(v_value, '3'); -- قيمة افتراضية
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 5. دالة لتحديث إعدادات البحث
CREATE OR REPLACE FUNCTION update_search_setting(p_key TEXT, p_value TEXT)
RETURNS BOOLEAN AS $$
BEGIN
  INSERT INTO order_search_settings (setting_key, setting_value, updated_at)
  VALUES (p_key, p_value, NOW())
  ON CONFLICT (setting_key) 
  DO UPDATE SET 
    setting_value = EXCLUDED.setting_value,
    updated_at = NOW();
  
  RETURN TRUE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 6. RLS Policies
ALTER TABLE order_search_settings ENABLE ROW LEVEL SECURITY;

-- الجميع يمكنهم قراءة الإعدادات
CREATE POLICY "Anyone can read search settings"
ON order_search_settings FOR SELECT
USING (true);

-- فقط المديرون يمكنهم تحديث الإعدادات
CREATE POLICY "Admins can update search settings"
ON order_search_settings FOR UPDATE
USING (EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin'));

CREATE POLICY "Admins can insert search settings"
ON order_search_settings FOR INSERT
WITH CHECK (EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin'));

-- ============================================
-- دوال مساعدة للبحث عن السائقين
-- ============================================

-- دالة للبحث عن السائقين في نطاق معين
CREATE OR REPLACE FUNCTION find_drivers_in_radius(
  p_latitude DOUBLE PRECISION,
  p_longitude DOUBLE PRECISION,
  p_radius_km DOUBLE PRECISION
)
RETURNS TABLE (
  driver_id UUID,
  latitude DOUBLE PRECISION,
  longitude DOUBLE PRECISION,
  distance_km DOUBLE PRECISION
) AS $$
BEGIN
  RETURN QUERY
  WITH driver_locations_latest AS (
    SELECT DISTINCT ON (dl.driver_id)
      dl.driver_id,
      dl.latitude,
      dl.longitude
    FROM driver_locations dl
    INNER JOIN profiles p ON p.id = dl.driver_id
    WHERE p.role = 'driver'
      AND p.status = 'active'
      AND p.approval_status = 'approved'
      AND dl.latitude IS NOT NULL
      AND dl.longitude IS NOT NULL
    ORDER BY dl.driver_id, dl.updated_at DESC
  )
  SELECT 
    dll.driver_id,
    dll.latitude,
    dll.longitude,
    (
      6371 * acos(
        cos(radians(p_latitude)) *
        cos(radians(dll.latitude)) *
        cos(radians(dll.longitude) - radians(p_longitude)) +
        sin(radians(p_latitude)) *
        sin(radians(dll.latitude))
      )
    ) AS distance_km
  FROM driver_locations_latest dll
  WHERE (
    6371 * acos(
      cos(radians(p_latitude)) *
      cos(radians(dll.latitude)) *
      cos(radians(dll.longitude) - radians(p_longitude)) +
      sin(radians(p_latitude)) *
      sin(radians(dll.latitude))
    )
  ) <= p_radius_km
  ORDER BY distance_km ASC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- دالة لتحديث حالة البحث للطلب
CREATE OR REPLACE FUNCTION update_order_search_status(
  p_order_id UUID,
  p_status TEXT,
  p_started_at TIMESTAMP WITH TIME ZONE DEFAULT NULL,
  p_expanded_at TIMESTAMP WITH TIME ZONE DEFAULT NULL
)
RETURNS BOOLEAN AS $$
BEGIN
  UPDATE orders
  SET 
    search_status = p_status,
    search_started_at = COALESCE(p_started_at, search_started_at),
    search_expanded_at = COALESCE(p_expanded_at, search_expanded_at)
  WHERE id = p_order_id;
  
  RETURN FOUND;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- دالة لإعادة تشغيل البحث للطلب
CREATE OR REPLACE FUNCTION restart_order_search(p_order_id UUID)
RETURNS BOOLEAN AS $$
BEGIN
  UPDATE orders
  SET 
    search_status = 'searching',
    search_started_at = NOW(),
    search_expanded_at = NULL
  WHERE id = p_order_id
    AND status = 'pending';
  
  RETURN FOUND;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- دالة للتحقق من قبول الطلب
CREATE OR REPLACE FUNCTION is_order_accepted(p_order_id UUID)
RETURNS BOOLEAN AS $$
DECLARE
  v_status TEXT;
  v_driver_id UUID;
BEGIN
  SELECT status, driver_id INTO v_status, v_driver_id
  FROM orders
  WHERE id = p_order_id;
  
  RETURN v_status = 'accepted' AND v_driver_id IS NOT NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- دالة لإرسال إشعارات لسائقين في نطاق معين
CREATE OR REPLACE FUNCTION notify_drivers_in_radius(
  p_latitude DOUBLE PRECISION,
  p_longitude DOUBLE PRECISION,
  p_radius_km DOUBLE PRECISION,
  p_title TEXT,
  p_message TEXT,
  p_type TEXT DEFAULT 'info'
)
RETURNS INTEGER AS $$
DECLARE
  v_driver_count INTEGER;
BEGIN
  -- البحث عن السائقين في النطاق
  WITH drivers_in_range AS (
    SELECT driver_id
    FROM find_drivers_in_radius(p_latitude, p_longitude, p_radius_km)
  )
  INSERT INTO notifications (user_id, title, message, type)
  SELECT driver_id, p_title, p_message, p_type
  FROM drivers_in_range;
  
  GET DIAGNOSTICS v_driver_count = ROW_COUNT;
  RETURN v_driver_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- دالة للحصول على جميع إعدادات البحث
CREATE OR REPLACE FUNCTION get_all_search_settings()
RETURNS TABLE (
  setting_key TEXT,
  setting_value TEXT,
  description TEXT
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    oss.setting_key,
    oss.setting_value,
    oss.description
  FROM order_search_settings oss
  ORDER BY oss.setting_key;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- دالة لتحديث إعدادات البحث (جميعها مرة واحدة)
CREATE OR REPLACE FUNCTION update_all_search_settings(
  p_initial_radius DOUBLE PRECISION,
  p_expanded_radius DOUBLE PRECISION,
  p_initial_duration INTEGER,
  p_expanded_duration INTEGER
)
RETURNS BOOLEAN AS $$
BEGIN
  -- تحديث النطاق الأولي
  INSERT INTO order_search_settings (setting_key, setting_value, updated_at)
  VALUES ('initial_search_radius_km', p_initial_radius::TEXT, NOW())
  ON CONFLICT (setting_key) 
  DO UPDATE SET 
    setting_value = EXCLUDED.setting_value,
    updated_at = NOW();
  
  -- تحديث النطاق الموسع
  INSERT INTO order_search_settings (setting_key, setting_value, updated_at)
  VALUES ('expanded_search_radius_km', p_expanded_radius::TEXT, NOW())
  ON CONFLICT (setting_key) 
  DO UPDATE SET 
    setting_value = EXCLUDED.setting_value,
    updated_at = NOW();
  
  -- تحديث المدة الأولية
  INSERT INTO order_search_settings (setting_key, setting_value, updated_at)
  VALUES ('initial_search_duration_seconds', p_initial_duration::TEXT, NOW())
  ON CONFLICT (setting_key) 
  DO UPDATE SET 
    setting_value = EXCLUDED.setting_value,
    updated_at = NOW();
  
  -- تحديث المدة الموسعة
  INSERT INTO order_search_settings (setting_key, setting_value, updated_at)
  VALUES ('expanded_search_duration_seconds', p_expanded_duration::TEXT, NOW())
  ON CONFLICT (setting_key) 
  DO UPDATE SET 
    setting_value = EXCLUDED.setting_value,
    updated_at = NOW();
  
  RETURN TRUE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- دالة للحصول على إحصائيات البحث
CREATE OR REPLACE FUNCTION get_search_statistics(
  p_start_date TIMESTAMP WITH TIME ZONE DEFAULT NOW() - INTERVAL '7 days',
  p_end_date TIMESTAMP WITH TIME ZONE DEFAULT NOW()
)
RETURNS TABLE (
  total_searches INTEGER,
  successful_searches INTEGER,
  stopped_searches INTEGER,
  average_search_time_seconds DOUBLE PRECISION
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    COUNT(*)::INTEGER AS total_searches,
    COUNT(*) FILTER (WHERE search_status = 'found')::INTEGER AS successful_searches,
    COUNT(*) FILTER (WHERE search_status = 'stopped')::INTEGER AS stopped_searches,
    AVG(
      EXTRACT(EPOCH FROM (
        COALESCE(search_expanded_at, NOW()) - search_started_at
      ))
    ) AS average_search_time_seconds
  FROM orders
  WHERE search_started_at IS NOT NULL
    AND search_started_at >= p_start_date
    AND search_started_at <= p_end_date;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;



