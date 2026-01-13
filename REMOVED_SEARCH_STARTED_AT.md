# إزالة search_started_at - الاعتماد فقط على search_expires_at

## 🎯 الهدف

إزالة جميع استخدامات `search_started_at` والاعتماد فقط على `search_expires_at` كمصدر موحد للحقيقة.

---

## ✅ التغييرات المطبقة

### 1. **إزالة `search_started_at` من Queries**

#### قبل:
```typescript
.select('search_status, search_started_at, search_expires_at, status')
```

#### بعد:
```typescript
.select('search_status, search_expires_at, status')
```

### 2. **إزالة `search_started_at` من Logs**

#### قبل:
```typescript
console.log(`[OrderSearchCountdown] Order ${orderId} status:`, {
  search_status: data.search_status,
  status: data.status,
  search_started_at: data.search_started_at,
  search_expires_at: data.search_expires_at,
});
```

#### بعد:
```typescript
console.log(`[OrderSearchCountdown] Order ${orderId} status:`, {
  search_status: data.search_status,
  status: data.status,
  search_expires_at: data.search_expires_at,
});
```

### 3. **إزالة Fallback الذي يعتمد على `search_started_at`**

#### قبل:
```typescript
// Fallback: إذا كان search_expires_at null، نحسبه من search_started_at
if (newSearchStatus === 'searching' && order.search_started_at) {
  const startedAt = new Date(order.search_started_at).getTime();
  const calculatedExpiresAt = new Date(startedAt);
  calculatedExpiresAt.setSeconds(calculatedExpiresAt.getSeconds() + searchDuration);
  // تحديث search_expires_at...
}
```

#### بعد:
```typescript
// إذا لم يكن search_expires_at موجوداً، لا نعرض عداد
// (يجب أن يتم تحديث search_expires_at من start-order-search Edge Function)
setTimeRemaining(null);
```

---

## 📊 البنية الجديدة

### **المصدر الوحيد: `search_expires_at`**
```typescript
if (order.search_expires_at) {
  const expiresAt = new Date(order.search_expires_at).getTime();
  const now = Date.now();
  const remaining = Math.max(0, Math.floor((expiresAt - now) / 1000));
  setTimeRemaining(remaining);
  return;
}

// إذا لم يكن search_expires_at موجوداً، لا نعرض عداد
setTimeRemaining(null);
```

---

## 🔄 تدفق العمل

```
1. تحميل المكون
   ↓
2. جلب search_expires_at من قاعدة البيانات
   ↓
3. إذا كان search_expires_at موجوداً:
   - حساب الوقت المتبقي
   - تحديث العداد
   ↓
4. إذا لم يكن search_expires_at موجوداً:
   - لا نعرض عداد
   - (يجب أن يتم تحديثه من start-order-search Edge Function)
```

---

## ⚠️ ملاحظات مهمة

### **1. يجب أن تحدث `start-order-search` Edge Function `search_expires_at` دائماً**

```typescript
// في start-order-search/index.ts
const searchExpiresAt = new Date(searchStartedAt);
searchExpiresAt.setSeconds(searchExpiresAt.getSeconds() + searchDuration);
updateData.search_expires_at = searchExpiresAt.toISOString();
```

### **2. لا يوجد Fallback**

- ❌ لا يوجد fallback من `search_started_at`
- ✅ إذا كان `search_expires_at` null، لا نعرض عداد
- ✅ يجب أن يتم تحديث `search_expires_at` من السيرفر

### **3. التوحيد الكامل**

- ✅ السائق والعميل يعتمدان على `search_expires_at` فقط
- ✅ لا يوجد اختلاف في الوقت المعروض
- ✅ مصدر واحد للحقيقة (Single Source of Truth)

---

## ✅ الفوائد

### 1. **كود أبسط**
- ✅ إزالة جميع استخدامات `search_started_at`
- ✅ منطق واضح ومباشر
- ✅ لا يوجد fallback معقد

### 2. **موثوقية أعلى**
- ✅ `search_expires_at` هو المصدر الوحيد للحقيقة
- ✅ لا يوجد اعتماد على `search_started_at`
- ✅ توحيد كامل بين السائق والعميل

### 3. **سهولة الصيانة**
- ✅ كود أبسط وأسهل للفهم
- ✅ أقل تعقيداً
- ✅ أسهل للصيانة والتطوير

---

## 🎯 النتيجة النهائية

- ✅ **إزالة كاملة**: لا يوجد أي استخدام لـ `search_started_at` في `OrderSearchCountdown.tsx`
- ✅ **مصدر واحد**: `search_expires_at` هو المصدر الوحيد للحقيقة
- ✅ **توحيد كامل**: السائق والعميل يعتمدان على نفس المصدر
- ✅ **كود أبسط**: منطق واضح ومباشر بدون fallback معقد
