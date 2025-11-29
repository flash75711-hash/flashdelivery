-- ============================================
-- تحديثات قاعدة البيانات - إكمال التسجيل
-- ============================================

-- 1. تحديث جدول profiles - إضافة حقول السائق
ALTER TABLE profiles 
ADD COLUMN IF NOT EXISTS id_card_image_url TEXT,
ADD COLUMN IF NOT EXISTS selfie_image_url TEXT;

-- 2. إنشاء جدول customer_addresses (عناوين العملاء)
CREATE TABLE IF NOT EXISTS customer_addresses (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  customer_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  place_name TEXT NOT NULL, -- اسم المكان العام (مثل: "مول مصر", "شارع النيل")
  building_number TEXT, -- رقم العقار
  apartment_number TEXT, -- رقم الشقة
  floor_number TEXT, -- الدور
  full_address TEXT, -- العنوان الكامل (يتم إنشاؤه تلقائياً)
  is_default BOOLEAN DEFAULT false, -- العنوان الافتراضي
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 3. تحديث جدول vendors - إضافة حقول إضافية
ALTER TABLE vendors 
ADD COLUMN IF NOT EXISTS place_number TEXT, -- رقم المكان
ADD COLUMN IF NOT EXISTS location_source TEXT CHECK (location_source IN ('auto', 'manual')) DEFAULT 'auto'; -- مصدر الموقع (تلقائي أو يدوي)

-- 4. إنشاء Indexes
CREATE INDEX IF NOT EXISTS idx_customer_addresses_customer_id ON customer_addresses(customer_id);
CREATE INDEX IF NOT EXISTS idx_customer_addresses_default ON customer_addresses(customer_id, is_default);

-- 5. إنشاء Trigger لتحديث updated_at في customer_addresses
DROP TRIGGER IF EXISTS update_customer_addresses_updated_at ON customer_addresses;
CREATE TRIGGER update_customer_addresses_updated_at
  BEFORE UPDATE ON customer_addresses
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- 6. تفعيل RLS على customer_addresses
ALTER TABLE customer_addresses ENABLE ROW LEVEL SECURITY;

-- 7. سياسات customer_addresses
-- العملاء يمكنهم قراءة عناوينهم
DROP POLICY IF EXISTS "Customers can read own addresses" ON customer_addresses;
CREATE POLICY "Customers can read own addresses"
  ON customer_addresses FOR SELECT
  USING (customer_id = auth.uid());

-- العملاء يمكنهم إدراج عناوينهم
DROP POLICY IF EXISTS "Customers can insert own addresses" ON customer_addresses;
CREATE POLICY "Customers can insert own addresses"
  ON customer_addresses FOR INSERT
  WITH CHECK (customer_id = auth.uid());

-- العملاء يمكنهم تحديث عناوينهم
DROP POLICY IF EXISTS "Customers can update own addresses" ON customer_addresses;
CREATE POLICY "Customers can update own addresses"
  ON customer_addresses FOR UPDATE
  USING (customer_id = auth.uid());

-- العملاء يمكنهم حذف عناوينهم
DROP POLICY IF EXISTS "Customers can delete own addresses" ON customer_addresses;
CREATE POLICY "Customers can delete own addresses"
  ON customer_addresses FOR DELETE
  USING (customer_id = auth.uid());

-- 8. دالة لإنشاء العنوان الكامل تلقائياً
CREATE OR REPLACE FUNCTION generate_full_address()
RETURNS TRIGGER AS $$
BEGIN
  NEW.full_address := 
    COALESCE(NEW.place_name, '') ||
    CASE WHEN NEW.building_number IS NOT NULL THEN '، مبنى ' || NEW.building_number ELSE '' END ||
    CASE WHEN NEW.apartment_number IS NOT NULL THEN '، شقة ' || NEW.apartment_number ELSE '' END ||
    CASE WHEN NEW.floor_number IS NOT NULL THEN '، دور ' || NEW.floor_number ELSE '' END;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger لإنشاء العنوان الكامل تلقائياً
DROP TRIGGER IF EXISTS generate_customer_address_full ON customer_addresses;
CREATE TRIGGER generate_customer_address_full
  BEFORE INSERT OR UPDATE ON customer_addresses
  FOR EACH ROW
  EXECUTE FUNCTION generate_full_address();

