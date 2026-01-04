# 🔧 إصلاح مشكلة عدم ظهور الإشعارات للعميل

## المشكلة
الإشعارات لا تظهر للعميل عند قبول السائق للطلب.

## الحل

### 1️⃣ تنفيذ SQL في Supabase

افتح **Supabase Dashboard** → **SQL Editor** ونفذ ملف:
```
create_insert_notification_functions.sql
```

أو انسخ والصق المحتوى مباشرة.

**ملاحظة مهمة**: تأكد من تنفيذ جميع الأوامر في الملف، خاصة:
- إنشاء الدوال RPC
- منح الصلاحيات
- تفعيل Realtime

### 2️⃣ التحقق من التنفيذ

بعد تنفيذ SQL، نفذ هذا الاستعلام للتحقق:

```sql
-- التحقق من وجود الدوال
SELECT 
  routine_name,
  routine_type,
  security_type
FROM information_schema.routines
WHERE routine_schema = 'public'
  AND routine_name IN ('insert_notification_for_customer_by_driver', 'insert_notification_for_driver');

-- يجب أن ترى نتيجتين:
-- 1. insert_notification_for_customer_by_driver
-- 2. insert_notification_for_driver
```

### 3️⃣ إعادة تحميل التطبيق

1. أعد تحميل التطبيق (Refresh)
2. افتح Developer Console (F12)
3. ابحث عن هذه الـ logs:
   - `🔌 [useFloatingNotifications] بدء الاشتراك في Realtime`
   - `✅ [useFloatingNotifications] تم الاشتراك بنجاح في Realtime`

### 4️⃣ اختبار

1. **افتح تبويبين**:
   - تبويب 1: **السائق** (Driver)
   - تبويب 2: **العميل** (Customer)

2. **في تبويب العميل**:
   - افتح Developer Console (F12)
   - راقب الـ logs

3. **في تبويب السائق**:
   - قبل طلباً
   - راقب الـ logs في Console

4. **ما يجب أن تراه في Console**:

   **في تبويب السائق:**
   ```
   📧 [handleAcceptOrder] إرسال إشعار للعميل...
   ✅ [handleAcceptOrder] تم إرسال إشعار للعميل بنجاح
   ```

   **في تبويب العميل:**
   ```
   🔔 [useFloatingNotifications] Realtime: إشعار جديد
   ➕ [useFloatingNotifications] إضافة إشعار جديد
   📱 [useFloatingNotifications] عرض الإشعار مباشرة
   ```

### 5️⃣ إذا لم تظهر الإشعارات

#### أ. تحقق من حالة الـ Subscription

في Console العميل، ابحث عن:
```
📡 [useFloatingNotifications] Subscription status: SUBSCRIBED
```

إذا كان `CHANNEL_ERROR` أو `TIMED_OUT`:
- تحقق من اتصال الإنترنت
- تحقق من أن Realtime مفعّل في Supabase Dashboard

#### ب. تحقق من Polling

الـ Polling يعمل كل 3 ثواني كـ fallback. يجب أن ترى:
```
🔄 [useFloatingNotifications] Polling: إشعار جديد
```

#### ج. تحقق من RPC Functions

في Supabase Dashboard → Database → Functions:
- يجب أن ترى `insert_notification_for_customer_by_driver`
- يجب أن ترى `insert_notification_for_driver`

#### د. تحقق من Realtime

في Supabase Dashboard → Database → Replication:
- تأكد من أن `notifications` table مفعّل

---

## ملاحظات

- الـ Polling يعمل كـ fallback كل 3 ثواني إذا فشل Realtime
- الإشعارات تُعرض تلقائياً عند استقبالها
- إذا كان هناك إشعار معروض، الإشعارات الجديدة تُضاف إلى الطابور

---

**تاريخ الإنشاء**: 2024
