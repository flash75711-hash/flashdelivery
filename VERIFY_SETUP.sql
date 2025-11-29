-- ============================================
-- ملف التحقق من إعداد قاعدة البيانات
-- ============================================
-- نفذ هذا الملف بعد إعداد قاعدة البيانات
-- للتأكد من أن كل شيء يعمل بشكل صحيح

-- 1. التحقق من وجود الجداول
SELECT 
  'Tables Check' as check_type,
  table_name,
  CASE 
    WHEN table_name IN ('profiles', 'vendors', 'orders', 'wallets', 'driver_locations') 
    THEN '✅ موجود' 
    ELSE '❌ مفقود' 
  END as status
FROM information_schema.tables 
WHERE table_schema = 'public' 
AND table_name IN ('profiles', 'vendors', 'orders', 'wallets', 'driver_locations')
ORDER BY table_name;

-- 2. التحقق من تفعيل RLS
SELECT 
  'RLS Check' as check_type,
  tablename,
  CASE 
    WHEN rowsecurity THEN '✅ مفعل' 
    ELSE '❌ غير مفعل' 
  END as status
FROM pg_tables 
WHERE schemaname = 'public' 
AND tablename IN ('profiles', 'vendors', 'orders', 'wallets', 'driver_locations')
ORDER BY tablename;

-- 3. التحقق من الفهارس
SELECT 
  'Indexes Check' as check_type,
  tablename,
  indexname,
  '✅ موجود' as status
FROM pg_indexes 
WHERE schemaname = 'public' 
AND tablename IN ('profiles', 'vendors', 'orders', 'wallets', 'driver_locations')
ORDER BY tablename, indexname;

-- 4. التحقق من Triggers
SELECT 
  'Triggers Check' as check_type,
  trigger_name,
  event_object_table,
  CASE 
    WHEN trigger_name LIKE '%updated_at%' THEN '✅ موجود' 
    ELSE '⚠️ تحقق يدوياً' 
  END as status
FROM information_schema.triggers 
WHERE trigger_schema = 'public'
AND event_object_table IN ('profiles', 'vendors', 'driver_locations')
ORDER BY event_object_table, trigger_name;

-- 5. التحقق من السياسات (Policies)
SELECT 
  'Policies Check' as check_type,
  schemaname,
  tablename,
  policyname,
  '✅ موجود' as status
FROM pg_policies 
WHERE schemaname = 'public' 
AND tablename IN ('profiles', 'vendors', 'orders', 'wallets', 'driver_locations')
ORDER BY tablename, policyname;

-- 6. التحقق من الدوال (Functions)
SELECT 
  'Functions Check' as check_type,
  routine_name,
  CASE 
    WHEN routine_name = 'update_updated_at_column' THEN '✅ موجود' 
    WHEN routine_name = 'handle_new_user' THEN '✅ موجود' 
    ELSE '⚠️ تحقق يدوياً' 
  END as status
FROM information_schema.routines 
WHERE routine_schema = 'public' 
AND routine_name IN ('update_updated_at_column', 'handle_new_user')
ORDER BY routine_name;

-- ============================================
-- ملخص التحقق
-- ============================================
-- إذا رأيت ✅ في جميع النتائج، فالإعداد صحيح!
-- إذا رأيت ❌ أو ⚠️، راجع ملف supabase_setup.sql

