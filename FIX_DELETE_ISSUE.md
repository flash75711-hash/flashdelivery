# إصلاح مشكلة الحذف للأدمن

## المشكلة
الحذف لا يعمل حتى مع تسجيل الدخول كأدمن.

## الحلول الممكنة

### 1. التأكد من أن المستخدم لديه role = 'admin'

قم بتشغيل الاستعلام التالي في Supabase SQL Editor:

```sql
-- التحقق من المستخدم الحالي
SELECT 
  id,
  email,
  role
FROM public.profiles
WHERE id = auth.uid();
```

إذا كانت `role` ليست `'admin'`، قم بتحديثها:

```sql
-- تحديث المستخدم الحالي إلى أدمن
UPDATE public.profiles 
SET role = 'admin' 
WHERE id = auth.uid();
```

### 2. إصلاح دالة is_admin والسياسات

قم بتشغيل الملف `fix_delete_permissions.sql` في Supabase SQL Editor:

```bash
# الملف موجود في: fix_delete_permissions.sql
```

هذا الملف سيقوم بـ:
- إعادة إنشاء دالة `is_admin` بشكل صحيح
- إعادة إنشاء سياسات RLS للـ DELETE, INSERT, UPDATE

### 3. التحقق من أن الدالة تعمل

قم بتشغيل الاستعلام التالي:

```sql
SELECT public.is_admin(auth.uid());
```

يجب أن ترجع `true` إذا كنت أدمن.

### 4. التحقق من السياسات

قم بتشغيل الاستعلام التالي للتحقق من السياسات:

```sql
SELECT 
  schemaname,
  tablename,
  policyname,
  permissive,
  roles,
  cmd,
  qual,
  with_check
FROM pg_policies
WHERE tablename = 'places';
```

يجب أن ترى سياسة `"Admins can delete places"` موجودة.

## خطوات التشخيص

1. **افتح Supabase Dashboard**
2. **اذهب إلى SQL Editor**
3. **قم بتشغيل `check_admin_status.sql`** للتحقق من حالة الأدمن
4. **إذا لم تكن أدمن، قم بتحديث role** كما هو موضح أعلاه
5. **قم بتشغيل `fix_delete_permissions.sql`** لإصلاح السياسات
6. **جرب الحذف مرة أخرى**

## ملاحظات

- تأكد من أنك تسجل الدخول بحساب صحيح
- تأكد من أن `role` في جدول `profiles` هو `'admin'` وليس `'Admin'` أو أي شيء آخر
- الدالة `is_admin` تستخدم `SECURITY DEFINER` مما يعني أنها تعمل بصلاحيات المالك
- إذا استمرت المشكلة، تحقق من سجلات Supabase Logs

## الملفات المهمة

- `fix_delete_permissions.sql` - إصلاح السياسات والدالة
- `check_admin_status.sql` - التحقق من حالة الأدمن
- `app/(tabs)/admin/places.tsx` - ملف الكود الذي تم تحديثه
