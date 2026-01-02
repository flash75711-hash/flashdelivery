-- إصلاح RLS policy للسماح للسائقين بقبول الطلبات المعلقة
-- ============================================

-- السائقون يمكنهم تحديث الطلبات المعلقة (pending) ليقبلوها
-- هذا يسمح للسائقين بتحديث status من pending إلى accepted
DROP POLICY IF EXISTS "Drivers can update pending orders" ON orders;
CREATE POLICY "Drivers can update pending orders"
  ON orders FOR UPDATE
  USING (
    status = 'pending' 
    AND driver_id IS NULL
  )
  WITH CHECK (
    status = 'pending' 
    AND driver_id IS NULL
  );

-- السائقون يمكنهم تحديث الطلبات المقبولة (التي قبلوها)
DROP POLICY IF EXISTS "Drivers can update accepted orders" ON orders;
CREATE POLICY "Drivers can update accepted orders"
  ON orders FOR UPDATE
  USING (driver_id = auth.uid())
  WITH CHECK (driver_id = auth.uid());

