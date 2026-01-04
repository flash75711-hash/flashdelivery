-- ============================================
-- فحص وتفعيل Realtime للإشعارات
-- ============================================
-- نفذ هذا الملف في Supabase SQL Editor

-- 1. التحقق من أن Realtime مفعّل لجدول notifications
SELECT 
  schemaname,
  tablename,
  pubname
FROM pg_publication_tables 
WHERE pubname = 'supabase_realtime' 
  AND tablename = 'notifications';

-- 2. إذا لم يكن مفعلاً، فعّله:
ALTER PUBLICATION supabase_realtime ADD TABLE notifications;

-- 3. التحقق من RLS Policies
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
WHERE tablename = 'notifications';

-- 4. التحقق من وجود إشعارات (استبدل USER_ID)
-- SELECT * FROM notifications 
-- WHERE user_id = 'USER_ID_HERE' 
-- ORDER BY created_at DESC 
-- LIMIT 10;

-- 5. التحقق من أن جدول notifications موجود
SELECT 
  table_name,
  column_name,
  data_type
FROM information_schema.columns
WHERE table_name = 'notifications'
ORDER BY ordinal_position;

