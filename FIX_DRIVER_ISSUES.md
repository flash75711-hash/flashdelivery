# إصلاح مشاكل السائق - Driver Issues Fix

## المشاكل الحالية

1. **خطأ قاعدة البيانات**: الأعمدة `id_card_image_url` و `selfie_image_url` و `registration_complete` غير موجودة في جدول `profiles`
2. **خطأ CORS**: طلبات رفع الصور محظورة بسبب CORS Policy

---

## الحل 1: إضافة الأعمدة المفقودة في قاعدة البيانات

### الخطوات:

1. افتح **Supabase Dashboard** → **SQL Editor**
2. انسخ محتوى ملف `fix_driver_columns.sql` والصقه في SQL Editor
3. اضغط **Run** لتنفيذ السكريبت
4. تأكد من ظهور رسالة نجاح

### السكريبت:

```sql
-- إضافة الأعمدة المطلوبة
ALTER TABLE profiles 
ADD COLUMN IF NOT EXISTS id_card_image_url TEXT;

ALTER TABLE profiles 
ADD COLUMN IF NOT EXISTS selfie_image_url TEXT;

ALTER TABLE profiles 
ADD COLUMN IF NOT EXISTS registration_complete BOOLEAN DEFAULT false;
```

### التحقق:

بعد تنفيذ السكريبت، يمكنك التحقق من الأعمدة المضافة:

```sql
SELECT column_name, data_type 
FROM information_schema.columns
WHERE table_name = 'profiles' 
  AND column_name IN ('id_card_image_url', 'selfie_image_url', 'registration_complete');
```

---

## الحل 2: إصلاح مشكلة CORS

### المشكلة:

الطلبات من `http://localhost:8081` إلى Edge Function محظورة بسبب CORS Policy.

### الحل:

#### الطريقة 1: إعادة نشر Edge Function (موصى بها)

1. تأكد من أن ملف `supabase/functions/upload-image/index.ts` يحتوي على CORS headers (موجود بالفعل)
2. قم بإعادة نشر Edge Function:
   ```bash
   # تأكد من تسجيل الدخول إلى Supabase CLI
   npx supabase login
   
   # ربط المشروع
   npx supabase link --project-ref YOUR_PROJECT_REF
   
   # نشر Edge Function
   npx supabase functions deploy upload-image
   ```

#### الطريقة 2: التحقق من إعدادات CORS في Supabase Dashboard

1. افتح **Supabase Dashboard** → **Edge Functions** → **upload-image**
2. تأكد من أن CORS مفعل
3. إذا كان هناك خيار لإضافة Domains المسموحة، أضف `http://localhost:8081`

#### الطريقة 3: استخدام Supabase Client بدلاً من fetch المباشر (حل بديل)

إذا استمرت المشكلة، يمكن استخدام Supabase Client للوصول إلى Edge Functions:

```typescript
// في lib/imgbb.ts - بدلاً من fetch المباشر
const { data, error } = await supabase.functions.invoke('upload-image', {
  body: { image: base64String, format: format }
});
```

---

## التحقق من الإصلاحات

### بعد إضافة الأعمدة:

1. أعد تحميل صفحة لوحة تحكم السائق
2. يجب أن تختفي رسالة الخطأ `column profiles.id_card_image_url does not exist`
3. يجب أن تظهر أقسام "إكمال التسجيل" و "بياناتي الشخصية"

### بعد إصلاح CORS:

1. حاول رفع صورة من صفحة إكمال التسجيل
2. يجب أن تختفي رسالة الخطأ `Access-Control-Allow-Origin`
3. يجب أن ترفع الصورة بنجاح

---

## ملاحظات إضافية

- **الأعمدة المفقودة**: إذا لم تقم بتشغيل `database_updates.sql` من قبل، قد تكون هناك أعمدة أخرى مفقودة. راجع الملف للتأكد.

- **CORS في الإنتاج**: عند النشر على Vercel أو أي منصة أخرى، تأكد من إضافة Domain الخاص بك إلى CORS allowed origins في Supabase.

- **اختبار محلي**: إذا كنت تختبر على `localhost`، تأكد من أن Edge Function يدعم `localhost` في CORS headers (موجود بالفعل: `'Access-Control-Allow-Origin': '*'`).

---

## إذا استمرت المشاكل

1. **تحقق من Console Logs**: راجع console في المتصفح/التطبيق لمعرفة الأخطاء الدقيقة
2. **تحقق من Supabase Logs**: افتح Supabase Dashboard → Logs → Edge Functions لرؤية أخطاء الخادم
3. **تحقق من Network Tab**: في Developer Tools، راجع طلبات Network لمعرفة ما يحدث بالضبط

---

## الملفات المعدلة

- ✅ `fix_driver_columns.sql` - سكريبت SQL لإضافة الأعمدة
- ✅ `app/(tabs)/driver/dashboard.tsx` - تحسين معالجة الأخطاء
- ✅ `supabase/functions/upload-image/index.ts` - يحتوي على CORS headers (لا يحتاج تعديل)

---

**تاريخ الإنشاء**: $(date)
**آخر تحديث**: بعد إصلاح المشاكل
