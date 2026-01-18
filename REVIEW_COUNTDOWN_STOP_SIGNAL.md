# مراجعة الإشارة لإيقاف العداد

## 🔍 التدفق الحالي

### 1️⃣ السائق يضغط "قبول"
**الموقع:** `app/(tabs)/driver/trips.tsx` → `handleAcceptOrder()`

```typescript
supabase.functions.invoke('update-order', {
  body: {
    orderId: order.id,
    status: 'accepted',
    driverId: user.id,
  },
});
```

---

### 2️⃣ Edge Function `update-order`
**الموقع:** `supabase/functions/update-order/index.ts`

```typescript
// تحديد ما إذا كان هذا قبول طلب جديد
const isAcceptingOrder = status === 'accepted' && driverId && existingOrder?.status === 'pending' && !existingOrder?.driver_id;

// عند قبول الطلب، تحديث search_status إلى 'found' لإيقاف البحث
if (isAcceptingOrder) {
  updateData.search_status = 'found';
  console.log('[update-order] تحديث search_status إلى "found" عند قبول الطلب');
}

// تحديث قاعدة البيانات
const { data: updatedOrder, error: updateError } = await supabase
  .from('orders')
  .update(updateData)
  .eq('id', orderId)
  .select()
  .single();
```

**✅ ما يتم تحديثه:**
- `status` → `'accepted'`
- `driver_id` → `driverId`
- `search_status` → `'found'` ⭐ **هذه هي الإشارة لإيقاف العداد**

---

### 3️⃣ Realtime Subscription
**الموقع:** `components/OrderSearchCountdown.tsx` → `subscriptionRef`

```typescript
subscriptionRef.current = supabase
  .channel(`order_search_${orderId}`)
  .on('postgres_changes', {
    event: 'UPDATE',
    schema: 'public',
    table: 'orders',
    filter: `id=eq.${orderId}`,
  }, (payload) => {
    const order = payload.new as any;
    
    // التحقق من search_status أولاً
    if (order.search_status === 'found' || order.search_status === 'stopped') {
      // إيقاف العداد فوراً
      setTimeRemaining(null);
      setSearchStatus(order.search_status);
      searchStatusRef.current = order.search_status;
      // ...
    }
  });
```

**✅ ما يجب أن يحدث:**
- Realtime subscription يكتشف التغيير في `search_status`
- يتم إيقاف العداد فوراً

---

### 4️⃣ Polling Check
**الموقع:** `components/OrderSearchCountdown.tsx` → `intervalRef` → polling

```typescript
// كل 1 ثانية
if (now - lastDbCheckRef.current > currentThrottle) {
  supabase
    .from('orders')
    .select('search_status, search_expires_at, status')
    .eq('id', orderId)
    .maybeSingle()
    .then(({ data }) => {
      // التحقق من search_status أولاً
      if (data.search_status === 'found' || data.search_status === 'stopped') {
        // إيقاف العداد فوراً
        setTimeRemaining(null);
        setSearchStatus(data.search_status);
        // ...
      }
    });
}
```

**✅ ما يجب أن يحدث:**
- Polling يتحقق كل 1 ثانية
- إذا كان `search_status === 'found'`، يتم إيقاف العداد

---

## ⚠️ المشاكل المحتملة

### 1. Realtime Subscription لا يعمل
**السبب:**
- مشاكل في الاتصال
- Realtime service غير نشط
- الـ subscription لم يتم الاشتراك بشكل صحيح

**الحل:**
- Polling يعمل كـ fallback (كل 1 ثانية)

---

### 2. التحديث لا يصل للـ Subscription
**السبب:**
- تأخير في Realtime
- الـ payload لا يحتوي على `search_status`

**الحل:**
- إضافة logging للتحقق من الـ payload
- Polling يعمل كـ fallback

---

### 3. `search_status` لا يتم تحديثه
**السبب:**
- `isAcceptingOrder` غير صحيح
- التحديث فشل في قاعدة البيانات

**الحل:**
- إضافة logging في Edge Function
- التحقق من `updatedOrder` بعد التحديث

---

## ✅ التحسينات المطلوبة

### 1. إضافة Logging في Edge Function
```typescript
// بعد التحديث
console.log('[update-order] Updated order:', {
  orderId,
  search_status: updatedOrder?.search_status,
  status: updatedOrder?.status,
  driver_id: updatedOrder?.driver_id,
});
```

### 2. التحقق من `updatedOrder` بعد التحديث
```typescript
if (updatedOrder) {
  console.log('[update-order] ✅ Order updated successfully:', {
    search_status: updatedOrder.search_status,
    status: updatedOrder.status,
  });
} else {
  console.error('[update-order] ❌ Order update returned no data');
}
```

### 3. إضافة Logging في Subscription
```typescript
console.log(`[OrderSearchCountdown] Realtime update payload:`, {
  orderId,
  status: order.status,
  search_status: order.search_status,
  search_expires_at: order.search_expires_at,
  fullPayload: payload,
});
```

---

## 🧪 الاختبار

1. ✅ السائق يضغط "قبول"
2. ✅ Edge Function يحدث `search_status` إلى `'found'`
3. ✅ Realtime subscription يكتشف التغيير
4. ✅ Polling يكتشف التغيير (fallback)
5. ✅ العداد يتوقف فوراً

---

## 📝 ملاحظات

- **Realtime Subscription** قد لا يعمل في بعض الحالات
- **Polling** يعمل كـ fallback (كل 1 ثانية)
- **Logging** يساعد في تتبع المشاكل
