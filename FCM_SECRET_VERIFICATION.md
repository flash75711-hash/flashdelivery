# ✅ التحقق من FCM Service Account JSON في Supabase

## ✅ التحقق من الملف الأصلي

تم التحقق من ملف JSON الأصلي:
- ✅ JSON صحيح وصالح
- ✅ Project ID: `emerald-spring-479408-u8`
- ✅ Client Email: `firebase-adminsdk-fbsvc@emerald-spring-479408-u8.iam.gserviceaccount.com`
- ✅ Private Key موجود ويحتوي على `\n` (newlines)
- ✅ Private Key يبدأ بـ `-----BEGIN PRIVATE KEY-----`
- ✅ Private Key ينتهي بـ `-----END PRIVATE KEY-----`

---

## ⚠️ مهم: كيفية إضافة JSON في Supabase Secrets

### الطريقة الصحيحة:

1. **افتح ملف JSON** في محرر نصوص
2. **انسخ الملف كاملاً** (Ctrl+A ثم Ctrl+C)
3. **الصق في Supabase Secrets** مباشرة

### ⚠️ تحذيرات:

- **لا تحذف** `\n` من `private_key`
- **لا تحول** `\n` إلى مسافات
- **لا تحذف** الأقواس `{}`
- **لا تحذف** علامات الاقتباس `"`

---

## 🔍 التحقق من القيمة في Supabase

### القيمة الصحيحة يجب أن تحتوي على:

```json
{
  "type": "service_account",
  "project_id": "emerald-spring-479408-u8",
  "private_key": "-----BEGIN PRIVATE KEY-----\nMIIEvQIBADANBgkqhkiG9w0BAQEFAASCBKcwggSjAgEAAoIBAQC1kXmuD+4GYdN4\n...\n-----END PRIVATE KEY-----\n",
  "client_email": "firebase-adminsdk-fbsvc@emerald-spring-479408-u8.iam.gserviceaccount.com",
  ...
}
```

### ✅ علامات الصحة:

1. يبدأ بـ `{`
2. ينتهي بـ `}`
3. `private_key` يحتوي على `\n` (newlines)
4. `private_key` يبدأ بـ `-----BEGIN PRIVATE KEY-----`
5. `private_key` ينتهي بـ `-----END PRIVATE KEY-----\n`

---

## 🧪 اختبار Edge Function

بعد إضافة Secret، يمكنك اختبار Edge Function:

### 1. تحقق من Logs:
- Supabase Dashboard → Edge Functions → `send-push-notification` → Logs
- ابحث عن:
  - ✅ `FCM notification sent successfully` - يعني يعمل
  - ❌ `FCM_SERVICE_ACCOUNT_JSON not found` - يعني Secret غير موجود
  - ❌ `Invalid Service Account JSON` - يعني JSON غير صحيح

### 2. اختبار يدوي:
```bash
curl -X POST https://tnwrmybyvimlsamnputn.supabase.co/functions/v1/send-push-notification \
  -H "Authorization: Bearer YOUR_ANON_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "user_id": "USER_ID",
    "title": "Test",
    "message": "Test message"
  }'
```

---

## 📝 ملاحظات

- إذا كان JSON غير صحيح، Edge Function سترجع خطأ: `Invalid Service Account JSON`
- إذا كان Secret غير موجود، Edge Function سترجع خطأ: `FCM Service Account not configured`
- Private Key يجب أن يحتوي على `\n` (newlines) - هذا مهم جداً!

---

**تاريخ**: $(date)
