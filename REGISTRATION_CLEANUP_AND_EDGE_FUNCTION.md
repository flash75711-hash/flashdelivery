# تنظيف الحسابات القديمة وإنشاء Edge Function للتسجيل

## ما تم إنجازه

### 1. تنظيف الحسابات القديمة ✅

تم حذف **16 حساب قديم** من `auth.users` التي لا تحتوي على profiles:
- تم الحفاظ على حساب Admin فقط (`24d40544-78f1-4713-8e07-ce7ed3f8d5d7`)
- تم حذف جميع الحسابات الأخرى التي لا تحتوي على profiles

### 2. إنشاء Edge Function جديد ✅

تم إنشاء Edge Function جديد باسم `register-user` يقوم بـ:
- التحقق من صحة البيانات (phone, PIN, role)
- التحقق من وجود رقم الموبايل في `profiles`
- التعامل مع الحالات المختلفة:
  - Profile موجود بدون PIN → تحديثه
  - User موجود في `auth.users` بدون profile → إنشاء profile
  - User جديد → إنشاء user و profile
- استخدام Service Role Key للوصول الكامل إلى قاعدة البيانات

### 3. تحديث `lib/pinAuth.ts` ✅

تم تحديث دالة `registerWithPin` لـ:
- محاولة استخدام Edge Function أولاً
- التراجع إلى الطريقة القديمة إذا فشل Edge Function
- الحفاظ على التوافق مع الكود الموجود

## كيفية الاستخدام

### Edge Function

```typescript
// في lib/pinAuth.ts - يتم استدعاؤه تلقائياً
const result = await registerWithPin('01234567890', '123456', 'customer');
```

### API Endpoint

```
POST /functions/v1/register-user
Content-Type: application/json

{
  "phone": "+201234567890",
  "pin": "123456",
  "role": "customer" // أو "driver" أو "vendor"
}
```

## المزايا

1. **أمان أفضل**: استخدام Service Role Key في Edge Function يمنع مشاكل RLS
2. **تنظيف تلقائي**: حذف الحسابات القديمة يمنع مشاكل `user_already_registered`
3. **مرونة**: الكود يتراجع تلقائياً إلى الطريقة القديمة إذا فشل Edge Function
4. **معالجة شاملة**: التعامل مع جميع الحالات (user موجود، profile موجود، etc.)

## الحالات المدعومة

### ✅ حالة 1: رقم موبايل جديد
- إنشاء user جديد في `auth.users`
- إنشاء profile جديد في `profiles`

### ✅ حالة 2: Profile موجود بدون PIN
- تحديث profile بإضافة PIN hash و role

### ✅ حالة 3: User موجود في `auth.users` بدون profile
- استخدام user ID الموجود
- إنشاء profile جديد

### ✅ حالة 4: رقم موبايل مسجل بالفعل
- إرجاع خطأ واضح: "رقم الموبايل مسجل بالفعل"

## التحقق من النشر

تم نشر Edge Function بنجاح:
- **Function ID**: `b3d9f27d-4cca-4f91-bbf4-bd87cb99771e`
- **Status**: `ACTIVE`
- **Verify JWT**: `false` (لأن التسجيل لا يتطلب JWT)

## ملاحظات

1. **JWT Verification**: تم تعطيل JWT verification لأن التسجيل لا يتطلب مصادقة مسبقة
2. **CORS**: Edge Function يدعم CORS تلقائياً
3. **Error Handling**: جميع الأخطاء يتم معالجتها وإرجاع رسائل واضحة بالعربية

## الخطوات التالية

1. ✅ اختبار التسجيل من المتصفح
2. ✅ التحقق من أن Edge Function يعمل بشكل صحيح
3. ✅ مراقبة الأخطاء في Supabase Dashboard

## استكشاف الأخطاء

إذا واجهت مشاكل:

1. **Edge Function غير متاح**: الكود يتراجع تلقائياً إلى الطريقة القديمة
2. **خطأ 406 (Not Acceptable)**: تم حل هذه المشكلة باستخدام Service Role Key
3. **`user_already_registered`**: تم حل هذه المشكلة بتنظيف الحسابات القديمة

## الملفات المعدلة

- ✅ `lib/pinAuth.ts` - تحديث `registerWithPin`
- ✅ `supabase/functions/register-user/index.ts` - Edge Function جديد
- ✅ قاعدة البيانات - حذف 16 حساب قديم

