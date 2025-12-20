# إنشاء جدول customer_addresses في Supabase

## المشكلة:
عند الضغط على "إكمال التسجيل" في صفحة العميل، يظهر خطأ `404 (Not Found)` لأن جدول `customer_addresses` غير موجود.

## الحل:

### 1. اذهب إلى Supabase SQL Editor:
https://supabase.com/dashboard/project/tnwrmybyvimlsamnputn/sql

### 2. انسخ والصق الكود التالي:

```sql
-- إنشاء جدول customer_addresses (عناوين العملاء)
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

-- إنشاء Indexes
CREATE INDEX IF NOT EXISTS idx_customer_addresses_customer_id ON customer_addresses(customer_id);
CREATE INDEX IF NOT EXISTS idx_customer_addresses_default ON customer_addresses(customer_id, is_default);

-- تفعيل RLS على customer_addresses
ALTER TABLE customer_addresses ENABLE ROW LEVEL SECURITY;

-- سياسات customer_addresses
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
```

### 3. اضغط **"Run"** ✅

---

## بعد التنفيذ:

1. جرب إكمال التسجيل مرة أخرى
2. يجب أن يعمل الآن! ✅

---

## ملاحظات:

- إذا ظهر خطأ "relation already exists"، يعني أن الجدول موجود بالفعل
- تأكد من تفعيل RLS (Row Level Security) على الجدول
- تأكد من أن السياسات (Policies) تم إنشاؤها بشكل صحيح



























