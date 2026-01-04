# 🚀 نشر Edge Function: get-notifications

## المشكلة
عند تسجيل الدخول بـ PIN، لا يوجد Supabase session، لذلك `auth.uid()` غير متاح وRLS policy تمنع قراءة الإشعارات.

## الحل
تم إنشاء Edge Function `get-notifications` لتجاوز RLS باستخدام service role.

## خطوات النشر

### الطريقة 1: استخدام Supabase Dashboard (الأسهل)

1. افتح [Supabase Dashboard](https://supabase.com/dashboard)
2. اختر مشروعك
3. اذهب إلى **Edge Functions** من القائمة الجانبية
4. اضغط على **Create a new function**
5. اسم الدالة: `get-notifications`
6. انسخ محتوى الملف `supabase/functions/get-notifications/index.ts` والصقه في المحرر
7. اضغط **Deploy**

### الطريقة 2: استخدام Supabase CLI

```bash
# 1. تسجيل الدخول إلى Supabase
npx supabase login

# 2. ربط المشروع (إذا لم يكن مربوطاً)
npx supabase link --project-ref tnwrmybyvimlsamnputn

# 3. نشر Edge Function
npx supabase functions deploy get-notifications
```

### الطريقة 3: استخدام Supabase MCP (إذا كان متاحاً)

يمكن استخدام MCP tools لنشر Edge Function مباشرة.

## التحقق من النشر

بعد النشر، تحقق من:

1. افتح صفحة العميل في المتصفح
2. افتح Developer Console (F12)
3. ابحث عن:
   - `✅ [useFloatingNotifications] تم جلب الإشعارات من Edge Function`
   - أو `⚠️ [useFloatingNotifications] استخدام Edge Function لتجاوز RLS...`

## اختبار Edge Function

يمكنك اختبار Edge Function مباشرة:

```bash
curl -X POST https://tnwrmybyvimlsamnputn.supabase.co/functions/v1/get-notifications \
  -H "Authorization: Bearer YOUR_ANON_KEY" \
  -H "Content-Type: application/json" \
  -d '{"user_id": "USER_ID_HERE", "limit": 5}'
```

## ملاحظات

- Edge Function يستخدم **service role key** تلقائياً (من environment variables في Supabase)
- لا حاجة لإرسال service role key من العميل
- Edge Function يتجاوز RLS تلقائياً

## بعد النشر

بعد نشر Edge Function:
1. ✅ الإشعارات ستظهر للعملاء الذين سجلوا دخولهم بـ PIN
2. ✅ Realtime subscription سيعمل بشكل صحيح
3. ✅ Polling mechanism سيعمل كـ fallback

