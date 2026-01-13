-- Migration: تحديث نظام البحث إلى مرحلة واحدة (10 كم لمدة 60 ثانية)
-- التاريخ: 2024

-- 1. تحديث إعدادات البحث الموجودة
UPDATE order_search_settings
SET 
  setting_value = '10',
  description = 'نطاق البحث بالكيلومتر (10 كم)'
WHERE setting_key = 'initial_search_radius_km';

UPDATE order_search_settings
SET 
  setting_value = '60',
  description = 'مدة البحث بالثواني (60 ثانية)'
WHERE setting_key = 'initial_search_duration_seconds';

-- 2. إضافة إعدادات جديدة (إذا لم تكن موجودة)
INSERT INTO order_search_settings (setting_key, setting_value, description)
VALUES 
  ('search_radius_km', '10', 'نطاق البحث بالكيلومتر (10 كم)')
ON CONFLICT (setting_key) DO UPDATE
SET 
  setting_value = '10',
  description = 'نطاق البحث بالكيلومتر (10 كم)';

INSERT INTO order_search_settings (setting_key, setting_value, description)
VALUES 
  ('search_duration_seconds', '60', 'مدة البحث بالثواني (60 ثانية)')
ON CONFLICT (setting_key) DO UPDATE
SET 
  setting_value = '60',
  description = 'مدة البحث بالثواني (60 ثانية)';

-- 3. ملاحظة: يمكن الاحتفاظ بالإعدادات القديمة للتوافق مع الكود القديم
-- ولكن النظام الجديد يستخدم search_radius_km و search_duration_seconds

-- 4. التحقق من التحديثات
SELECT 
  setting_key,
  setting_value,
  description
FROM order_search_settings
WHERE setting_key IN (
  'initial_search_radius_km',
  'initial_search_duration_seconds',
  'search_radius_km',
  'search_duration_seconds'
)
ORDER BY setting_key;
