# 🚀 إعداد FCM HTTP v1 API - دليل سريع

## ✅ الخطوات السريعة

### 1. احصل على Service Account JSON
- Firebase Console → Project Settings → **Service accounts**
- اضغط **Generate new private key**
- سيتم تحميل ملف JSON

### 2. أضف JSON في Supabase

1. افتح [Supabase Dashboard](https://supabase.com/dashboard)
2. مشروعك → **Edge Functions** → **Settings**
3. في قسم **Secrets**:
   - **Name**: `FCM_SERVICE_ACCOUNT_JSON`
   - **Value**: الصق محتوى ملف JSON **كاملاً**

**⚠️ مهم**: يجب نسخ الملف كاملاً بما في ذلك:
```json
{
  "type": "service_account",
  "project_id": "emerald-spring-479408-u8",
  "private_key_id": "...",
  "private_key": "-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n",
  "client_email": "...",
  ...
}
```

### 3. انشر Edge Function

```bash
supabase functions deploy send-push-notification
```

---

## ✅ جاهز!

الآن الإشعارات ستعمل عبر FCM HTTP v1 API.

---

## 🔍 التحقق

### تحقق من FCM Token:
```sql
SELECT id, full_name, fcm_token 
FROM profiles 
WHERE fcm_token IS NOT NULL;
```

### تحقق من Logs:
- Supabase Dashboard → Edge Functions → `send-push-notification` → Logs
- ابحث عن: `FCM notification sent successfully`

---

## 📝 ملاحظات

- ✅ يستخدم **FCM HTTP v1 API** (الموصى به)
- ✅ يدعم Android و iOS
- ✅ أكثر أماناً من Legacy API
- ✅ يقوم بإنشاء JWT token تلقائياً

---

**تاريخ**: $(date)
