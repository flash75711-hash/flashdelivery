-- إضافة دعم محافظ العملاء إلى جدول wallets
-- يمكن استخدام نفس الجدول لكل من السائقين والعملاء

-- إضافة عمود customer_id (اختياري)
ALTER TABLE wallets
ADD COLUMN IF NOT EXISTS customer_id UUID REFERENCES auth.users(id) ON DELETE CASCADE;

-- تعديل constraint للسماح بإما driver_id أو customer_id
-- (يجب أن يكون أحدهما موجوداً على الأقل)
ALTER TABLE wallets
DROP CONSTRAINT IF EXISTS wallets_driver_id_check;

-- إضافة constraint جديد للتحقق من وجود إما driver_id أو customer_id
ALTER TABLE wallets
ADD CONSTRAINT wallets_user_check 
CHECK (
  (driver_id IS NOT NULL AND customer_id IS NULL) OR 
  (driver_id IS NULL AND customer_id IS NOT NULL)
);

-- إنشاء فهرس على customer_id للأداء
CREATE INDEX IF NOT EXISTS idx_wallets_customer_id ON wallets(customer_id);

-- تحديث type للسماح بقيم إضافية للعملاء
-- (يمكن إضافة 'refund' أو 'change' للعملاء)
-- لكن سنستخدم 'earning' للباقي من الطلبات

COMMENT ON COLUMN wallets.customer_id IS 'معرف العميل (إذا كانت المحفظة للعميل)';
COMMENT ON COLUMN wallets.driver_id IS 'معرف السائق (إذا كانت المحفظة للسائق)';

