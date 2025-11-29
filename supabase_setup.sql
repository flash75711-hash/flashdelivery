-- ============================================
-- Flash Delivery - إعداد قاعدة البيانات الكامل
-- ============================================
-- انسخ هذا الملف بالكامل والصقه في Supabase SQL Editor
-- ثم نفذ جميع الاستعلامات

-- ============================================
-- 1. إنشاء الجداول
-- ============================================

-- جدول profiles (ملفات المستخدمين)
CREATE TABLE IF NOT EXISTS profiles (
  id UUID REFERENCES auth.users(id) ON DELETE CASCADE PRIMARY KEY,
  email TEXT,
  full_name TEXT,
  phone TEXT,
  role TEXT CHECK (role IN ('customer', 'driver', 'vendor', 'admin')) DEFAULT 'customer',
  status TEXT DEFAULT 'active',
  is_debt_cleared BOOLEAN DEFAULT false,
  avatar_url TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- جدول vendors (مزودو الخدمة)
CREATE TABLE IF NOT EXISTS vendors (
  id UUID REFERENCES auth.users(id) ON DELETE CASCADE PRIMARY KEY,
  name TEXT NOT NULL,
  address TEXT,
  phone TEXT,
  working_hours TEXT,
  latitude DOUBLE PRECISION,
  longitude DOUBLE PRECISION,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- جدول orders (الطلبات)
CREATE TABLE IF NOT EXISTS orders (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  customer_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  driver_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  vendor_id UUID REFERENCES vendors(id) ON DELETE SET NULL,
  status TEXT CHECK (status IN ('pending', 'accepted', 'pickedUp', 'inTransit', 'completed', 'cancelled')) DEFAULT 'pending',
  order_type TEXT DEFAULT 'package',
  items JSONB,
  package_description TEXT,
  pickup_address TEXT NOT NULL,
  delivery_address TEXT NOT NULL,
  total_fee DECIMAL(10, 2) DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  completed_at TIMESTAMP WITH TIME ZONE
);

-- جدول wallets (محافظ السائقين)
CREATE TABLE IF NOT EXISTS wallets (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  driver_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  order_id UUID REFERENCES orders(id) ON DELETE SET NULL,
  amount DECIMAL(10, 2) NOT NULL,
  commission DECIMAL(10, 2) DEFAULT 0,
  type TEXT CHECK (type IN ('earning', 'deduction')) DEFAULT 'earning',
  description TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- جدول driver_locations (مواقع السائقين)
CREATE TABLE IF NOT EXISTS driver_locations (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  driver_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  order_id UUID REFERENCES orders(id) ON DELETE SET NULL,
  latitude DOUBLE PRECISION NOT NULL,
  longitude DOUBLE PRECISION NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ============================================
-- 2. إنشاء الفهارس للأداء
-- ============================================

CREATE INDEX IF NOT EXISTS idx_orders_customer_id ON orders(customer_id);
CREATE INDEX IF NOT EXISTS idx_orders_driver_id ON orders(driver_id);
CREATE INDEX IF NOT EXISTS idx_orders_vendor_id ON orders(vendor_id);
CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(status);
CREATE INDEX IF NOT EXISTS idx_orders_created_at ON orders(created_at);
CREATE INDEX IF NOT EXISTS idx_wallets_driver_id ON wallets(driver_id);
CREATE INDEX IF NOT EXISTS idx_wallets_order_id ON wallets(order_id);
CREATE INDEX IF NOT EXISTS idx_driver_locations_driver_id ON driver_locations(driver_id);
CREATE INDEX IF NOT EXISTS idx_driver_locations_order_id ON driver_locations(order_id);
CREATE INDEX IF NOT EXISTS idx_profiles_role ON profiles(role);
CREATE INDEX IF NOT EXISTS idx_profiles_status ON profiles(status);

-- ============================================
-- 3. إنشاء الدوال (Functions)
-- ============================================

-- دالة تحديث updated_at تلقائياً
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ============================================
-- 4. إنشاء Triggers
-- ============================================

-- Trigger لتحديث updated_at في profiles
DROP TRIGGER IF EXISTS update_profiles_updated_at ON profiles;
CREATE TRIGGER update_profiles_updated_at
  BEFORE UPDATE ON profiles
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Trigger لتحديث updated_at في vendors
DROP TRIGGER IF EXISTS update_vendors_updated_at ON vendors;
CREATE TRIGGER update_vendors_updated_at
  BEFORE UPDATE ON vendors
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Trigger لتحديث updated_at في driver_locations
DROP TRIGGER IF EXISTS update_driver_locations_updated_at ON driver_locations;
CREATE TRIGGER update_driver_locations_updated_at
  BEFORE UPDATE ON driver_locations
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- ============================================
-- 5. تفعيل Row Level Security (RLS)
-- ============================================

ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE vendors ENABLE ROW LEVEL SECURITY;
ALTER TABLE orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE wallets ENABLE ROW LEVEL SECURITY;
ALTER TABLE driver_locations ENABLE ROW LEVEL SECURITY;

-- ============================================
-- 6. سياسات profiles
-- ============================================

-- المستخدمون يمكنهم قراءة ملفاتهم الشخصية
DROP POLICY IF EXISTS "Users can read own profile" ON profiles;
CREATE POLICY "Users can read own profile"
  ON profiles FOR SELECT
  USING (auth.uid() = id);

-- المستخدمون يمكنهم تحديث ملفاتهم الشخصية
DROP POLICY IF EXISTS "Users can update own profile" ON profiles;
CREATE POLICY "Users can update own profile"
  ON profiles FOR UPDATE
  USING (auth.uid() = id);

-- المستخدمون يمكنهم إدراج ملفاتهم الشخصية
DROP POLICY IF EXISTS "Users can insert own profile" ON profiles;
CREATE POLICY "Users can insert own profile"
  ON profiles FOR INSERT
  WITH CHECK (auth.uid() = id);

-- المديرون يمكنهم قراءة جميع الملفات
DROP POLICY IF EXISTS "Admins can read all profiles" ON profiles;
CREATE POLICY "Admins can read all profiles"
  ON profiles FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid() AND role = 'admin'
    )
  );

-- المديرون يمكنهم تحديث جميع الملفات
DROP POLICY IF EXISTS "Admins can update all profiles" ON profiles;
CREATE POLICY "Admins can update all profiles"
  ON profiles FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid() AND role = 'admin'
    )
  );

