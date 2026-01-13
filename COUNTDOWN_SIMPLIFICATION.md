# تبسيط كود العداد - الاحتفاظ بـ search_started_at كـ Fallback

## 🎯 الهدف

تبسيط كود `OrderSearchCountdown` مع الاحتفاظ بـ `search_started_at` كـ fallback فقط في حالة الطوارئ.

---

## ✅ التغييرات المطبقة

### 1. **تبسيط دالة `updateTimeRemaining`**

#### قبل:
- منطق معقد ومتداخل
- logs كثيرة غير ضرورية
- تكرار في الكود

#### بعد:
```typescript
const updateTimeRemaining = (order: any, currentSettings: SearchSettings) => {
  // 1. التحقق من حالة الطلب
  if (order.status && order.status !== 'pending') {
    // إيقاف العداد
    return;
  }

  // 2. تحديث حالة البحث
  const newSearchStatus = order.search_status || null;
  setSearchStatus(newSearchStatus);

  // 3. إذا توقف البحث، لا نعرض العداد
  if (!newSearchStatus || newSearchStatus === 'stopped' || newSearchStatus === 'found') {
    setTimeRemaining(null);
    return;
  }

  // 4. المصدر الأساسي: search_expires_at
  if (order.search_expires_at) {
    const remaining = Math.floor((expiresAt - now) / 1000);
    setTimeRemaining(remaining);
    return;
  }

  // 5. Fallback: حساب من search_started_at
  if (newSearchStatus === 'searching' && order.search_started_at) {
    // تحديث search_expires_at في قاعدة البيانات
    // ثم حساب الوقت من search_expires_at
  }
};
```

### 2. **تبسيط منطق الـ Polling**

#### قبل:
- منطق معقد للتحقق من انتهاء الوقت
- تكرار في استدعاء `check_and_update_expired_search`
- logs كثيرة

#### بعد:
```typescript
intervalRef.current = setInterval(() => {
  // 1. التحقق من حالة الطلب
  if (orderStatusRef.current !== 'pending') {
    // إيقاف العداد
    return;
  }

  // 2. تحديد frequency الـ polling
  const shouldPollFaster = (timeRemaining <= 5) && searchStatus === 'searching';
  const currentThrottle = shouldPollFaster ? 1000 : 5000;

  // 3. جلب البيانات من قاعدة البيانات (مع throttle)
  if (now - lastDbCheckRef.current > currentThrottle) {
    // جلب البيانات وتحديث العداد
    updateTimeRemaining(data, settingsRef.current);
  }
}, 1000);
```

### 3. **إزالة التكرار**

- ✅ إزالة استدعاءات `check_and_update_expired_search` المكررة
- ✅ توحيد منطق تحديث الحالة في `updateTimeRemaining` فقط
- ✅ إزالة logs غير ضرورية

---

## 📊 البنية الجديدة

### **المصدر الأساسي: `search_expires_at`**
```typescript
// حساب الوقت المتبقي مباشرة من search_expires_at
const expiresAt = new Date(order.search_expires_at).getTime();
const now = Date.now();
const remaining = Math.max(0, Math.floor((expiresAt - now) / 1000));
setTimeRemaining(remaining);
```

### **Fallback: `search_started_at`**
```typescript
// فقط إذا كان search_expires_at null
if (!order.search_expires_at && order.search_started_at) {
  // حساب search_expires_at من search_started_at
  const calculatedExpiresAt = new Date(startedAt);
  calculatedExpiresAt.setSeconds(calculatedExpiresAt.getSeconds() + searchDuration);
  
  // تحديث search_expires_at في قاعدة البيانات
  await supabase
    .from('orders')
    .update({ search_expires_at: calculatedExpiresAt.toISOString() });
  
  // ثم حساب الوقت من search_expires_at
}
```

---

## 🔄 تدفق العمل

```
1. تحميل المكون
   ↓
2. جلب search_expires_at من قاعدة البيانات
   ↓
3. حساب الوقت المتبقي من search_expires_at
   ↓
4. تحديث العداد كل ثانية
   ↓
5. إذا انتهى الوقت → تحديث search_status إلى 'stopped'
```

**Fallback (فقط إذا كان search_expires_at null):**
```
1. جلب search_started_at
   ↓
2. حساب search_expires_at = search_started_at + searchDuration
   ↓
3. تحديث search_expires_at في قاعدة البيانات
   ↓
4. العودة إلى التدفق العادي
```

---

## ✅ الفوائد

### 1. **كود أبسط وأسهل للقراءة**
- ✅ منطق واضح ومباشر
- ✅ أقل تعقيداً
- ✅ أسهل للصيانة

### 2. **أداء أفضل**
- ✅ إزالة التكرار
- ✅ تقليل استدعاءات قاعدة البيانات غير الضرورية
- ✅ منطق polling محسّن

### 3. **موثوقية أعلى**
- ✅ `search_expires_at` هو المصدر الوحيد للحقيقة
- ✅ `search_started_at` كـ fallback فقط في حالة الطوارئ
- ✅ توحيد بين السائق والعميل

---

## 📝 ملاحظات

### **متى يُستخدم `search_started_at`؟**
- ✅ فقط إذا كان `search_expires_at` هو `null`
- ✅ كـ fallback في حالة فشل تحديث `search_expires_at`
- ✅ لحساب `search_expires_at` ثم العودة للاعتماد عليه

### **متى لا يُستخدم `search_started_at`؟**
- ❌ لحساب الوقت المتبقي مباشرة (يُستخدم `search_expires_at` فقط)
- ❌ كـ fallback دائم (فقط في حالة الطوارئ)

---

## 🎯 النتيجة النهائية

- ✅ **كود مبسط**: منطق واضح ومباشر
- ✅ **أداء أفضل**: تقليل التكرار والاستدعاءات غير الضرورية
- ✅ **موثوقية أعلى**: `search_expires_at` كمصدر موحد للحقيقة
- ✅ **Fallback آمن**: `search_started_at` كـ backup في حالة الطوارئ
