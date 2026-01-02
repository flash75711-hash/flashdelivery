-- Migration: إعادة هيكلة نظام الطلبات
-- التاريخ: 2026-01-01
-- الوصف: إزالة نظام التفاوض وإضافة نظام بسيط للطلبات مع شريط زمني

-- 1. إضافة حقول جديدة
ALTER TABLE orders 
ADD COLUMN IF NOT EXISTS expires_at TIMESTAMP WITH TIME ZONE,
ADD COLUMN IF NOT EXISTS cancelled_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
ADD COLUMN IF NOT EXISTS cancelled_at TIMESTAMP WITH TIME ZONE,
ADD COLUMN IF NOT EXISTS created_by_role TEXT CHECK (created_by_role IN ('customer', 'driver', 'admin')) DEFAULT 'customer',
ADD COLUMN IF NOT EXISTS pickup_items JSONB DEFAULT '[]'::jsonb; -- لتتبع الطلبات المستلمة في رحلة متعددة النقاط

-- 2. إزالة حقول التفاوض (سنحتفظ بالبيانات القديمة لكن لن نستخدمها)
-- ALTER TABLE orders DROP COLUMN IF EXISTS negotiation_status;
-- ALTER TABLE orders DROP COLUMN IF EXISTS negotiated_price;
-- ALTER TABLE orders DROP COLUMN IF EXISTS driver_proposed_price;
-- ALTER TABLE orders DROP COLUMN IF EXISTS customer_proposed_price;
-- ALTER TABLE orders DROP COLUMN IF EXISTS negotiation_history;
-- ALTER TABLE orders DROP COLUMN IF EXISTS search_status;
-- ALTER TABLE orders DROP COLUMN IF EXISTS search_started_at;
-- ALTER TABLE orders DROP COLUMN IF EXISTS search_expanded_at;
-- ALTER TABLE orders DROP COLUMN IF EXISTS deadline;

-- ملاحظة: سنترك الحقول القديمة موجودة لتجنب فقدان البيانات، لكن لن نستخدمها

-- 3. إنشاء فهرس على expires_at للبحث السريع
CREATE INDEX IF NOT EXISTS idx_orders_expires_at ON orders(expires_at) WHERE expires_at IS NOT NULL;

-- 4. إنشاء فهرس على created_by_role
CREATE INDEX IF NOT EXISTS idx_orders_created_by_role ON orders(created_by_role);

-- 5. دالة لتحديث expires_at تلقائياً عند إنشاء الطلب
CREATE OR REPLACE FUNCTION set_order_expires_at()
RETURNS TRIGGER AS $$
BEGIN
  -- إذا لم يتم تحديد expires_at، نضيف 30 دقيقة من وقت الإنشاء
  IF NEW.expires_at IS NULL THEN
    NEW.expires_at := NEW.created_at + INTERVAL '30 minutes';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 6. Trigger لتطبيق الدالة
DROP TRIGGER IF EXISTS trigger_set_order_expires_at ON orders;
CREATE TRIGGER trigger_set_order_expires_at
  BEFORE INSERT ON orders
  FOR EACH ROW
  EXECUTE FUNCTION set_order_expires_at();

-- 7. دالة للتحقق من انتهاء صلاحية الطلبات
CREATE OR REPLACE FUNCTION check_expired_orders()
RETURNS void AS $$
BEGIN
  -- تحديث الطلبات المنتهية الصلاحية إلى cancelled
  UPDATE orders
  SET 
    status = 'cancelled',
    cancelled_at = NOW()
  WHERE 
    status = 'pending'
    AND expires_at IS NOT NULL
    AND expires_at < NOW();
END;
$$ LANGUAGE plpgsql;

-- 8. إنشاء جدول order_items لتتبع حالة كل طلب في رحلة متعددة النقاط
CREATE TABLE IF NOT EXISTS order_items (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  order_id UUID REFERENCES orders(id) ON DELETE CASCADE NOT NULL,
  item_index INTEGER NOT NULL, -- ترتيب الطلب في الرحلة
  address TEXT NOT NULL,
  description TEXT,
  latitude DOUBLE PRECISION,
  longitude DOUBLE PRECISION,
  is_picked_up BOOLEAN DEFAULT false,
  picked_up_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(order_id, item_index)
);

-- 9. فهرس على order_items
CREATE INDEX IF NOT EXISTS idx_order_items_order_id ON order_items(order_id);
CREATE INDEX IF NOT EXISTS idx_order_items_is_picked_up ON order_items(is_picked_up);

-- 10. دالة لإنشاء order_items من items في orders
CREATE OR REPLACE FUNCTION create_order_items_from_items()
RETURNS TRIGGER AS $$
DECLARE
  item_record JSONB;
  item_index INTEGER := 0;
BEGIN
  -- إذا كان items موجوداً ومصفوفة
  IF NEW.items IS NOT NULL AND jsonb_typeof(NEW.items) = 'array' THEN
    -- حذف order_items القديمة لهذا الطلب
    DELETE FROM order_items WHERE order_id = NEW.id;
    
    -- إنشاء order_items جديدة
    FOR item_record IN SELECT * FROM jsonb_array_elements(NEW.items)
    LOOP
      INSERT INTO order_items (
        order_id,
        item_index,
        address,
        description,
        latitude,
        longitude
      ) VALUES (
        NEW.id,
        item_index,
        COALESCE(item_record->>'address', item_record->>'description', ''),
        item_record->>'description',
        (item_record->>'latitude')::DOUBLE PRECISION,
        (item_record->>'longitude')::DOUBLE PRECISION
      );
      item_index := item_index + 1;
    END LOOP;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 11. Trigger لإنشاء order_items تلقائياً
DROP TRIGGER IF EXISTS trigger_create_order_items ON orders;
CREATE TRIGGER trigger_create_order_items
  AFTER INSERT OR UPDATE OF items ON orders
  FOR EACH ROW
  EXECUTE FUNCTION create_order_items_from_items();