-- ============================================
-- 7. سياسات vendors
-- ============================================

-- الجميع يمكنهم قراءة مزودي الخدمة
DROP POLICY IF EXISTS "Anyone can read vendors" ON vendors;
CREATE POLICY "Anyone can read vendors"
  ON vendors FOR SELECT
  USING (true);

-- مزودو الخدمة يمكنهم تحديث متاجرهم
DROP POLICY IF EXISTS "Vendors can update own store" ON vendors;
CREATE POLICY "Vendors can update own store"
  ON vendors FOR UPDATE
  USING (auth.uid() = id);

-- مزودو الخدمة يمكنهم إدراج متاجرهم
DROP POLICY IF EXISTS "Vendors can insert own store" ON vendors;
CREATE POLICY "Vendors can insert own store"
  ON vendors FOR INSERT
  WITH CHECK (auth.uid() = id);

-- ============================================
-- 8. سياسات orders
-- ============================================

-- العملاء يمكنهم قراءة طلباتهم
DROP POLICY IF EXISTS "Customers can read own orders" ON orders;
CREATE POLICY "Customers can read own orders"
  ON orders FOR SELECT
  USING (customer_id = auth.uid());

-- العملاء يمكنهم إنشاء طلبات
DROP POLICY IF EXISTS "Customers can create orders" ON orders;
CREATE POLICY "Customers can create orders"
  ON orders FOR INSERT
  WITH CHECK (customer_id = auth.uid());

-- السائقون يمكنهم قراءة الطلبات المعلقة أو طلباتهم
DROP POLICY IF EXISTS "Drivers can read pending and own orders" ON orders;
CREATE POLICY "Drivers can read pending and own orders"
  ON orders FOR SELECT
  USING (
    status = 'pending' OR
    driver_id = auth.uid()
  );

-- السائقون يمكنهم تحديث الطلبات المقبولة
DROP POLICY IF EXISTS "Drivers can update accepted orders" ON orders;
CREATE POLICY "Drivers can update accepted orders"
  ON orders FOR UPDATE
  USING (driver_id = auth.uid());

-- المديرون يمكنهم قراءة جميع الطلبات
DROP POLICY IF EXISTS "Admins can read all orders" ON orders;
CREATE POLICY "Admins can read all orders"
  ON orders FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid() AND role = 'admin'
    )
  );

-- المديرون يمكنهم تحديث جميع الطلبات
DROP POLICY IF EXISTS "Admins can update all orders" ON orders;
CREATE POLICY "Admins can update all orders"
  ON orders FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid() AND role = 'admin'
    )
  );

-- ============================================
-- 9. سياسات wallets
-- ============================================

-- السائقون يمكنهم قراءة محافظهم
DROP POLICY IF EXISTS "Drivers can read own wallet" ON wallets;
CREATE POLICY "Drivers can read own wallet"
  ON wallets FOR SELECT
  USING (driver_id = auth.uid());

-- النظام يمكنه إدراج سجلات في المحافظ (عند إكمال الطلب)
DROP POLICY IF EXISTS "System can insert wallet records" ON wallets;
CREATE POLICY "System can insert wallet records"
  ON wallets FOR INSERT
  WITH CHECK (true);

-- المديرون يمكنهم قراءة جميع المحافظ
DROP POLICY IF EXISTS "Admins can read all wallets" ON wallets;
CREATE POLICY "Admins can read all wallets"
  ON wallets FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid() AND role = 'admin'
    )
  );

-- ============================================
-- 10. سياسات driver_locations
-- ============================================

-- السائقون يمكنهم إدراج وتحديث مواقعهم
DROP POLICY IF EXISTS "Drivers can manage own locations" ON driver_locations;
CREATE POLICY "Drivers can manage own locations"
  ON driver_locations FOR ALL
  USING (driver_id = auth.uid())
  WITH CHECK (driver_id = auth.uid());

-- المديرون يمكنهم قراءة جميع المواقع
DROP POLICY IF EXISTS "Admins can read all locations" ON driver_locations;
CREATE POLICY "Admins can read all locations"
  ON driver_locations FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid() AND role = 'admin'
    )
  );

-- ============================================
-- 11. دالة لإنشاء ملف المستخدم تلقائياً
-- ============================================

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, email, role)
  VALUES (NEW.id, NEW.email, 'customer');
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger لإنشاء ملف المستخدم عند التسجيل
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_user();

-- ============================================
-- ✅ تم الانتهاء!
-- ============================================
-- الآن قم بتفعيل Realtime في Supabase Dashboard:
-- 1. اذهب إلى Database > Replication
-- 2. فعّل Realtime للجداول التالية:
--    - orders
--    - profiles
--    - wallets
-- ============================================

