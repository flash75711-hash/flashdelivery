# 🔧 إعداد RPC Functions للإشعارات

## المشكلة
الإشعارات لا تظهر للعميل لأن RPC functions قد لا تكون موجودة في قاعدة البيانات.

## الحل

### 1. نفذ SQL في Supabase

افتح Supabase Dashboard → SQL Editor ونفذ ملف:
`create_insert_notification_functions.sql`

أو نفذ مباشرة:

```sql
-- دالة لإدراج إشعار للعميل من قبل السائق
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

-- دالة لإدراج إشعار للسائق من قبل العميل
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

-- منح الصلاحيات
GRANT EXECUTE ON FUNCTION insert_notification_for_customer_by_driver TO authenticated;
GRANT EXECUTE ON FUNCTION insert_notification_for_driver TO authenticated;
```

### 2. تفعيل Realtime

```sql
-- تفعيل Realtime لجدول notifications
ALTER PUBLICATION supabase_realtime ADD TABLE notifications;
```

### 3. التحقق

```sql
-- التحقق من أن الدوال موجودة
SELECT 
  routine_name,
  routine_type,
  security_type
FROM information_schema.routines
WHERE routine_schema = 'public'
  AND routine_name IN ('insert_notification_for_customer_by_driver', 'insert_notification_for_driver');
```

---

## بعد التنفيذ

1. أعد تحميل التطبيق
2. جرب قبول طلب من السائق
3. راقب Console للأخطاء أو logs
4. يجب أن تظهر:
   - `📧 [handleAcceptOrder] إرسال إشعار للعميل...`
   - `✅ [handleAcceptOrder] تم إرسال إشعار للعميل بنجاح`
   - `🔔 [useFloatingNotifications] Realtime: إشعار جديد`

---

**تاريخ الإنشاء**: $(date)

