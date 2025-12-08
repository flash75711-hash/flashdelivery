# نشر Edge Function لـ Reverse Geocoding

تم إنشاء Edge Function جديد لحل مشكلة CORS في reverse geocoding.

## الخطوات المطلوبة:

### 1. نشر Edge Function

قم بتشغيل الأمر التالي من مجلد المشروع:

```bash
npx supabase functions deploy reverse-geocode
```

أو إذا كنت تستخدم Supabase CLI محلياً:

```bash
supabase functions deploy reverse-geocode
```

### 2. التحقق من النشر

بعد النشر، تأكد من أن الـ Edge Function يعمل بشكل صحيح. يمكنك اختباره من خلال:

- فتح Supabase Dashboard
- الذهاب إلى Edge Functions
- التحقق من وجود `reverse-geocode` في القائمة

### 3. اختبار الوظيفة

يمكنك اختبار الوظيفة باستخدام curl:

```bash
curl -X POST 'https://YOUR_PROJECT_REF.supabase.co/functions/v1/reverse-geocode' \
  -H 'Authorization: Bearer YOUR_ANON_KEY' \
  -H 'Content-Type: application/json' \
  -d '{"lat": 30.0444, "lon": 31.2357}'
```

## ما تم تحديثه:

✅ تم إنشاء Edge Function جديد: `supabase/functions/reverse-geocode/index.ts`
✅ تم إضافة دالة `reverseGeocode()` في `lib/supabase.ts`
✅ تم تحديث جميع الملفات التي تستخدم Nominatim مباشرة:
   - `components/CurrentLocationDisplay.tsx`
   - `app/customer/outside-order.tsx`
   - `app/customer/places-directory.tsx`
   - `app/(auth)/complete-registration/customer.tsx`
   - `app/customer/deliver-package.tsx`
   - `app/(tabs)/customer/profile.tsx`
   - `app/(tabs)/admin/places.tsx`

## الفوائد:

- ✅ لا توجد مشاكل CORS لأن الطلبات تتم من الخادم
- ✅ أداء أفضل وأكثر موثوقية
- ✅ إدارة مركزية لطلبات Nominatim API
- ✅ إمكانية إضافة caching أو rate limiting في المستقبل

## ملاحظات:

- تأكد من أن متغيرات البيئة `EXPO_PUBLIC_SUPABASE_URL` و `EXPO_PUBLIC_SUPABASE_ANON_KEY` معرّفة بشكل صحيح
- إذا فشل الاتصال بالـ Edge Function، ستحاول الدالة استخدام Nominatim مباشرة كـ fallback (قد يفشل بسبب CORS على الويب)
