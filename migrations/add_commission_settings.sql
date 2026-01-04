-- إضافة إعدادات العمولة والتوريد

-- إضافة إعدادات العمولة
INSERT INTO app_settings (setting_key, setting_value, setting_type, description, category) VALUES
  ('commission_rate', '10', 'number', 'نسبة العمولة المئوية (10 = 10%)', 'commission'),
  ('settlement_day', '1', 'number', 'يوم التوريد من كل شهر (1-28)', 'commission'),
  ('last_settlement_date', NULL, 'text', 'تاريخ آخر توريد', 'commission')
ON CONFLICT (setting_key) DO NOTHING;

-- إضافة عمود commission_paid في wallets لتتبع ما إذا تم دفع العمولة
ALTER TABLE wallets
ADD COLUMN IF NOT EXISTS commission_paid BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS settlement_date DATE;

-- إنشاء فهرس على commission_paid وsettlement_date
CREATE INDEX IF NOT EXISTS idx_wallets_commission_paid ON wallets(commission_paid, settlement_date);

COMMENT ON COLUMN wallets.commission_paid IS 'هل تم دفع العمولة لهذا السجل';
COMMENT ON COLUMN wallets.settlement_date IS 'تاريخ التوريد';

