-- إضافة RLS policy للسماح للعملاء بتحديث طلباتهم (خاصة للإلغاء)
-- ============================================

-- العملاء يمكنهم تحديث طلباتهم (للإلغاء أو التعديل)
DROP POLICY IF EXISTS "Customers can update own orders" ON orders;
CREATE POLICY "Customers can update own orders"
  ON orders FOR UPDATE
  USING (customer_id = auth.uid())
  WITH CHECK (customer_id = auth.uid());

