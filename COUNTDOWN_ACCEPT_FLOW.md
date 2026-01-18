# تدفق العمل عند قبول السائق للطلب (العداد عند 15 ثانية)

## 📋 السيناريو: السائق يضغط "قبول" والعداد عند 15 ثانية

---

## 🔄 التدفق الكامل

### **1️⃣ السائق يضغط "قبول"**
**الموقع:** `app/(tabs)/driver/trips.tsx` → `handleAcceptOrder()`

```typescript
// السائق يضغط "قبول"
handleAcceptOrder(order) {
  // التحقق من الطلب
  // استدعاء update-order Edge Function
  supabase.functions.invoke('update-order', {
    body: {
      orderId: order.id,
      status: 'accepted',
      driverId: user.id,
    },
  });
}
```

**الوقت:** `T = 0ms` (العداد عند 15 ثانية)

---

### **2️⃣ Edge Function `update-order` يتم استدعاؤه**
**الموقع:** `supabase/functions/update-order/index.ts`

```typescript
// تحديد ما إذا كان هذا قبول طلب جديد
const isAcceptingOrder = status === 'accepted' && driverId && existingOrder?.status === 'pending' && !existingOrder?.driver_id;

// عند قبول الطلب، تحديث search_status إلى 'found' لإيقاف البحث
if (isAcceptingOrder) {
  updateData.search_status = 'found';
  updateData.status = 'accepted';
  updateData.driver_id = driverId;
  console.log('[update-order] تحديث search_status إلى "found" عند قبول الطلب');
}

// تحديث قاعدة البيانات
await supabase
  .from('orders')
  .update(updateData)
  .eq('id', orderId);
```

**التحديثات في قاعدة البيانات:**
- ✅ `status` → `'accepted'`
- ✅ `driver_id` → `driverId`
- ✅ `search_status` → `'found'`

**الوقت:** `T = 100-500ms` (زمن استدعاء Edge Function)

---

### **3️⃣ Realtime Subscription يكتشف التغيير**
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
    
    // التحقق من حالة الطلب أولاً
    if (order.status !== 'pending') {
      // ✅ هذا يكتشف التغيير فوراً!
      console.log(`[OrderSearchCountdown] Order ${orderId} status changed to ${order.status}, stopping countdown`);
      setTimeRemaining(null);
      setSearchStatus(null);
      searchStatusRef.current = null;
      searchExpiresAtRef.current = null;
      orderStatusRef.current = order.status;
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
      return; // ✅ إيقاف العداد فوراً
    }
    
    // التحقق من search_status فوراً
    if (order.search_status === 'found' || order.search_status === 'stopped') {
      // ✅ هذا أيضاً يكتشف التغيير فوراً!
      console.log(`[OrderSearchCountdown] Order ${orderId} search_status changed to ${order.search_status}, stopping countdown immediately`);
      setTimeRemaining(null);
      setSearchStatus(order.search_status);
      searchStatusRef.current = order.search_status;
      // إيقاف interval فوراً
      return;
    }
  });
```

**الوقت:** `T = 200-1000ms` (زمن وصول Realtime event)

---

### **4️⃣ Interval Check (كل ثانية)**
**الموقع:** `components/OrderSearchCountdown.tsx` → `intervalRef`

```typescript
intervalRef.current = setInterval(() => {
  // التحقق الفوري من search_status
  if (searchStatusRef.current === 'found' || searchStatusRef.current === 'stopped') {
    setTimeRemaining(null);
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
    return; // ✅ إيقاف العداد فوراً
  }
  
  // تحديث العداد من search_expires_at
  if (searchExpiresAtRef.current && searchStatusRef.current === 'searching') {
    const expiresAt = new Date(searchExpiresAtRef.current).getTime();
    const now = Date.now();
    const remaining = Math.max(0, Math.floor((expiresAt - now) / 1000));
    setTimeRemaining(remaining);
  }
}, 1000);
```

**الوقت:** `T = 0-1000ms` (في الدورة التالية من interval)

---

### **5️⃣ Polling Check (كل 2 ثوان)**
**الموقع:** `components/OrderSearchCountdown.tsx` → `intervalRef` → polling

```typescript
// جلب البيانات من قاعدة البيانات (مع throttle)
if (now - lastDbCheckRef.current > currentThrottle) {
  lastDbCheckRef.current = now;
  
  supabase
    .from('orders')
    .select('search_status, search_expires_at, status')
    .eq('id', orderId)
    .maybeSingle()
    .then(({ data }) => {
      // التحقق الفوري من search_status
      if (data.search_status === 'found' || data.search_status === 'stopped') {
        console.log(`[OrderSearchCountdown] Order ${orderId} search_status is ${data.search_status}, stopping countdown immediately`);
        setTimeRemaining(null);
        setSearchStatus(data.search_status);
        // إيقاف interval فوراً
        return;
      }
    });
}
```

**الوقت:** `T = 0-2000ms` (في الدورة التالية من polling)

---

## ⏱️ الجدول الزمني

| الوقت | الحدث | النتيجة |
|------|--------|---------|
| `T = 0ms` | السائق يضغط "قبول" | `handleAcceptOrder()` يتم استدعاؤه |
| `T = 100-500ms` | `update-order` Edge Function | تحديث قاعدة البيانات: `status='accepted'`, `search_status='found'` |
| `T = 200-1000ms` | Realtime Subscription | ✅ يكتشف التغيير فوراً → إيقاف العداد |
| `T = 0-1000ms` | Interval Check | ✅ يكتشف `search_status='found'` → إيقاف العداد |
| `T = 0-2000ms` | Polling Check | ✅ يكتشف `search_status='found'` → إيقاف العداد |

---

## ✅ النتيجة المتوقعة

**في أفضل حالة (Realtime Subscription يعمل فوراً):**
- ⏱️ **الوقت:** `200-1000ms` بعد قبول الطلب
- ✅ **العداد:** يتوقف فوراً (بدون انتظار حتى يصل إلى 0)

**في حالة تأخير Realtime:**
- ⏱️ **الوقت:** `0-2000ms` بعد قبول الطلب (من Polling)
- ✅ **العداد:** يتوقف خلال ثانيتين كحد أقصى

---

## ⚠️ المشاكل المحتملة

### **1. Realtime Subscription لا يعمل**
- **السبب:** مشاكل في الاتصال أو Realtime service
- **الحل:** Polling يعمل كـ fallback (كل 2 ثوان)

### **2. التحديث لا يصل بسرعة**
- **السبب:** تأخير في قاعدة البيانات أو Realtime
- **الحل:** تم تقليل throttle من 5 ثوان إلى 2 ثوان

### **3. Interval لا يكتشف التغيير**
- **السبب:** `searchStatusRef.current` لم يتم تحديثه بعد
- **الحل:** تم إضافة تحقق فوري في interval و polling

---

## 🎯 الخلاصة

**عند قبول السائق للطلب (العداد عند 15 ثانية):**

1. ✅ **Edge Function** يحدث `search_status` إلى `'found'` فوراً
2. ✅ **Realtime Subscription** يكتشف التغيير خلال `200-1000ms`
3. ✅ **Interval Check** يكتشف التغيير خلال `0-1000ms`
4. ✅ **Polling Check** يكتشف التغيير خلال `0-2000ms`

**العداد يجب أن يتوقف خلال 2 ثانية كحد أقصى!**
