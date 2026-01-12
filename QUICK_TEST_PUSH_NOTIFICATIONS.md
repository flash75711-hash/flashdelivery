# ⚡ اختبار سريع لـ Push Notifications

## 🚀 خطوات سريعة

### 1️⃣ **التحقق من FCM Tokens (30 ثانية)**

```sql
-- نفذ في Supabase SQL Editor
SELECT 
  id,
  email,
  CASE 
    WHEN fcm_token IS NULL THEN '❌ لا يوجد'
    ELSE '✅ موجود'
  END AS fcm_token_status
FROM profiles
WHERE role = 'driver' 
  AND status = 'active' 
  AND approval_status = 'approved'
LIMIT 5;
```

**النتيجة المتوقعة:** يجب أن يكون لدى السائقين `✅ موجود`

---

### 2️⃣ **اختبار مباشر من Edge Function (1 دقيقة)**

#### أ. احصل على:
- Driver ID من الاستعلام أعلاه
- Service Role Key من Supabase Dashboard → Settings → API

#### ب. استخدم curl:
```bash
curl -X POST https://YOUR_PROJECT.supabase.co/functions/v1/send-push-notification \
  -H "Authorization: Bearer YOUR_SERVICE_ROLE_KEY" \
  -H "X-Internal-Call: true" \
  -H "Content-Type: application/json" \
  -d '{
    "user_id": "DRIVER_ID_FROM_STEP_1",
    "title": "اختبار سريع",
    "message": "إذا وصلت هذه الرسالة، فالنظام يعمل!",
    "data": {"test": "true"}
  }'
```

#### ج. النتيجة المتوقعة:
```json
{
  "message": "Push notification sent successfully",
  "sent": 1
}
```

---

### 3️⃣ **اختبار من التطبيق (2 دقيقة)**

#### أ. في Console التطبيق (React Native/Expo):
```typescript
import { createNotification } from '@/lib/notifications';

// استبدل DRIVER_ID_HERE بـ ID سائق حقيقي
await createNotification({
  user_id: 'DRIVER_ID_HERE',
  title: 'اختبار من التطبيق',
  message: 'هذا اختبار لـ Push Notification',
  type: 'info',
  order_id: 'test-order-id',
});
```

#### ب. تحقق من:
- ✅ Console logs تظهر `[sendPushNotification] Push notification sent successfully`
- ✅ السائق يتلقى Push Notification على جهازه

---

### 4️⃣ **اختبار من خلال إنشاء طلب (3 دقائق)**

#### أ. سجل دخول كعميل:
1. أنشئ طلب جديد
2. ابدأ البحث عن سائق

#### ب. تحقق من Logs:
1. اذهب إلى **Supabase Dashboard** → **Edge Functions** → **Logs**
2. ابحث عن `send-push-notification`
3. تحقق من وجود: `✅ Push notification sent to driver ...`

#### ج. تحقق من السائق:
1. سجل دخول كسائق
2. تحقق من:
   - In-App Notification (في التطبيق)
   - Push Notification (إشعار النظام)

---

## ✅ قائمة التحقق السريعة

- [ ] FCM tokens موجودة للسائقين
- [ ] Edge Function `send-push-notification` تعمل
- [ ] اختبار مباشر نجح
- [ ] اختبار من التطبيق نجح
- [ ] السائقون يتلقون Push Notifications

---

## 🐛 إذا فشل الاختبار

### ❌ "No FCM token found"
→ السائق لم يحفظ FCM token. تأكد من تسجيل الدخول.

### ❌ "FCM Service Account not configured"
→ أضف `FCM_SERVICE_ACCOUNT_JSON` في Edge Function secrets.

### ❌ "Failed to get access token"
→ Service Account JSON غير صحيح. تحقق من القيمة.

### ❌ Push Notification لا تصل
→ تحقق من:
- صلاحيات الإشعارات في الجهاز
- اتصال الجهاز بالإنترنت
- FCM token صحيح وحديث

---

**⏱️ الوقت الإجمالي:** ~6 دقائق
