-- ============================================
-- إصلاح مشكلة Recursion في سياسات RLS
-- ============================================
-- المشكلة: السياسات الخاصة بالمديرين تسبب recursion لا نهائي
-- لأنها تحاول قراءة من جدول profiles أثناء التحقق من الصلاحيات

-- الحل: إنشاء دالة SECURITY DEFINER للتحقق من أن المستخدم هو admin
-- ============================================

-- 1. إنشاء دالة للتحقق من أن المستخدم هو admin
CREATE OR REPLACE FUNCTION public.is_admin(user_id UUID)
RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = user_id AND role = 'admin'
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;

-- 2. إزالة السياسات القديمة التي تسبب recursion
DROP POLICY IF EXISTS "Admins can read all profiles" ON profiles;
DROP POLICY IF EXISTS "Admins can update all profiles" ON profiles;
DROP POLICY IF EXISTS "Admins can read vendors" ON vendors;
DROP POLICY IF EXISTS "Admins can update vendors" ON vendors;
DROP POLICY IF EXISTS "Admins can read all orders" ON orders;
DROP POLICY IF EXISTS "Admins can update all orders" ON orders;
DROP POLICY IF EXISTS "Admins can read all wallets" ON wallets;
DROP POLICY IF EXISTS "Admins can update all wallets" ON wallets;
DROP POLICY IF EXISTS "Admins can read all locations" ON driver_locations;
DROP POLICY IF EXISTS "Admins can update all locations" ON driver_locations;

-- 3. إنشاء السياسات الجديدة باستخدام الدالة
-- سياسات profiles
CREATE POLICY "Admins can read all profiles"
  ON profiles FOR SELECT
  USING (public.is_admin(auth.uid()));

CREATE POLICY "Admins can update all profiles"
  ON profiles FOR UPDATE
  USING (public.is_admin(auth.uid()));

-- سياسات vendors
CREATE POLICY "Admins can read vendors"
  ON vendors FOR SELECT
  USING (public.is_admin(auth.uid()));

CREATE POLICY "Admins can update vendors"
  ON vendors FOR UPDATE
  USING (public.is_admin(auth.uid()));

-- سياسات orders
CREATE POLICY "Admins can read all orders"
  ON orders FOR SELECT
  USING (public.is_admin(auth.uid()));

CREATE POLICY "Admins can update all orders"
  ON orders FOR UPDATE
  USING (public.is_admin(auth.uid()));

-- سياسات wallets
CREATE POLICY "Admins can read all wallets"
  ON wallets FOR SELECT
  USING (public.is_admin(auth.uid()));

CREATE POLICY "Admins can update all wallets"
  ON wallets FOR UPDATE
  USING (public.is_admin(auth.uid()));

-- سياسات driver_locations
CREATE POLICY "Admins can read all locations"
  ON driver_locations FOR SELECT
  USING (public.is_admin(auth.uid()));

CREATE POLICY "Admins can update all locations"
  ON driver_locations FOR UPDATE
  USING (public.is_admin(auth.uid()));

-- ============================================
-- ✅ تم الإصلاح!
-- ============================================
-- الآن السياسات لن تسبب recursion لأن الدالة is_admin
-- تستخدم SECURITY DEFINER وتقرأ من profiles مباشرة
-- ============================================


