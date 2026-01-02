-- ============================================
-- حذف جميع الطلبات والرحلات والإشعارات المرتبطة
-- ============================================
-- ⚠️ تحذير: هذا الاستعلام سيحذف جميع البيانات التالية:
-- - جميع عناصر الطلبات (order_items)
-- - جميع الإشعارات المرتبطة بالطلبات (notifications)
-- - جميع مواقع السائقين المرتبطة بالطلبات (driver_locations)
-- - جميع المعاملات المالية المرتبطة بالطلبات (wallets)
-- - جميع الطلبات (orders)
-- ============================================

-- 1. حذف جميع عناصر الطلبات (order_items)
DELETE FROM order_items;

-- 2. حذف جميع الإشعارات المرتبطة بالطلبات
DELETE FROM notifications 
WHERE order_id IS NOT NULL;

-- 3. حذف جميع مواقع السائقين المرتبطة بالطلبات
DELETE FROM driver_locations 
WHERE order_id IS NOT NULL;

-- 4. حذف جميع المعاملات المالية المرتبطة بالطلبات
DELETE FROM wallets 
WHERE order_id IS NOT NULL;

-- 5. حذف جميع الطلبات
DELETE FROM orders;

-- ============================================
-- التحقق من الحذف
-- ============================================

-- عرض عدد الطلبات المتبقية (يجب أن يكون 0)
SELECT COUNT(*) as remaining_orders FROM orders;

-- عرض عدد الإشعارات المتبقية المرتبطة بالطلبات (يجب أن يكون 0)
SELECT COUNT(*) as remaining_order_notifications 
FROM notifications 
WHERE order_id IS NOT NULL;

-- عرض عدد مواقع السائقين المتبقية المرتبطة بالطلبات (يجب أن يكون 0)
SELECT COUNT(*) as remaining_order_locations 
FROM driver_locations 
WHERE order_id IS NOT NULL;

-- عرض عدد المعاملات المالية المتبقية المرتبطة بالطلبات (يجب أن يكون 0)
SELECT COUNT(*) as remaining_order_wallets 
FROM wallets 
WHERE order_id IS NOT NULL;

-- عرض عدد عناصر الطلبات المتبقية (يجب أن يكون 0)
SELECT COUNT(*) as remaining_order_items 
FROM order_items;






















