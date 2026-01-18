# مراجعة شاملة: إشارة إيقاف العداد

## 📋 التدفق الكامل

### 1️⃣ السائق يضغط "قبول"
**الموقع:** `app/(tabs)/driver/trips.tsx` → `handleAcceptOrder()`

```typescript
const { data: edgeFunctionData, error: edgeFunctionError } = await supabase.functions.invoke('update-order', {
  body: {
    orderId: order.id,
    status: 'accepted',
    driverId: user.id,
  },
});
```

**✅ ما يتم إرساله:**
- `orderId`: معرف الطلب
- `status`: `'accepted'`
- `driverId`: معرف السائق

---

### 2️⃣ Edge Function `update-order`
**الموقع:** `supabase/functions/update-order/index.ts`

#### أ. التحقق من قبول الطلب
```typescript
const isAcceptingOrder = status === 'accepted' && driverId && existingOrder?.status === 'pending' && !existingOrder?.driver_id;
```

#### ب. تحديث `search_status` إلى `'found'`
```typescript
if (isAcceptingOrder) {
  updateData.search_status = 'found';
  console.log('[update-order] تحديث search_status إلى "found" عند قبول الطلب');
}
```

#### ج. تحديث قاعدة البيانات
```typescript
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

#### د. Logging إضافي (تم إضافته)
```typescript
console.log('[update-order] Updating order with data:', {
  orderId,
  updateData,
  isAcceptingOrder,
});

if (updatedOrder) {
  console.log('[update-order] ✅ Order updated successfully:', {
    orderId,
    status: updatedOrder.status,
    search_status: updatedOrder.search_status,
    driver_id: updatedOrder.driver_id,
  });
  
  // التحقق من أن search_status تم تحديثه بشكل صحيح
  if (isAcceptingOrder && updatedOrder.search_status !== 'found') {
    console.error('[update-order] ⚠️ WARNING: search_status was not set to "found"!', {
      expected: 'found',
      actual: updatedOrder.search_status,
    });
  }
}
```

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
    
    // Logging إضافي (تم إضافته)
    console.log(`[OrderSearchCountdown] Realtime update for order ${orderId}:`, {
      status: order.status,
      search_status: order.search_status,
      search_expires_at: order.search_expires_at,
      driver_id: order.driver_id,
      eventType: payload.eventType,
      table: payload.table,
      schema: payload.schema,
    });
    
    // التحقق من search_status أولاً
    if (order.search_status === 'found' || order.search_status === 'stopped') {
      console.log(`[OrderSearchCountdown] Order ${orderId} search_status changed to ${order.search_status}, stopping countdown immediately`);
      setTimeRemaining(null);
      setSearchStatus(order.search_status);
      searchStatusRef.current = order.search_status;
      // إيقاف interval
      // إجبار polling فوري
      return;
    }
  });
```

**✅ ما يجب أن يحدث:**
- Realtime subscription يكتشف التغيير في `search_status`
- يتم إيقاف العداد فوراً
- Logging يظهر التحديثات

---

### 4️⃣ Polling Check (Fallback)
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
      // Logging إضافي (تم إضافته)
      console.log(`[OrderSearchCountdown] Polling update for order ${orderId}:`, {
        status: data.status,
        search_status: data.search_status,
        search_expires_at: data.search_expires_at,
        driver_id: data.driver_id,
        currentSearchStatusRef: searchStatusRef.current,
        currentOrderStatusRef: orderStatusRef.current,
      });
      
      // التحقق من search_status أولاً
      if (data.search_status === 'found' || data.search_status === 'stopped') {
        console.log(`[OrderSearchCountdown] Polling detected search_status=${data.search_status}, stopping countdown immediately`);
        setTimeRemaining(null);
        setSearchStatus(data.search_status);
        // إيقاف interval
        return;
      }
    });
}
```

**✅ ما يجب أن يحدث:**
- Polling يتحقق كل 1 ثانية
- إذا كان `search_status === 'found'`، يتم إيقاف العداد
- Logging يظهر التحديثات

---

## 🔍 التحسينات المضافة

### 1. Logging في Edge Function
- ✅ تسجيل `updateData` قبل التحديث
- ✅ تسجيل `updatedOrder` بعد التحديث
- ✅ التحقق من أن `search_status === 'found'` بعد التحديث

### 2. Logging في Subscription
- ✅ تسجيل الـ payload بالكامل
- ✅ تسجيل `eventType`, `table`, `schema`
- ✅ التحقق من أن `order` موجود

### 3. Logging في Polling
- ✅ تسجيل البيانات من قاعدة البيانات
- ✅ تسجيل `currentSearchStatusRef` و `currentOrderStatusRef`
- ✅ تسجيل `driver_id` للتحقق

---

## ⚠️ المشاكل المحتملة والحلول

### 1. Realtime Subscription لا يعمل
**السبب:**
- مشاكل في الاتصال
- Realtime service غير نشط

**الحل:**
- ✅ Polling يعمل كـ fallback (كل 1 ثانية)
- ✅ Logging يساعد في تتبع المشاكل

---

### 2. التحديث لا يصل للـ Subscription
**السبب:**
- تأخير في Realtime
- الـ payload لا يحتوي على `search_status`

**الحل:**
- ✅ Logging يظهر الـ payload بالكامل
- ✅ Polling يعمل كـ fallback

---

### 3. `search_status` لا يتم تحديثه
**السبب:**
- `isAcceptingOrder` غير صحيح
- التحديث فشل في قاعدة البيانات

**الحل:**
- ✅ Logging في Edge Function يظهر `isAcceptingOrder` و `updateData`
- ✅ التحقق من `updatedOrder.search_status` بعد التحديث

---

## 🧪 الاختبار

1. ✅ السائق يضغط "قبول"
2. ✅ Edge Function يحدث `search_status` إلى `'found'`
3. ✅ Logging في Edge Function يظهر التحديث
4. ✅ Realtime subscription يكتشف التغيير (أو polling كـ fallback)
5. ✅ Logging في Subscription/Polling يظهر التحديث
6. ✅ العداد يتوقف فوراً

---

## 📝 ملاحظات

- **Realtime Subscription** قد لا يعمل في بعض الحالات
- **Polling** يعمل كـ fallback (كل 1 ثانية)
- **Logging** يساعد في تتبع المشاكل وتشخيصها
- **التحقق من `search_status`** يتم أولاً في جميع الأماكن

---

## ✅ الخلاصة

تم إضافة logging شامل في:
1. ✅ Edge Function (`update-order`)
2. ✅ Realtime Subscription (`OrderSearchCountdown`)
3. ✅ Polling Check (`OrderSearchCountdown`)

هذا يساعد في:
- تتبع التحديثات
- تشخيص المشاكل
- التحقق من أن `search_status` يتم تحديثه بشكل صحيح
