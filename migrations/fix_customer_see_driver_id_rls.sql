-- إصلاح RLS policies لضمان أن العملاء يمكنهم رؤية driver_id في طلباتهم
-- ============================================
-- المشكلة: عندما يقبل السائق طلباً، يتم تحديث driver_id عبر Edge Function
-- ولكن اشتراك العميل في Realtime قد لا يتلقى التحديث بسبب RLS policies
-- ============================================

-- التأكد من أن سياسة "Customers can read own orders" تسمح برؤية جميع الحقول
-- بما في ذلك driver_id بعد التحديث

-- إعادة إنشاء السياسة للتأكد من أنها تعمل بشكل صحيح
DROP POLICY IF EXISTS "Customers can read own orders" ON orders;
CREATE POLICY "Customers can read own orders"
  ON orders FOR SELECT
  USING (customer_id = auth.uid());

-- ملاحظة: هذه السياسة تسمح للعملاء برؤية جميع الحقول في طلباتهم
-- بما في ذلك driver_id عندما يتم تحديثه من قبل السائق
-- Supabase Realtime سيرسل التحديثات للعملاء لأنهم يمكنهم قراءة الصفوف الخاصة بهم

-- التحقق من أن Realtime مفعل لجدول orders
-- (يجب أن يكون مفعل بالفعل، ولكن نتحقق للتأكد)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables 
    WHERE pubname = 'supabase_realtime' 
    AND schemaname = 'public' 
    AND tablename = 'orders'
  ) THEN
    -- تفعيل Realtime لجدول orders
    ALTER PUBLICATION supabase_realtime ADD TABLE orders;
  END IF;
END $$;

-- ملاحظات مهمة:
-- 1. سياسة "Customers can read own orders" تسمح للعملاء برؤية جميع الحقول في طلباتهم
-- 2. عندما يتم تحديث driver_id، يجب أن يصل التحديث إلى اشتراك العميل في Realtime
-- 3. إذا لم يصل التحديث، قد يكون السبب:
--    - مشكلة في اتصال Realtime
--    - تأخير في معالجة الأحداث
--    - مشكلة في filter الاشتراك في useMyOrders
