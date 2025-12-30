-- ============================================
-- Flash Delivery - Migration to PIN Authentication
-- ============================================
-- هذا الملف يحتوي على جميع التغييرات المطلوبة لنظام PIN
-- نفذ هذا الملف في Supabase SQL Editor

-- ============================================
-- 1. تحديث جدول profiles - إضافة حقول PIN
-- ============================================

-- إضافة أعمدة PIN الجديدة
ALTER TABLE profiles 
ADD COLUMN IF NOT EXISTS pin_hash TEXT,
ADD COLUMN IF NOT EXISTS failed_attempts INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS locked_until TIMESTAMP WITH TIME ZONE;

-- إنشاء index على phone للبحث السريع
CREATE INDEX IF NOT EXISTS idx_profiles_phone ON profiles(phone) WHERE phone IS NOT NULL;

-- ============================================
-- 2. حذف أي أعمدة OTP قديمة (إن وجدت)
-- ============================================

-- ملاحظة: إذا كان لديك أعمدة OTP مخصصة، احذفها هنا
-- ALTER TABLE profiles DROP COLUMN IF EXISTS otp_secret;
-- ALTER TABLE profiles DROP COLUMN IF EXISTS otp_verified;

-- ============================================
-- 3. إنشاء مستخدم Admin افتراضي
-- ============================================

-- ملاحظة: يجب إنشاء المستخدم في auth.users أولاً ثم إضافة profile
-- هذا يتم عبر Edge Function أو يدوياً في Supabase Dashboard

-- Function لإنشاء مستخدم Admin افتراضي
CREATE OR REPLACE FUNCTION create_default_admin()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  admin_user_id UUID;
  admin_pin_hash TEXT;
BEGIN
  -- PIN: 000000 (سيتم تشفيره بـ bcrypt في الكود)
  -- Hash لـ "000000" باستخدام bcrypt (10 rounds)
  -- هذا hash مؤقت - سيتم استبداله بالـ hash الصحيح من الكود
  admin_pin_hash := '$2b$10$placeholder_hash_will_be_replaced';
  
  -- البحث عن مستخدم بموبايل 01200006637
  SELECT id INTO admin_user_id
  FROM profiles
  WHERE phone = '01200006637';
  
  -- إذا لم يوجد، سنحتاج لإنشائه عبر Edge Function
  -- هنا نضيف profile فقط إذا كان المستخدم موجوداً
  IF admin_user_id IS NOT NULL THEN
    UPDATE profiles
    SET 
      pin_hash = admin_pin_hash,
      role = 'admin',
      status = 'active',
      failed_attempts = 0,
      locked_until = NULL
    WHERE id = admin_user_id;
    
    RAISE NOTICE 'Admin user profile updated';
  ELSE
    RAISE NOTICE 'Admin user not found. Please create user manually first.';
  END IF;
END;
$$;

-- ============================================
-- 4. تحديث RLS Policies للسماح بالبحث عن phone
-- ============================================

-- سياسة للسماح بالبحث عن phone (للتسجيل والدخول)
-- ملاحظة: هذا قد يحتاج تعديل حسب متطلبات الأمان
DROP POLICY IF EXISTS "Allow phone lookup for auth" ON profiles;
-- سنستخدم service_role key للبحث عن phone في الكود

-- ============================================
-- 5. إنشاء Function لتحديث failed_attempts
-- ============================================

CREATE OR REPLACE FUNCTION increment_failed_attempts(user_phone TEXT)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  current_attempts INTEGER;
  lock_duration INTERVAL := '30 minutes'; -- قفل لمدة 30 دقيقة
BEGIN
  -- زيادة failed_attempts
  UPDATE profiles
  SET 
    failed_attempts = failed_attempts + 1,
    locked_until = CASE 
      WHEN failed_attempts + 1 >= 5 THEN NOW() + lock_duration
      ELSE locked_until
    END
  WHERE phone = user_phone
  RETURNING failed_attempts INTO current_attempts;
  
  RAISE NOTICE 'Failed attempts for %: %', user_phone, current_attempts;
END;
$$;

-- ============================================
-- 6. إنشاء Function لإعادة تعيين failed_attempts
-- ============================================

CREATE OR REPLACE FUNCTION reset_failed_attempts(user_phone TEXT)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  UPDATE profiles
  SET 
    failed_attempts = 0,
    locked_until = NULL
  WHERE phone = user_phone;
  
  RAISE NOTICE 'Failed attempts reset for %', user_phone;
END;
$$;

-- ============================================
-- 7. إنشاء Function للتحقق من حالة القفل
-- ============================================

CREATE OR REPLACE FUNCTION is_account_locked(user_phone TEXT)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  lock_time TIMESTAMP WITH TIME ZONE;
BEGIN
  SELECT locked_until INTO lock_time
  FROM profiles
  WHERE phone = user_phone;
  
  IF lock_time IS NULL THEN
    RETURN FALSE;
  END IF;
  
  IF lock_time > NOW() THEN
    RETURN TRUE;
  ELSE
    -- فك القفل تلقائياً إذا انتهى الوقت
    UPDATE profiles
    SET locked_until = NULL, failed_attempts = 0
    WHERE phone = user_phone;
    RETURN FALSE;
  END IF;
END;
$$;

