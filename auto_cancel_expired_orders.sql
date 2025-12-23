-- ==========================================
-- وظيفة تلقائية لإلغاء الطلبات المنتهية
-- ==========================================
-- الأهداف:
-- 1. تحديث حالة الطلبات من 'pending' إلى 'cancelled' 
--    إذا كان search_status = 'stopped'
-- 2. تحديث حالة الطلبات من 'pending' إلى 'cancelled'
--    إذا كان driver_response_deadline منتهي
-- ==========================================

-- إنشاء وظيفة لإلغاء الطلبات المنتهية
CREATE OR REPLACE FUNCTION auto_cancel_expired_orders()
RETURNS TABLE(
  order_id UUID,
  reason TEXT
) 
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  UPDATE orders 
  SET 
    status = 'cancelled',
    search_status = 'stopped'
  WHERE status = 'pending'
    AND (
      search_status = 'stopped'
      OR (driver_response_deadline IS NOT NULL AND driver_response_deadline < NOW())
    )
  RETURNING 
    id as order_id,
    CASE 
      WHEN search_status = 'stopped' THEN 'البحث متوقف'
      WHEN driver_response_deadline < NOW() THEN 'الوقت انتهى'
      ELSE 'سبب آخر'
    END as reason;
END;
$$;

-- منح الصلاحيات
GRANT EXECUTE ON FUNCTION auto_cancel_expired_orders() TO anon, authenticated;

-- ==========================================
-- اختبار الوظيفة:
-- ==========================================
-- SELECT * FROM auto_cancel_expired_orders();
-- ==========================================

COMMENT ON FUNCTION auto_cancel_expired_orders() IS 
'وظيفة تلقائية لإلغاء الطلبات المنتهية أو المتوقفة';











