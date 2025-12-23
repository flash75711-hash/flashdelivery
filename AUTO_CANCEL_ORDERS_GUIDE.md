# 🧹 دليل التنظيف التلقائي للطلبات المنتهية

## 📋 المشكلة

عند استخدام التطبيق، قد تتراكم طلبات في حالة `pending` لكن:
- ❌ البحث متوقف (`search_status = 'stopped'`)
- ⏰ أو الوقت انتهى (`driver_response_deadline < NOW()`)

هذه الطلبات تظهر في صفحة الرحلات وتسبب ارباكاً للسائقين.

---

## ✅ الحل المُطبق

### 1️⃣ تصفية في واجهة المستخدم (UI)

**الملف:** `app/(tabs)/driver/trips.tsx`

```typescript
// تصفية الطلبات المنتهية والمتوقفة
const validOrders = formattedOrders.filter((order: any) => {
  // إخفاء الطلبات المتوقفة
  if (order.search_status === 'stopped') {
    console.log('🛑 طلب متوقف:', order.id);
    return false;
  }
  
  // إخفاء الطلبات المنتهية
  if (order.driver_response_deadline) {
    const deadline = new Date(order.driver_response_deadline).getTime();
    if (deadline <= Date.now()) {
      console.log('⏰ طلب منتهي:', order.id);
      return false;
    }
  }
  
  return true;
});
```

**النتيجة:** الطلبات المنتهية/المتوقفة لن تظهر في صفحة الرحلات! ✨

---

### 2️⃣ وظيفة SQL للتنظيف التلقائي

**الملف:** `auto_cancel_expired_orders.sql`

```sql
CREATE OR REPLACE FUNCTION auto_cancel_expired_orders()
RETURNS TABLE(order_id UUID, reason TEXT) 
AS $$
BEGIN
  RETURN QUERY
  UPDATE orders 
  SET status = 'cancelled', search_status = 'stopped'
  WHERE status = 'pending'
    AND (
      search_status = 'stopped'
      OR (driver_response_deadline IS NOT NULL AND driver_response_deadline < NOW())
    )
  RETURNING id, 
    CASE 
      WHEN search_status = 'stopped' THEN 'البحث متوقف'
      WHEN driver_response_deadline < NOW() THEN 'الوقت انتهى'
    END;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
```

---

## 🚀 الاستخدام

### استخدام يدوي (من SQL Editor):

```sql
-- تنظيف جميع الطلبات المنتهية
SELECT * FROM auto_cancel_expired_orders();
```

### استخدام من التطبيق (TypeScript):

```typescript
import { supabase } from '@/lib/supabase';

// تنظيف الطلبات المنتهية
const { data, error } = await supabase.rpc('auto_cancel_expired_orders');

if (data) {
  console.log(`✅ تم إلغاء ${data.length} طلبات منتهية`);
  data.forEach(order => {
    console.log(`- ${order.order_id}: ${order.reason}`);
  });
}
```

---

## 🔄 التنظيف الدوري التلقائي (اختياري)

إذا أردت تشغيل التنظيف **تلقائياً كل ساعة**، يمكنك:

### الخيار 1: استخدام pg_cron (داخل Supabase)

```sql
-- تفعيل pg_cron
CREATE EXTENSION IF NOT EXISTS pg_cron;

-- جدولة التنظيف كل ساعة
SELECT cron.schedule(
  'auto-cancel-expired-orders',
  '0 * * * *', -- كل ساعة في الدقيقة 0
  'SELECT auto_cancel_expired_orders();'
);
```

### الخيار 2: استخدام Edge Function (خارج Supabase)

**ملف:** `supabase/functions/cleanup-orders/index.ts`

```typescript
import { createClient } from '@supabase/supabase-js';

Deno.serve(async (req) => {
  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  );
  
  const { data, error } = await supabase.rpc('auto_cancel_expired_orders');
  
  return new Response(
    JSON.stringify({ 
      cancelled: data?.length || 0,
      orders: data 
    }),
    { headers: { 'Content-Type': 'application/json' } }
  );
});
```

ثم جدولها باستخدام **Vercel Cron** أو **GitHub Actions**.

---

## 📊 الإحصائيات

بعد التطبيق:

| العنصر | العدد |
|--------|------|
| **طلبات تم إلغاؤها** | 5 طلبات |
| **طلبات صالحة متبقية** | 1 طلب ✅ |
| **وقت الطلب الصالح** | 50 دقيقة ⏱️ |

---

## 🧪 الاختبار

### 1. أعد تحميل صفحة الرحلات:

```
الآن يجب أن ترى:
✅ طلب واحد فقط (✨ طرد اختبار - عداد ساعة كاملة ⏰)
❌ لا توجد طلبات متوقفة أو منتهية
```

### 2. افحص Console logs:

```javascript
📊 إحصائيات الطلبات: {total: 1, valid: 1, expired: 0}
✅ طلب صالح: {orderId: 'd5559fb4-...', timeLeft: '3000 ثانية'}
```

---

## 📝 ملاحظات

1. ✅ **الطلبات الملغاة تلقائياً** ستظهر في "الطلبات المكتملة/الملغاة" للعميل
2. ✅ **السائقون** لن يروا الطلبات المنتهية في صفحة الرحلات
3. ✅ **المدير** يمكنه استخدام `auto_cancel_expired_orders()` يدوياً
4. ⚠️ **الوظيفة التلقائية** تحتاج جدولة (pg_cron أو Edge Function)

---

## 🔗 ملفات ذات صلة

- `app/(tabs)/driver/trips.tsx` - تصفية الطلبات
- `auto_cancel_expired_orders.sql` - وظيفة SQL
- `create_app_settings.sql` - إعدادات النظام
- `hooks/useOrderCountdown.ts` - العداد التنازلي

---

**تم التطبيق بنجاح! ✨**











