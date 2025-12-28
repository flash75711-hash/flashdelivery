-- ============================================
-- تفعيل Supabase Realtime لجدول orders
-- ============================================
-- نفذ هذا الملف في Supabase SQL Editor

-- تفعيل Realtime لجدول orders (لإشعارات In-App)
ALTER PUBLICATION supabase_realtime ADD TABLE orders;

-- ملاحظة: إذا كان Realtime مفعلاً بالفعل، سيظهر خطأ يمكن تجاهله
-- للتحقق من أن Realtime مفعل:
-- اذهب إلى Supabase Dashboard → Database → Replication
-- تأكد من أن orders موجود في القائمة ومفعّل ✅

