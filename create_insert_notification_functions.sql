-- ============================================
-- إنشاء RPC Functions للإشعارات
-- ============================================
-- نفذ هذا الملف في Supabase SQL Editor

-- 1. دالة لإدراج إشعار للعميل من قبل السائق (لتجاوز RLS)
CREATE OR REPLACE FUNCTION insert_notification_for_customer_by_driver(
  p_user_id UUID,
  p_title TEXT,
  p_message TEXT,
  p_type TEXT DEFAULT 'info',
  p_order_id UUID DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_notification_id UUID;
BEGIN
  -- إدراج الإشعار مباشرة (باستخدام SECURITY DEFINER لتجاوز RLS)
  INSERT INTO notifications (
    user_id,
    title,
    message,
    type,
    order_id,
    is_read,
    created_at
  )
  VALUES (
    p_user_id,
    p_title,
    p_message,
    p_type,
    p_order_id,
    false,
    NOW()
  )
  RETURNING id INTO v_notification_id;
  
  RETURN v_notification_id;
END;
$$;

-- 2. دالة لإدراج إشعار للسائق من قبل العميل (لتجاوز RLS)
CREATE OR REPLACE FUNCTION insert_notification_for_driver(
  p_user_id UUID,
  p_title TEXT,
  p_message TEXT,
  p_type TEXT DEFAULT 'info',
  p_order_id UUID DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_notification_id UUID;
BEGIN
  -- إدراج الإشعار مباشرة (باستخدام SECURITY DEFINER لتجاوز RLS)
  INSERT INTO notifications (
    user_id,
    title,
    message,
    type,
    order_id,
    is_read,
    created_at
  )
  VALUES (
    p_user_id,
    p_title,
    p_message,
    p_type,
    p_order_id,
    false,
    NOW()
  )
  RETURNING id INTO v_notification_id;
  
  RETURN v_notification_id;
END;
$$;

-- 3. منح الصلاحيات
GRANT EXECUTE ON FUNCTION insert_notification_for_customer_by_driver TO authenticated;
GRANT EXECUTE ON FUNCTION insert_notification_for_driver TO authenticated;

-- 4. تفعيل Realtime لجدول notifications (إذا لم يكن مفعلاً)
ALTER PUBLICATION supabase_realtime ADD TABLE notifications;

-- 5. التحقق من أن الدوال موجودة
SELECT 
  routine_name,
  routine_type,
  security_type
FROM information_schema.routines
WHERE routine_schema = 'public'
  AND routine_name IN ('insert_notification_for_customer_by_driver', 'insert_notification_for_driver');

