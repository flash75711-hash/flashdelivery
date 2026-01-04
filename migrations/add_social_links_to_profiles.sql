-- إضافة حقول طرق الدفع للملف الشخصي

-- إضافة حقول جديدة لجدول profiles
ALTER TABLE profiles
ADD COLUMN IF NOT EXISTS instapay_number TEXT,
ADD COLUMN IF NOT EXISTS cash_number TEXT;

COMMENT ON COLUMN profiles.instapay_number IS 'رقم انستاباي';
COMMENT ON COLUMN profiles.cash_number IS 'رقم كاش أو رابط الدفع';

