# 🔍 تقرير فحص الكود: حلقات لا نهائية واستدعاءات API مفرطة

## ⚠️ المشاكل الحرجة (Critical Issues)

### 1. `components/OrderSearchCountdown.tsx` - استدعاءات API مفرطة جداً

**المشكلة:**
- **setInterval كل ثانية** يستدعي `supabase.from('orders').select()` (السطر 291-299)
- **Fast polling كل 500ms** عند وصول العداد إلى 0 (السطر 240-271)
- لا يوجد throttling أو debouncing

**التأثير:**
- إذا كان هناك 10 طلبات نشطة، سيتم إجراء **10 استدعاءات API كل ثانية** = 600 استدعاء/دقيقة
- Fast polling يضيف **2 استدعاءات API كل ثانية** لكل طلب = 120 استدعاء/دقيقة إضافية

**الحل المقترح:**
```typescript
// تقليل التكرار إلى كل 5 ثوان بدلاً من كل ثانية
const interval = setInterval(() => {
  // ... countdown logic ...
  
  // جلب البيانات من قاعدة البيانات كل 5 ثوان فقط
  if (Date.now() - lastDbCheckRef.current > 5000) {
    lastDbCheckRef.current = Date.now();
    supabase.from('orders').select(...).single().then(...);
  }
}, 1000);
```

**الكود الحالي (مشكلة):**
```typescript:116:299:components/OrderSearchCountdown.tsx
const interval = setInterval(() => {
  // ... countdown logic ...
  
  // ❌ هذا يتم كل ثانية - مفرط جداً!
  supabase
    .from('orders')
    .select('search_status, search_started_at, search_expanded_at')
    .eq('id', orderId)
    .single()
    .then(({ data, error }) => {
      // ...
    });
}, 1000);
```

---

## ⚠️ المشاكل المتوسطة (Medium Issues)

### 2. `hooks/useMyOrders.ts` - Polling + Realtime + setTimeout Cascade

**المشكلة:**
- Polling كل 5 ثوان (السطر 262-269)
- Realtime subscription موجود أيضاً
- `setTimeout(() => loadOrders(), 1000)` داخل subscription callback (السطر 202-204, 224-226)
- قد يسبب cascade من الاستدعاءات

**التأثير:**
- إذا حدث UPDATE في Realtime، يتم استدعاء `loadOrders()` بعد ثانية واحدة
- إذا حدث UPDATE آخر خلال هذه الثانية، سيتم استدعاء `loadOrders()` مرة أخرى
- Polling يضيف استدعاءات إضافية كل 5 ثوان

**الحل المقترح:**
```typescript
// استخدام debounce لتجنب الاستدعاءات المتكررة
const debouncedLoadOrders = useMemo(
  () => debounce(() => loadOrders(), 2000),
  [loadOrders]
);

// في subscription callback:
setTimeout(() => {
  debouncedLoadOrders();
}, 1000);
```

**الكود الحالي (مشكلة):**
```typescript:202:226:hooks/useMyOrders.ts
// ❌ قد يسبب cascade من الاستدعاءات
setTimeout(() => {
  loadOrders();
}, 1000);
```

---

### 3. `hooks/useFloatingNotifications.ts` - Polling + Recursive setTimeout

**المشكلة:**
- Polling كل 3 ثوان (السطر 304-383)
- Realtime subscription موجود أيضاً
- Recursive `setTimeout` في `initializeNotifications` (السطر 133-137)
- قد يسبب infinite loop إذا فشل جلب userId

**التأثير:**
- إذا فشل جلب userId، سيتم إعادة المحاولة كل ثانية حتى 5 مرات
- Polling يضيف استدعاءات كل 3 ثوان حتى لو كان Realtime يعمل

**الحل المقترح:**
```typescript
// إيقاف polling إذا كان Realtime يعمل بشكل صحيح
if (notificationsChannel && subscriptionStatus === 'SUBSCRIBED') {
  // لا حاجة للـ polling
  return;
}
```

**الكود الحالي (مشكلة):**
```typescript:133:137:hooks/useFloatingNotifications.ts
// ❌ قد يسبب infinite loop إذا فشل جلب userId
setTimeout(() => {
  if (isMounted) {
    initializeNotifications(); // recursive call
  }
}, 1000);
```

---

### 4. `app/(tabs)/driver/dashboard.tsx` - Multiple Polling Intervals

**المشكلة:**
- `walletCheckInterval` كل 5 ثوان (السطر 164-166)
- `checkApprovalInterval` كل 5 ثوان (السطر 207)
- `loadDriverProfile()` يستدعي `loadWalletBalance()` (السطر 589)
- قد يسبب duplicate calls

**التأثير:**
- إذا كان هناك 5 سائقين نشطين، سيتم إجراء **10 استدعاءات API كل 5 ثوان** = 120 استدعاء/دقيقة
- `loadDriverProfile()` يستدعي `loadWalletBalance()` مما يضاعف الاستدعاءات

