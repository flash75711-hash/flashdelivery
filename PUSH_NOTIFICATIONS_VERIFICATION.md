# 🔔 التحقق من Push Notifications للسائقين

## 📋 نظرة عامة

هذا المستند يوثق كيفية عمل Push Notifications للسائقين عند البحث عنهم في نطاق 5 و 10 كيلو.

---

## 🔍 مسار إرسال Push Notifications

### 1️⃣ **عند استخدام `useOrderSearch` Hook**

#### المسار:
```
useOrderSearch.ts → notifyDrivers() 
  → createNotification() 
    → sendPushNotification() 
      → Edge Function: send-push-notification
```

#### الكود:
- **الموقع**: `hooks/useOrderSearch.ts` (السطر 184-205)
- **الدالة**: `notifyDrivers()`
- **يستدعي**: `createNotification()` من `lib/notifications.ts`

#### التحقق:
✅ `createNotification` يتم استدعاؤها مع `order_id`
✅ `sendPushNotification` يتم استدعاؤها في السطر 245 من `lib/notifications.ts`
✅ Edge Function `send-push-notification` يتم استدعاؤها

---

### 2️⃣ **عند استخدام Edge Function `start-order-search`**

#### المسار:
```
Edge Function: start-order-search
  → insert_notification_for_driver (RPC)
  → Edge Function: send-push-notification (مباشرة)
```

#### الكود:
- **الموقع**: `supabase/functions/start-order-search/index.ts` (السطر 117-156)
- **يستدعي**: `send-push-notification` مباشرة بعد إنشاء In-App Notification

#### التحقق:
✅ يتم إرسال Push Notification مباشرة بعد إنشاء In-App Notification
✅ يتم استخدام Service Role Key للاستدعاء الداخلي

---

## ✅ نقاط التحقق

### 1. **FCM Token محفوظة بشكل صحيح**
```sql
-- التحقق من وجود FCM tokens للسائقين
SELECT id, role, fcm_token 
FROM profiles 
WHERE role = 'driver' 
  AND status = 'active' 
  AND approval_status = 'approved'
  AND fcm_token IS NOT NULL;
```

### 2. **Edge Function `send-push-notification` مضبوطة**
- ✅ تقرأ FCM token من `profiles.fcm_token`
- ✅ تستخدم `FCM_SERVICE_ACCOUNT_JSON` من Environment Variables
- ✅ ترسل Push Notification عبر FCM HTTP v1 API

### 3. **Edge Function `create-notification` ترسل Push Notifications**
- ✅ بعد إنشاء In-App Notification، تستدعي `send-push-notification`
- ✅ تستخدم Service Role Key للاستدعاء الداخلي

### 4. **`createNotification` في `lib/notifications.ts`**
- ✅ عندما يكون المستخدم عميلاً والمستلم سائق:
  - ينشئ In-App Notification عبر RPC
  - يستدعي `sendPushNotification` في السطر 245
- ✅ عندما لا يكون هناك session:
  - يستدعي Edge Function `create-notification` التي ترسل Push Notification تلقائياً

---

## 🔧 الإعدادات المطلوبة

### 1. **FCM Service Account JSON**
```bash
# في Supabase Dashboard → Edge Functions → Secrets
FCM_SERVICE_ACCOUNT_JSON = {
  "type": "service_account",
  "project_id": "...",
  "private_key_id": "...",
  "private_key": "...",
  "client_email": "...",
  ...
}
```

### 2. **FCM Token في profiles**
- يتم حفظ FCM token عبر Edge Function `update-fcm-token`
- يجب أن يكون موجوداً في `profiles.fcm_token` لكل سائق

---

## 🐛 المشاكل المحتملة وحلولها

### ❌ **المشكلة 1: Push Notifications لا تصل**
**التحقق:**
1. فحص FCM tokens في قاعدة البيانات
2. فحص `FCM_SERVICE_ACCOUNT_JSON` في Edge Function secrets
3. فحص logs في Edge Function `send-push-notification`

**الحل:**
```sql
-- التحقق من FCM tokens
SELECT id, role, fcm_token 
FROM profiles 
WHERE role = 'driver' 
  AND fcm_token IS NULL;
```

### ❌ **المشكلة 2: `sendPushNotification` لا يتم استدعاؤها**
**التحقق:**
- فحص console logs في المتصفح/التطبيق
- البحث عن `[sendPushNotification]` في logs

**الحل:**
- التأكد من أن `createNotification` لا توقف التنفيذ قبل السطر 245
- التأكد من أن `sendPushNotification` يتم استدعاؤها بعد إنشاء In-App Notification

### ❌ **المشكلة 3: Edge Function `send-push-notification` تفشل**
**التحقق:**
- فحص logs في Supabase Dashboard → Edge Functions → Logs
- البحث عن أخطاء في `send-push-notification`

**الحل:**
- التحقق من `FCM_SERVICE_ACCOUNT_JSON`
- التحقق من صحة FCM token في قاعدة البيانات

---

## 📊 اختبار Push Notifications

### 1. **اختبار يدوي**
```typescript
// في console المتصفح/التطبيق
import { createNotification } from '@/lib/notifications';

await createNotification({
  user_id: 'driver-id-here',
  title: 'اختبار Push Notification',
  message: 'هذا اختبار',
  type: 'info',
  order_id: 'order-id-here',
});
```

### 2. **اختبار Edge Function مباشرة**
```bash
curl -X POST https://YOUR_PROJECT.supabase.co/functions/v1/send-push-notification \
  -H "Authorization: Bearer YOUR_SERVICE_ROLE_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "user_id": "driver-id-here",
    "title": "اختبار",
    "message": "هذا اختبار",
    "data": {"order_id": "order-id-here"}
  }'
```

### 3. **فحص Logs**
- Supabase Dashboard → Edge Functions → Logs
- البحث عن `✅ Push notification sent to driver`
- البحث عن أخطاء في `send-push-notification`

---

## ✅ الخلاصة

### المسارات المؤكدة:
1. ✅ `useOrderSearch` → `notifyDrivers` → `createNotification` → `sendPushNotification`
2. ✅ Edge Function `start-order-search` → `send-push-notification` مباشرة
3. ✅ Edge Function `create-notification` → `send-push-notification` تلقائياً

### النقاط الحرجة:
- ✅ FCM tokens محفوظة في `profiles.fcm_token`
- ✅ `FCM_SERVICE_ACCOUNT_JSON` مضبوط في Edge Function secrets
- ✅ `sendPushNotification` يتم استدعاؤها بعد إنشاء In-App Notification
- ✅ Edge Functions تستخدم Service Role Key للاستدعاءات الداخلية

---

## 🔍 خطوات التحقق السريع

1. **فحص FCM tokens:**
   ```sql
   SELECT COUNT(*) FROM profiles 
   WHERE role = 'driver' AND fcm_token IS NOT NULL;
   ```

2. **فحص Edge Function secrets:**
   - Supabase Dashboard → Edge Functions → Secrets
   - التحقق من وجود `FCM_SERVICE_ACCOUNT_JSON`

3. **فحص Logs:**
   - Supabase Dashboard → Edge Functions → Logs
   - البحث عن `send-push-notification` logs

4. **اختبار مباشر:**
   - استخدام Edge Function `send-push-notification` مباشرة
   - التحقق من الرد والنتيجة

---

**آخر تحديث:** 2025-01-XX
