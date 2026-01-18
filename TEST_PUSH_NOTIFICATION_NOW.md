# 🧪 اختبار Push Notifications الآن

## 📋 ملخص الوضع الحالي

### ✅ ما تم التحقق منه:
1. **FCM Tokens موجودة**: كلا السائقين لديهما FCM tokens في جدول `profiles`
   - السائق 1: `+201019527786` - FCM token موجود (142 حرف)
   - السائق 2: `+202222222222` (تاتات) - FCM token موجود (142 حرف)

2. **Edge Function موجودة**: `send-push-notification` موجودة ومفعلة (version 3)

3. **In-App Notifications**: تم إنشاء 4 إشعارات لكل سائق في آخر طلب

### ❓ ما يحتاج للتحقق:
- **Push Notifications**: لا توجد logs في Edge Functions لـ `send-push-notification` في آخر 24 ساعة

---

## 🚀 خطوات الاختبار السريع

### 1️⃣ **الحصول على Service Role Key**

1. اذهب إلى [Supabase Dashboard](https://supabase.com/dashboard)
2. اختر مشروعك
3. اذهب إلى **Settings** → **API**
4. انسخ **Service Role Key** (⚠️ حساس - لا تشاركه)

---

### 2️⃣ **اختبار مباشر باستخدام curl**

```bash
# استبدل SERVICE_ROLE_KEY بقيمة Service Role Key
SERVICE_ROLE_KEY="YOUR_SERVICE_ROLE_KEY_HERE"

curl -X POST https://tnwrmybyvimlsamnputn.supabase.co/functions/v1/send-push-notification \
  -H "Authorization: Bearer ${SERVICE_ROLE_KEY}" \
  -H "X-Internal-Call: true" \
  -H "Content-Type: application/json" \
  -d '{
    "user_id": "6426591d-b457-49e0-9674-4cb769969d19",
    "title": "اختبار Push Notification",
    "message": "هذا اختبار لإرسال Push Notification. إذا وصلت هذه الرسالة، فالنظام يعمل بشكل صحيح!",
    "data": {
      "order_id": "test-order-'$(date +%s)'",
      "test": "true"
    }
  }'
```

### النتيجة المتوقعة:
```json
{
  "message": "Push notification sent successfully",
  "sent": 1,
  "total": 1,
  "message_id": "projects/.../messages/..."
}
```

---

### 3️⃣ **استخدام السكريبت الجاهز**

#### أ. تعديل السكريبت:
```bash
# افتح الملف
nano test_push_notification.sh

# استبدل SERVICE_ROLE_KEY بقيمة Service Role Key
SERVICE_ROLE_KEY="YOUR_SERVICE_ROLE_KEY_HERE"
```

#### ب. تشغيل السكريبت:
```bash
bash test_push_notification.sh
```

---

### 4️⃣ **فحص Edge Function Logs**

بعد تشغيل الاختبار:

1. اذهب إلى [Supabase Dashboard](https://supabase.com/dashboard)
2. اختر مشروعك
3. اذهب إلى **Edge Functions** → **send-push-notification** → **Logs**
4. ابحث عن:
   - ✅ `FCM notification sent successfully`
   - ❌ أي أخطاء في الإرسال

---

## 🔍 فحص المشاكل المحتملة

### ❌ **المشكلة 1: "FCM_SERVICE_ACCOUNT_JSON not found"**

**الحل:**
1. اذهب إلى **Edge Functions** → **Secrets**
2. أضف secret جديد:
   - **Name**: `FCM_SERVICE_ACCOUNT_JSON`
   - **Value**: JSON كامل لـ Service Account من Firebase

### ❌ **المشكلة 2: "No FCM token found for user"**

**الحل:**
- تحقق من أن السائق لديه FCM token في جدول `profiles`
- تأكد من أن Token صحيح وغير منتهي الصلاحية

### ❌ **المشكلة 3: "Failed to get access token"**

**الحل:**
- تحقق من صحة `FCM_SERVICE_ACCOUNT_JSON`
- تأكد من أن Service Account لديه صلاحيات Firebase Cloud Messaging

---

## 📊 معلومات السائقين للاختبار

### السائق 1:
- **ID**: `f6d7daf8-21b0-4ead-9204-978a8458c0b7`
- **Phone**: `+201019527786`
- **FCM Token**: موجود ✅

### السائق 2 (تاتات):
- **ID**: `6426591d-b457-49e0-9674-4cb769969d19`
- **Phone**: `+202222222222`
- **FCM Token**: موجود ✅

---

## ✅ التحقق من النجاح

بعد إرسال Push Notification:

1. **في Edge Function Logs**: يجب أن ترى:
   ```
   ✅ FCM notification sent successfully: projects/.../messages/...
   ```

2. **على جهاز السائق**: يجب أن يتلقى Push Notification مع:
   - **Title**: "اختبار Push Notification"
   - **Message**: "هذا اختبار لإرسال Push Notification..."

3. **في Response**: يجب أن يكون `sent: 1`

---

## 📝 ملاحظات

- ⚠️ **Service Role Key حساس**: لا تشاركه أو ترفعه على GitHub
- 🔄 **FCM Tokens قد تنتهي صلاحيتها**: إذا لم يصل الإشعار، قد يحتاج السائق لتسجيل الدخول مرة أخرى
- 📱 **تأكد من أن التطبيق مفتوح**: بعض الأجهزة لا تعرض Push Notifications إذا كان التطبيق مغلقاً تماماً

---

## 🆘 إذا لم يعمل

1. تحقق من Edge Function Logs للخطأ الدقيق
2. تحقق من `FCM_SERVICE_ACCOUNT_JSON` في Secrets
3. تحقق من صحة FCM Token في قاعدة البيانات
4. جرب إرسال Push Notification من Firebase Console مباشرة للتأكد من أن Token صحيح
