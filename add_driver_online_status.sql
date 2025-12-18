-- ============================================
-- إضافة حقل is_online للسائقين
-- ============================================
-- نفذ هذا الملف في Supabase SQL Editor

-- إضافة حقل is_online في جدول profiles
ALTER TABLE profiles 
ADD COLUMN IF NOT EXISTS is_online BOOLEAN DEFAULT false;

-- إنشاء index لتحسين الأداء عند البحث عن السائقين النشطين
CREATE INDEX IF NOT EXISTS idx_profiles_is_online ON profiles(is_online) WHERE role = 'driver';

-- تحديث RLS policy للسماح للسائقين بتحديث is_online
-- (يجب أن تكون السياسة موجودة بالفعل، لكن نتأكد)
-- السائقون يمكنهم تحديث is_online في ملفاتهم الشخصية
-- (هذا يتم بواسطة السياسة الموجودة: "Users can update own profile")

-- ملاحظة: يمكن للسائقين تحديث is_online لأنهم يمكنهم تحديث ملفاتهم الشخصية
-- حسب السياسة الموجودة: "Users can update own profile"
