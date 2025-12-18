-- ============================================
-- إصلاح أعمدة السائق المفقودة
-- ============================================
-- هذا السكريبت يضيف الأعمدة المطلوبة لجدول profiles

-- 1. إضافة عمود id_card_image_url (صورة البطاقة)
ALTER TABLE profiles 
ADD COLUMN IF NOT EXISTS id_card_image_url TEXT;

-- 2. إضافة عمود selfie_image_url (صورة السيلفي)
ALTER TABLE profiles 
ADD COLUMN IF NOT EXISTS selfie_image_url TEXT;

-- 3. إضافة عمود registration_complete (حالة إكمال التسجيل)
ALTER TABLE profiles 
ADD COLUMN IF NOT EXISTS registration_complete BOOLEAN DEFAULT false;

-- التحقق من الأعمدة المضافة
SELECT column_name, data_type, is_nullable, column_default
FROM information_schema.columns
WHERE table_name = 'profiles' 
  AND column_name IN ('id_card_image_url', 'selfie_image_url', 'registration_complete')
ORDER BY column_name;
