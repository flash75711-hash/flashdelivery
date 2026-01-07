# 🔔 إعداد FCM (Firebase Cloud Messaging) للإشعارات

## 📋 نظرة عامة

تم تحديث نظام الإشعارات لاستخدام **FCM API مباشرة** بدلاً من Expo Push API.

---

## ✅ ما تم إنجازه

### 1. تحديث Edge Function `send-push-notification`
- ✅ تم تحديثها لاستخدام **FCM HTTP v1 API** (الموصى به)
- ✅ تستخدم `profiles.fcm_token` بدلاً من `device_tokens`
- ✅ تدعم إرسال Push Notifications على Android و iOS
- ✅ تقوم بإنشاء JWT token تلقائياً والحصول على Access Token

### 2. إضافة الإشعارات المفقودة
- ✅ إشعار عند استلام الطلب (`pickedUp`)
- ✅ إشعار عند بدء التوصيل (`inTransit`) - تلقائياً بعد 2 ثانية من `pickedUp`
- ✅ إشعار عند إكمال الطلب (`completed`)

---

## 🔧 خطوات الإعداد

### 1. الحصول على Service Account JSON

1. افتح [Firebase Console](https://console.firebase.google.com/)
2. اختر مشروعك
3. اذهب إلى **Project Settings** (⚙️) → **Service accounts**
4. اضغط **Generate new private key**
5. سيتم تحميل ملف JSON (مثل: `firebase-adminsdk-xxxxx.json`)
6. افتح الملف وانسخ محتواه كاملاً

### 2. إضافة Service Account JSON في Supabase

1. افتح [Supabase Dashboard](https://supabase.com/dashboard)
2. اختر مشروعك
3. اذهب إلى **Edge Functions** → **Settings**
4. في قسم **Secrets**، أضف:
   - **Name**: `FCM_SERVICE_ACCOUNT_JSON`
   - **Value**: الصق محتوى ملف JSON كاملاً (يجب أن يكون JSON صحيح)
5. احفظ

**مثال على القيمة:**
```json
{
  "type": "service_account",
  "project_id": "your-project-id",
  "private_key_id": "...",
  "private_key": "-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n",
  "client_email": "...",
  ...
}
```

### 3. نشر Edge Function (إذا لم تكن منشورة)

```bash
cd supabase/functions/send-push-notification
supabase functions deploy send-push-notification
```

---

## 📱 الإشعارات المتاحة

### من السائق إلى العميل:

| الحالة | العنوان | الرسالة | النوع |
|--------|---------|---------|------|
| `pickedUp` | تم استلام الطلب | تم استلام طلبك من قبل السائق وهو في الطريق إليك. | `info` |
| `inTransit` | الطلب قيد التوصيل | طلبك في الطريق إليك الآن. | `info` |
| `completed` | تم إكمال الطلب | تم إكمال طلبك بنجاح. شكراً لاستخدامك Flash Delivery! | `success` |

---

## 🔍 كيفية التحقق

### 1. تحقق من FCM Token
```sql
SELECT id, full_name, fcm_token, updated_at 
FROM profiles 
WHERE fcm_token IS NOT NULL;
```

### 2. تحقق من Edge Function Logs
- في Supabase Dashboard → Edge Functions → `send-push-notification` → Logs
- ابحث عن رسائل مثل:
  - `✅ FCM notification sent successfully`
  - `❌ Error sending push notification`

### 3. اختبار الإشعارات
1. سجّل الدخول كسائق
2. اقبل طلباً
3. استلم العناصر (سيتم إرسال إشعار `pickedUp`)
4. بعد ثانيتين (سيتم إرسال إشعار `inTransit`)
5. أكمل الطلب (سيتم إرسال إشعار `completed`)

---

## ⚠️ ملاحظات مهمة

### 1. FCM HTTP v1 API
- يستخدم HTTP v1 API (الموصى به من Firebase)
- يحتاج إلى Service Account JSON
- يقوم بإنشاء JWT token تلقائياً والحصول على Access Token
- أكثر أماناً من Legacy API

### 2. FCM Token
- يتم حفظه في `profiles.fcm_token`
- يتم تحديثه عبر Edge Function `update-fcm-token`
- يجب أن يكون Token صالحاً لإرسال الإشعارات

### 3. الأمان
- **لا تشارك** FCM Server Key مع أحد
- احفظه في Supabase Secrets فقط
- لا تكتبه في الكود

---

## 🐛 حل المشاكل

### المشكلة: "FCM_SERVICE_ACCOUNT_JSON not found"
**الحل**: تأكد من إضافة `FCM_SERVICE_ACCOUNT_JSON` في Supabase Edge Functions Secrets

### المشكلة: "Invalid Service Account JSON"
**الحل**: 
- تأكد من أن JSON صحيح وصالح
- تأكد من نسخ الملف كاملاً بما في ذلك الأقواس `{}`
- تأكد من أن `private_key` يحتوي على `\n` (newlines)

### المشكلة: "No FCM token found for user"
**الحل**: 
- تأكد من أن المستخدم لديه FCM token في `profiles.fcm_token`
- تحقق من أن Edge Function `update-fcm-token` تعمل بشكل صحيح

### المشكلة: الإشعارات لا تصل
**الحل**:
1. تحقق من FCM Token في قاعدة البيانات
2. تحقق من Edge Function Logs
3. تأكد من أن FCM Server Key صحيح
4. تحقق من أن التطبيق لديه صلاحيات الإشعارات

---

## 📚 المراجع

- [FCM HTTP v1 API Documentation](https://firebase.google.com/docs/cloud-messaging/send-message)
- [FCM Authentication Guide](https://firebase.google.com/docs/cloud-messaging/auth-server)
- [Supabase Edge Functions](https://supabase.com/docs/guides/functions)
- [FCM Token Setup Guide](./FCM_TOKEN_SETUP.md)

---

**تاريخ التحديث**: $(date)
**الحالة**: ✅ جاهز للاستخدام
