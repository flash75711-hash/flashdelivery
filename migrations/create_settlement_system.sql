-- إنشاء نظام التوريد (Settlement System)
-- جدول طلبات التوريد من السائقين

CREATE TABLE IF NOT EXISTS settlement_requests (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  driver_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  total_commission DECIMAL(10, 2) NOT NULL,
  receipt_image_url TEXT NOT NULL, -- رابط صورة الوصل من imgbb
  status TEXT CHECK (status IN ('pending', 'approved', 'rejected')) DEFAULT 'pending',
  rejection_reason TEXT, -- سبب الرفض (إذا تم رفض الطلب)
  requested_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  reviewed_at TIMESTAMP WITH TIME ZONE,
  reviewed_by UUID REFERENCES auth.users(id) ON DELETE SET NULL, -- ID المدير الذي راجع الطلب
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- فهارس للأداء
CREATE INDEX IF NOT EXISTS idx_settlement_requests_driver_id ON settlement_requests(driver_id);
CREATE INDEX IF NOT EXISTS idx_settlement_requests_status ON settlement_requests(status);
CREATE INDEX IF NOT EXISTS idx_settlement_requests_requested_at ON settlement_requests(requested_at DESC);

-- إضافة إعدادات معلومات الدفع للإدارة
INSERT INTO app_settings (setting_key, setting_value, setting_type, description, category) VALUES
  ('settlement_bank_name', '', 'text', 'اسم البنك للدفع', 'settlement'),
  ('settlement_account_number', '', 'text', 'رقم الحساب البنكي', 'settlement'),
  ('settlement_account_name', '', 'text', 'اسم صاحب الحساب', 'settlement'),
  ('settlement_phone', '', 'text', 'رقم الهاتف للدفع (مثل فودافون كاش)', 'settlement'),
  ('settlement_notes', '', 'text', 'ملاحظات إضافية للدفع', 'settlement')
ON CONFLICT (setting_key) DO NOTHING;

-- RLS Policies
ALTER TABLE settlement_requests ENABLE ROW LEVEL SECURITY;

-- حذف السياسات القديمة إن وجدت
DROP POLICY IF EXISTS "Drivers can view own settlement requests" ON settlement_requests;
DROP POLICY IF EXISTS "Drivers can create settlement requests" ON settlement_requests;
DROP POLICY IF EXISTS "Admins can view all settlement requests" ON settlement_requests;
DROP POLICY IF EXISTS "Admins can update settlement requests" ON settlement_requests;

-- السائقون يمكنهم قراءة طلباتهم فقط
CREATE POLICY "Drivers can view own settlement requests"
  ON settlement_requests FOR SELECT
  USING (auth.uid() = driver_id);

-- السائقون يمكنهم إنشاء طلبات توريد
CREATE POLICY "Drivers can create settlement requests"
  ON settlement_requests FOR INSERT
  WITH CHECK (auth.uid() = driver_id);

-- الإدارة يمكنها قراءة جميع الطلبات
CREATE POLICY "Admins can view all settlement requests"
  ON settlement_requests FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role = 'admin'
    )
  );

-- الإدارة يمكنها تحديث الطلبات (قبول/رفض)
CREATE POLICY "Admins can update settlement requests"
  ON settlement_requests FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role = 'admin'
    )
  );

COMMENT ON TABLE settlement_requests IS 'طلبات التوريد من السائقين - تحتاج موافقة الإدارة';
COMMENT ON COLUMN settlement_requests.receipt_image_url IS 'رابط صورة الوصل/الريسيت من imgbb';
COMMENT ON COLUMN settlement_requests.status IS 'حالة الطلب: pending (قيد المراجعة), approved (موافق عليه), rejected (مرفوض)';
