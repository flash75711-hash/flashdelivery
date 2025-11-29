# إعداد قاعدة البيانات في Supabase

## الجداول المطلوبة

### 1. جدول `profiles`
```sql
CREATE TABLE profiles (
  id UUID REFERENCES auth.users(id) PRIMARY KEY,
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
```

### 2. جدول `vendors`
```sql
CREATE TABLE vendors (
  id UUID REFERENCES auth.users(id) PRIMARY KEY,
  name TEXT NOT NULL,
  address TEXT,
  phone TEXT,
  working_hours TEXT,
  latitude DOUBLE PRECISION,
  longitude DOUBLE PRECISION,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
```

### 3. جدول `orders`
```sql
CREATE TABLE orders (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  customer_id UUID REFERENCES auth.users(id),
  driver_id UUID REFERENCES auth.users(id),
  vendor_id UUID REFERENCES vendors(id),
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
```

### 4. جدول `wallets`
```sql
CREATE TABLE wallets (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  driver_id UUID REFERENCES auth.users(id) NOT NULL,
  order_id UUID REFERENCES orders(id),
  amount DECIMAL(10, 2) NOT NULL,
  commission DECIMAL(10, 2) DEFAULT 0,
  type TEXT CHECK (type IN ('earning', 'deduction')) DEFAULT 'earning',
  description TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
```

### 5. جدول `driver_locations`
```sql
CREATE TABLE driver_locations (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  driver_id UUID REFERENCES auth.users(id) NOT NULL,
  order_id UUID REFERENCES orders(id),
  latitude DOUBLE PRECISION NOT NULL,
  longitude DOUBLE PRECISION NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
```

## السياسات (Row Level Security)

### تفعيل RLS على جميع الجداول:
```sql
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE vendors ENABLE ROW LEVEL SECURITY;
ALTER TABLE orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE wallets ENABLE ROW LEVEL SECURITY;
ALTER TABLE driver_locations ENABLE ROW LEVEL SECURITY;
```

### سياسات `profiles`:
```sql
-- المستخدمون يمكنهم قراءة ملفاتهم الشخصية
CREATE POLICY "Users can read own profile"
  ON profiles FOR SELECT
  USING (auth.uid() = id);

-- المستخدمون يمكنهم تحديث ملفاتهم الشخصية
CREATE POLICY "Users can update own profile"
  ON profiles FOR UPDATE
  USING (auth.uid() = id);

-- المديرون يمكنهم قراءة جميع الملفات
CREATE POLICY "Admins can read all profiles"
  ON profiles FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid() AND role = 'admin'
    )
  );
```

### سياسات `orders`:
```sql
-- العملاء يمكنهم قراءة طلباتهم
CREATE POLICY "Customers can read own orders"
  ON orders FOR SELECT
  USING (customer_id = auth.uid());

-- العملاء يمكنهم إنشاء طلبات
CREATE POLICY "Customers can create orders"
  ON orders FOR INSERT
  WITH CHECK (customer_id = auth.uid());

-- السائقون يمكنهم قراءة الطلبات المعلقة
CREATE POLICY "Drivers can read pending orders"
  ON orders FOR SELECT
  USING (
    status = 'pending' OR
    driver_id = auth.uid()
  );

-- السائقون يمكنهم تحديث الطلبات المقبولة
CREATE POLICY "Drivers can update accepted orders"
  ON orders FOR UPDATE
  USING (driver_id = auth.uid());

-- المديرون يمكنهم قراءة جميع الطلبات
CREATE POLICY "Admins can read all orders"
  ON orders FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid() AND role = 'admin'
    )
  );
```

### سياسات `wallets`:
```sql
-- السائقون يمكنهم قراءة محافظهم
CREATE POLICY "Drivers can read own wallet"
  ON wallets FOR SELECT
  USING (driver_id = auth.uid());

-- المديرون يمكنهم قراءة جميع المحافظ
CREATE POLICY "Admins can read all wallets"
  ON wallets FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid() AND role = 'admin'
    )
  );
```

## Functions المطلوبة

### دالة تحديث `updated_at` تلقائياً:
```sql
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_profiles_updated_at
  BEFORE UPDATE ON profiles
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_vendors_updated_at
  BEFORE UPDATE ON vendors
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();
```

## ملاحظات مهمة

1. تأكد من تفعيل Realtime في Supabase للجداول المطلوبة:
   - `orders`
   - `profiles`
   - `wallets`

2. أضف فهارس للأداء:
```sql
CREATE INDEX idx_orders_customer_id ON orders(customer_id);
CREATE INDEX idx_orders_driver_id ON orders(driver_id);
CREATE INDEX idx_orders_status ON orders(status);
CREATE INDEX idx_wallets_driver_id ON wallets(driver_id);
CREATE INDEX idx_driver_locations_driver_id ON driver_locations(driver_id);
```

3. بعد إنشاء الجداول، قم بإنشاء حساب مدير يدوياً في Supabase Dashboard.

