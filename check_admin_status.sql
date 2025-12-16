-- ============================================
-- التحقق من حالة الأدمن
-- ============================================
-- استخدم هذا الملف للتحقق من أن المستخدم الحالي هو أدمن
-- ============================================

-- 1. التحقق من المستخدم الحالي
SELECT 
  auth.uid() as current_user_id,
  auth.email() as current_email;

-- 2. التحقق من ملف المستخدم الحالي
SELECT 
  id,
  email,
  role,
  full_name
FROM public.profiles
WHERE id = auth.uid();

-- 3. التحقق من أن الدالة is_admin تعمل
SELECT 
  public.is_admin(auth.uid()) as is_admin_result;

-- 4. التحقق من جميع الأدمن
SELECT 
  id,
  email,
  role,
  full_name
FROM public.profiles
WHERE role = 'admin';

-- ============================================
-- إذا كانت النتيجة false في الخطوة 3،
-- تأكد من أن role = 'admin' في جدول profiles
-- 
-- لتحديث المستخدم الحالي إلى أدمن:
-- UPDATE public.profiles 
-- SET role = 'admin' 
-- WHERE id = auth.uid();
-- ============================================
