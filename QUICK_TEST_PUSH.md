# 🚀 اختبار سريع لـ Push Notification

## ⚡ خطوات سريعة (دقيقتان)

### 1️⃣ **الحصول على Service Role Key**

1. افتح [Supabase Dashboard](https://supabase.com/dashboard)
2. اختر مشروعك
3. اذهب إلى **Settings** → **API**
4. انسخ **Service Role Key** (المفتاح الطويل)

---

### 2️⃣ **تشغيل الاختبار**

#### الطريقة 1: استخدام السكريبت (الأسهل)

```bash
bash quick_test_push.sh YOUR_SERVICE_ROLE_KEY
```

**مثال:**
```bash
bash quick_test_push.sh eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

#### الطريقة 2: استخدام curl مباشرة

```bash
curl -X POST https://tnwrmybyvimlsamnputn.supabase.co/functions/v1/send-push-notification \
  -H "Authorization: Bearer YOUR_SERVICE_ROLE_KEY" \
  -H "X-Internal-Call: true" \
  -H "Content-Type: application/json" \
  -d '{
    "user_id": "6426591d-b457-49e0-9674-4cb769969d19",
    "title": "اختبار Push Notification",
    "message": "هذا اختبار لإرسال Push Notification. إذا وصلت هذه الرسالة، فالنظام يعمل بشكل صحيح!",
    "data": {"test": "true"}
  }'
```

---

### 3️⃣ **النتيجة المتوقعة**

#### ✅ إذا نجح:
```json
{
  "message": "Push notification sent successfully",
  "sent": 1,
  "total": 1,
  "message_id": "projects/.../messages/..."
}
```

**على جهاز السائق:**
- يجب أن يصل Push Notification مع العنوان والرسالة

#### ❌ إذا فشل:
```json
{
  "error": "FCM Service Account not configured",
  "message": "Please set FCM_SERVICE_ACCOUNT_JSON in Supabase Edge Function secrets"
}
```

**الحل:**
1. اذهب إلى **Edge Functions** → **Secrets**
2. أضف secret جديد:
   - **Name**: `FCM_SERVICE_ACCOUNT_JSON`
   - **Value**: JSON كامل لـ Service Account من Firebase

---

## 📊 معلومات السائق للاختبار

- **ID**: `6426591d-b457-49e0-9674-4cb769969d19`
- **Phone**: `+202222222222`
- **Name**: تاتات
- **FCM Token**: موجود ✅ (142 حرف)

---

## 🔍 فحص Edge Function Logs

بعد تشغيل الاختبار:

1. اذهب إلى [Supabase Dashboard](https://supabase.com/dashboard)
2. **Edge Functions** → **send-push-notification** → **Logs**
3. ابحث عن:
   - ✅ `FCM notification sent successfully`
   - ❌ أي أخطاء

---

## ⚠️ ملاحظات

- **Service Role Key حساس**: لا تشاركه أو ترفعه على GitHub
- **FCM Token**: قد يحتاج السائق لتسجيل الدخول مرة أخرى إذا انتهت صلاحيته
- **التطبيق**: تأكد من أن التطبيق مفتوح على جهاز السائق
