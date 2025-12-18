-- ============================================
-- إصلاح سياسات RLS للمديرين - الموافقة على السائقين
-- ============================================

-- 1. التأكد من وجود دالة is_admin
CREATE OR REPLACE FUNCTION public.is_admin(user_id UUID)
RETURNS BOOLEAN AS $$
BEGIN
  -- استخدام SECURITY DEFINER للسماح بالقراءة من profiles حتى مع RLS
  RETURN EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = user_id AND role = 'admin'
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;

-- 2. إزالة السياسات القديمة إن وجدت
DROP POLICY IF EXISTS "Admins can read all profiles" ON profiles;
DROP POLICY IF EXISTS "Admins can update all profiles" ON profiles;

-- 3. إنشاء السياسات الجديدة باستخدام دالة is_admin
-- سياسة القراءة للمديرين
CREATE POLICY "Admins can read all profiles"
  ON profiles FOR SELECT
  USING (public.is_admin(auth.uid()));

-- سياسة التحديث للمديرين
CREATE POLICY "Admins can update all profiles"
  ON profiles FOR UPDATE
  USING (public.is_admin(auth.uid()))
  WITH CHECK (public.is_admin(auth.uid()));

-- 4. التحقق من أن السياسات موجودة
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
WHERE tablename = 'profiles' 
  AND policyname LIKE '%Admin%'
ORDER BY policyname;
