# حل توحيد العداد - الاعتماد على search_expires_at فقط

## 🎯 الهدف

توحيد العداد بين السائق والعميل باستخدام `search_expires_at` كمصدر موحد للحقيقة (Single Source of Truth).

---

## ✅ التغييرات المطبقة

### 1. **إزالة التحديث المحلي للعداد**
```typescript
// قبل:
setTimeRemaining(prev => {
  if (prev !== null && prev > 0) {
    return Math.max(0, prev - 1); // تحديث محلي
  }
  return prev;
});

// بعد:
// لا نحدث العداد محلياً - نعتمد فقط على search_expires_at من قاعدة البيانات
// هذا يضمن التوحيد بين السائق والعميل وتجنب التأخير
```

### 2. **الاعتماد فقط على search_expires_at**
```typescript
// حساب الوقت المتبقي من search_expires_at مباشرة
if (order.search_expires_at) {
  const expiresAt = new Date(order.search_expires_at).getTime();
  const now = Date.now();
  const remaining = Math.max(0, Math.floor((expiresAt - now) / 1000));
  setTimeRemaining(remaining);
  return;
}
```

### 3. **تحديث search_expires_at إذا كان null**
```typescript
// إذا لم يكن search_expires_at موجوداً، نحدثه فوراً من search_started_at
if (order.search_status === 'searching' && order.search_started_at) {
  const calculatedExpiresAt = new Date(startedAt);
  calculatedExpiresAt.setSeconds(calculatedExpiresAt.getSeconds() + searchDuration);
  
  // تحديث search_expires_at في قاعدة البيانات فوراً
  await supabase
    .from('orders')
    .update({ search_expires_at: calculatedExpiresAt.toISOString() })
    .eq('id', orderId);
}
```

### 4. **زيادة frequency الـ polling عند اقتراب انتهاء الوقت**
```typescript
// إذا كان العداد 0 أو قريباً من 0، نزيد من frequency الـ polling
const shouldPollFaster = (currentTimeRemaining !== null && currentTimeRemaining <= 5) && searchStatusRef.current === 'searching';
const currentThrottle = shouldPollFaster ? 1000 : dbCheckThrottle; // 1 ثانية بدلاً من 5 ثوان
```

---

## 📊 الفوائد

### 1. **التوحيد بين السائق والعميل**
- ✅ كلاهما يعتمد على `search_expires_at` من قاعدة البيانات
- ✅ لا يوجد اختلاف في الوقت المعروض
- ✅ لا يوجد تأخير بسبب التحديث المحلي

### 2. **دقة أعلى**
- ✅ `search_expires_at` يتم تحديثه من السيرفر (مصدر موثوق)
- ✅ لا يوجد اختلاف بسبب توقيت الأجهزة المختلفة
- ✅ التزامن الكامل بين جميع الأجهزة

### 3. **سهولة الصيانة**
- ✅ مصدر واحد للحقيقة (Single Source of Truth)
- ✅ لا حاجة لحسابات محلية معقدة
- ✅ منطق أبسط وأسهل للفهم

---

## 🔄 كيف يعمل الآن

### 1. **عند تحميل المكون**
```typescript
// جلب search_expires_at من قاعدة البيانات
const { data } = await supabase
  .from('orders')
  .select('search_expires_at, search_status')
  .eq('id', orderId);

// حساب الوقت المتبقي من search_expires_at
const remaining = Math.floor((expiresAt - now) / 1000);
setTimeRemaining(remaining);
```

### 2. **كل ثانية**
```typescript
// جلب search_expires_at من قاعدة البيانات (مع throttle)
if (now - lastDbCheckRef.current > currentThrottle) {
  const { data } = await supabase
    .from('orders')
    .select('search_expires_at, search_status')
    .eq('id', orderId);
  
  // حساب الوقت المتبقي من search_expires_at
  const remaining = Math.floor((expiresAt - now) / 1000);
  setTimeRemaining(remaining);
}
```

### 3. **عند انتهاء الوقت**
```typescript
// إذا انتهى search_expires_at، نحدث search_status إلى 'stopped'
if (remaining === 0 && search_status === 'searching') {
  await supabase.rpc('check_and_update_expired_search', { p_order_id: orderId });
  // أو تحديث مباشر
  await supabase
    .from('orders')
    .update({ search_status: 'stopped' })
    .eq('id', orderId);
}
```

---

## ⚠️ ملاحظات مهمة

### 1. **إذا كان search_expires_at null**
- يتم تحديثه فوراً من `search_started_at + searchDuration`
- يتم تحديثه في قاعدة البيانات
- بعد التحديث، يتم حساب الوقت من `search_expires_at`

### 2. **Frequency الـ Polling**
- **عادي**: كل 5 ثوان
- **عند اقتراب انتهاء الوقت (≤ 5 ثوان)**: كل ثانية واحدة
- هذا يضمن التحديث السريع عند انتهاء الوقت

### 3. **Realtime Subscription**
- الاشتراك في تحديثات `orders` table
- عند تحديث `search_expires_at` أو `search_status`، يتم التحديث فوراً

---

## ✅ النتيجة النهائية

- ✅ **السائق والعميل يريان نفس الوقت** (من `search_expires_at`)
- ✅ **لا يوجد تأخير** بسبب التحديث المحلي
- ✅ **دقة عالية** لأن `search_expires_at` من السيرفر
- ✅ **سهولة الصيانة** لأن هناك مصدر واحد للحقيقة
