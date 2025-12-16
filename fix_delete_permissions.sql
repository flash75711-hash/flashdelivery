-- ============================================
-- إصلاح مشكلة الحذف للأدمن
-- ============================================
-- المشكلة: الحذف لا يعمل حتى مع تسجيل الدخول كأدمن
-- الحل: التأكد من أن دالة is_admin تعمل بشكل صحيح
-- ============================================

-- 1. التأكد من وجود دالة is_admin وتحديثها إذا لزم الأمر
CREATE OR REPLACE FUNCTION public.is_admin(user_id UUID)
RETURNS BOOLEAN AS $$
BEGIN
  -- استخدام SECURITY DEFINER للسماح بالقراءة من profiles حتى مع RLS
  -- STABLE لأن النتيجة لا تتغير خلال نفس الاستعلام
  RETURN EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = user_id AND role = 'admin'
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;

-- 2. التأكد من أن السياسات موجودة وصحيحة
-- إزالة السياسات القديمة إن وجدت
DROP POLICY IF EXISTS "Admins can delete places" ON places;
DROP POLICY IF EXISTS "Admins can insert places" ON places;
DROP POLICY IF EXISTS "Admins can update places" ON places;

-- إعادة إنشاء السياسات
CREATE POLICY "Admins can insert places"
  ON places FOR INSERT
  WITH CHECK (public.is_admin(auth.uid()));

CREATE POLICY "Admins can update places"
  ON places FOR UPDATE
  USING (public.is_admin(auth.uid()))
  WITH CHECK (public.is_admin(auth.uid()));

CREATE POLICY "Admins can delete places"
  ON places FOR DELETE
  USING (public.is_admin(auth.uid()));

-- 3. التأكد من أن جدول profiles يسمح للدالة بالقراءة
-- (هذا يجب أن يعمل تلقائياً مع SECURITY DEFINER، لكن نتأكد)

-- 4. إنشاء دالة مساعدة للتحقق من الصلاحيات (اختياري - للتشخيص)
CREATE OR REPLACE FUNCTION public.check_admin_permission()
RETURNS BOOLEAN AS $$
BEGIN
  RETURN public.is_admin(auth.uid());
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;

-- ============================================
-- ✅ تم الإصلاح!
-- ============================================
-- الآن يجب أن يعمل الحذف بشكل صحيح للأدمن
-- 
-- للتحقق من أن المستخدم هو أدمن، يمكنك تشغيل:
-- SELECT public.is_admin(auth.uid());
-- 
-- أو في الكود:
-- SELECT public.check_admin_permission();
-- ============================================