**الحل المقترح:**
```typescript
// زيادة الفترة الزمنية للـ polling
const walletCheckInterval = setInterval(() => {
  loadWalletBalance();
}, 30000); // 30 ثانية بدلاً من 5

// إيقاف polling إذا كان Realtime يعمل
if (walletChannel && walletChannelStatus === 'SUBSCRIBED') {
  clearInterval(walletCheckInterval);
}
```

**الكود الحالي (مشكلة):**
```typescript:164:166:app/(tabs)/driver/dashboard.tsx
// ❌ كل 5 ثوان - مفرط جداً
const walletCheckInterval = setInterval(() => {
  loadWalletBalance();
}, 5000);
```

---

### 5. `hooks/useOrderSearch.ts` - Multiple setIntervals

**المشكلة:**
- `intervalRef` كل ثانية للعداد (السطر 231-239, 285-292)
- `checkIntervalRef` كل ثانية للتحقق من قبول الطلب (السطر 242-248, 295-301)
- قد لا يتم cleanup بشكل صحيح

**التأثير:**
- إذا كان هناك 10 طلبات نشطة، سيتم إجراء **20 استدعاءات API كل ثانية** = 1200 استدعاء/دقيقة

**الحل المقترح:**
```typescript
// تقليل تكرار التحقق من قبول الطلب
checkIntervalRef.current = setInterval(async () => {
  const accepted = await checkOrderAccepted();
  if (accepted) {
    clearInterval(intervalRef.current!);
    clearInterval(checkIntervalRef.current!);
  }
}, 5000); // كل 5 ثوان بدلاً من كل ثانية
```

---

## ✅ التوصيات العامة

### 1. استخدام Throttling/Debouncing
```typescript
// مثال على throttling
const throttledFetch = useMemo(
  () => throttle((orderId: string) => {
    supabase.from('orders').select(...).eq('id', orderId).single();
  }, 5000), // مرة كل 5 ثوان كحد أقصى
  []
);
```

### 2. تقليل تكرار Polling
- **OrderSearchCountdown**: من كل ثانية إلى كل 5 ثوان
- **useMyOrders**: من كل 5 ثوان إلى كل 30 ثانية
- **useFloatingNotifications**: من كل 3 ثوان إلى كل 10 ثوان
- **driver/dashboard**: من كل 5 ثوان إلى كل 30 ثانية

### 3. إيقاف Polling عند وجود Realtime
```typescript
if (subscription && subscriptionStatus === 'SUBSCRIBED') {
  // لا حاجة للـ polling
  clearInterval(pollingInterval);
}
```

### 4. استخدام Refs لتجنب Re-renders
```typescript
const lastFetchTimeRef = useRef(0);
const fetchThrottle = 5000; // 5 ثوان

if (Date.now() - lastFetchTimeRef.current > fetchThrottle) {
  lastFetchTimeRef.current = Date.now();
  // إجراء fetch
}
```

### 5. Cleanup صحيح للـ Intervals
```typescript
useEffect(() => {
  const interval = setInterval(() => {
    // ...
  }, 1000);

  return () => {
    clearInterval(interval); // ✅ مهم جداً
  };
}, [dependencies]);
```

---

## 📊 إحصائيات الاستدعاءات المحتملة

### السيناريو الحالي (مع 10 طلبات نشطة):
- **OrderSearchCountdown**: 10 × 60 = **600 استدعاء/دقيقة**
- **Fast Polling**: 10 × 120 = **1,200 استدعاء/دقيقة**
- **useMyOrders**: 1 × 12 = **12 استدعاء/دقيقة**
- **useFloatingNotifications**: 1 × 20 = **20 استدعاء/دقيقة**
- **driver/dashboard**: 5 × 12 = **60 استدعاء/دقيقة**

**الإجمالي: ~1,892 استدعاء API/دقيقة** ⚠️

### بعد التحسينات المقترحة:
- **OrderSearchCountdown**: 10 × 12 = **120 استدعاء/دقيقة** (تقليل 80%)
- **Fast Polling**: 10 × 6 = **60 استدعاء/دقيقة** (تقليل 95%)
- **useMyOrders**: 1 × 2 = **2 استدعاء/دقيقة** (تقليل 83%)
- **useFloatingNotifications**: 1 × 6 = **6 استدعاء/دقيقة** (تقليل 70%)
- **driver/dashboard**: 5 × 2 = **10 استدعاء/دقيقة** (تقليل 83%)

**الإجمالي: ~198 استدعاء API/دقيقة** ✅ (تقليل 90%)

---

## 🎯 الأولويات

1. **عاجل**: إصلاح `OrderSearchCountdown.tsx` - أكبر مصدر للاستدعاءات المفرطة
2. **مهم**: إصلاح `useMyOrders.ts` - cascade من الاستدعاءات
3. **مهم**: إصلاح `driver/dashboard.tsx` - multiple polling intervals
4. **متوسط**: إصلاح `useFloatingNotifications.ts` - recursive setTimeout
5. **متوسط**: إصلاح `useOrderSearch.ts` - multiple setIntervals
