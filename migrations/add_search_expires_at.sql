-- Migration: إضافة search_expires_at للعداد التنازلي
-- التاريخ: 2026-01-12
-- الوصف: إضافة حقل search_expires_at لحساب العداد التنازلي من السيرفر مباشرة

-- 1. إضافة حقل search_expires_at
ALTER TABLE orders 
ADD COLUMN IF NOT EXISTS search_expires_at TIMESTAMP WITH TIME ZONE DEFAULT NULL;

-- 2. إنشاء فهرس لتحسين الأداء
CREATE INDEX IF NOT EXISTS idx_orders_search_expires_at ON orders(search_expires_at) WHERE search_expires_at IS NOT NULL;

-- 3. تحديث الطلبات الموجودة (اختياري - للتوافق مع البيانات القديمة)
-- يمكن حذف هذا الجزء إذا لم تكن هناك حاجة
-- UPDATE orders 
-- SET search_expires_at = search_started_at + INTERVAL '30 seconds'
-- WHERE search_status = 'searching' 
--   AND search_started_at IS NOT NULL 
--   AND search_expires_at IS NULL;
