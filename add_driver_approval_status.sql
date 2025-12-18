-- ============================================
-- إضافة نظام مراجعة وموافقة السائقين
-- ============================================

-- 1. إضافة عمود approval_status لحالة الموافقة
ALTER TABLE profiles 
ADD COLUMN IF NOT EXISTS approval_status TEXT 
CHECK (approval_status IN ('pending', 'approved', 'rejected')) 
DEFAULT 'pending';

-- 2. تحديث السائقين الحاليين الذين أكملوا التسجيل
-- إذا كان registration_complete = true، اجعل approval_status = 'approved'
UPDATE profiles 
SET approval_status = 'approved'
WHERE role = 'driver' 
  AND registration_complete = true 
  AND (approval_status IS NULL OR approval_status = 'pending');

-- 3. إنشاء Index لتحسين الأداء
CREATE INDEX IF NOT EXISTS idx_profiles_approval_status 
ON profiles(approval_status) 
WHERE role = 'driver';

-- 4. التحقق من الأعمدة المضافة
SELECT column_name, data_type, column_default
FROM information_schema.columns
WHERE table_name = 'profiles' 
  AND column_name = 'approval_status';
