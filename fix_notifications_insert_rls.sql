-- ============================================
-- إصلاح سياسات RLS للسماح للعملاء بإدراج إشعارات للسائقين
-- ============================================
-- المشكلة: العملاء لا يستطيعون إدراج إشعارات في جدول notifications
-- الحل: إضافة سياسة تسمح للعملاء بإدراج إشعارات للسائقين عند إنشاء طلب
-- ============================================

-- سياسة تسمح للعملاء بإدراج إشعارات للسائقين
-- هذا ضروري عندما يضع العميل طلباً جديداً ويحتاج لإشعار السائقين
DROP POLICY IF EXISTS "Customers can insert notifications for drivers" ON notifications;
CREATE POLICY "Customers can insert notifications for drivers"
  ON notifications FOR INSERT
  WITH CHECK (
    -- يجب أن يكون المستخدم الحالي عميلاً
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
        AND profiles.role = 'customer'
    )
    -- يجب أن يكون المستلم (user_id) سائقاً نشطاً وموافقاً عليه
    AND EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = user_id
        AND profiles.role = 'driver'
        AND profiles.status = 'active'
        AND profiles.approval_status = 'approved'
    )
  );

-- ============================================
-- ✅ تم الإصلاح!
-- ============================================
-- الآن يمكن للعملاء إدراج إشعارات للسائقين عند إنشاء طلب جديد
-- ============================================
