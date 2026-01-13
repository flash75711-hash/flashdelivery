# إصلاح Edge Functions المرتبطة بالعداد

## 🔍 المشكلة

العداد لا يظهر ومكتوب "جاري حساب الوقت المتبقي..." - هذا يعني أن `search_expires_at` غير موجود في قاعدة البيانات.

---

## ✅ الإصلاحات المطبقة

### 1. **إصلاح `create-order` Edge Function**

#### المشكلة:
- عند إنشاء الطلب، يتم تعيين `search_status: 'searching'` و `search_started_at`
- لكن **لا يتم تعيين `search_expires_at`**
- بعد ذلك، يتم استدعاء `start-order-search`، لكن إذا فشلت أو لم يتم استدعاؤها، فلن يكون هناك `search_expires_at`

#### الحل:
```typescript
// جلب إعدادات البحث لحساب search_expires_at
let searchExpiresAt: string | null = null;
if (status === 'pending') {
  const { data: settings } = await supabase
    .from('order_search_settings')
    .select('setting_key, setting_value');
  
  const searchDuration = parseFloat(
    settings?.find(s => s.setting_key === 'search_duration_seconds')?.setting_value || 
    settings?.find(s => s.setting_key === 'initial_search_duration_seconds')?.setting_value || 
    '60'
  );
  
  // حساب search_expires_at = search_started_at + searchDuration
  const expiresDate = new Date(now);
  expiresDate.setSeconds(expiresDate.getSeconds() + searchDuration);
  searchExpiresAt = expiresDate.toISOString();
  
  console.log(`[create-order] Setting search_expires_at: ${searchExpiresAt} (${searchDuration}s from start)`);
}

const orderData: any = {
  // ... other fields
  search_status: status === 'pending' ? 'searching' : null,
  search_started_at: status === 'pending' ? now : null,
  search_expires_at: searchExpiresAt, // ✅ الآن يتم تعيينه عند إنشاء الطلب
  search_expanded_at: null,
};
```

---

### 2. **التحقق من `start-order-search` Edge Function**

#### الوضع الحالي:
- ✅ `start-order-search` تحدث `search_expires_at` بشكل صحيح
- ✅ يتم حساب `search_expires_at = search_started_at + searchDuration`
- ✅ يتم تحديثه في قاعدة البيانات

#### الكود:
```typescript
// تحديد search_expires_at بناءً على search_started_at + searchDuration
const searchExpiresAt = new Date(searchStartedAt);
searchExpiresAt.setSeconds(searchExpiresAt.getSeconds() + searchDuration);
updateData.search_expires_at = searchExpiresAt.toISOString();
console.log(`[start-order-search] Setting search_expires_at for order ${order_id}: ${searchExpiresAt.toISOString()} (${searchDuration}s from start)`);

await supabase
  .from('orders')
  .update(updateData)
  .eq('id', order_id);
```

---

## 📊 تدفق العمل الجديد

### **1. عند إنشاء الطلب (`create-order`):**
```
1. إنشاء الطلب مع search_expires_at ✅
   ↓
2. استدعاء start-order-search
   ↓
3. start-order-search تحدث search_expires_at (إذا تغير)
```

### **2. إذا فشل `start-order-search`:**
- ✅ `search_expires_at` موجود بالفعل من `create-order`
- ✅ العداد يعمل بشكل صحيح

### **3. إذا نجح `start-order-search`:**
- ✅ `search_expires_at` يتم تحديثه بشكل صحيح
- ✅ العداد يعمل بشكل صحيح

---

## ✅ النتيجة

- ✅ **`search_expires_at` موجود دائماً**: يتم تعيينه عند إنشاء الطلب
- ✅ **Fallback آمن**: حتى إذا فشل `start-order-search`، العداد يعمل
- ✅ **توحيد كامل**: `search_expires_at` هو المصدر الوحيد للحقيقة
- ✅ **لا توجد رسالة "جاري حساب الوقت المتبقي..."**: لأن `search_expires_at` موجود دائماً

---

## 🔄 الخطوات التالية

1. **إعادة نشر Edge Functions:**
   ```bash
   # نشر create-order
   supabase functions deploy create-order
   ```

2. **اختبار إنشاء طلب جديد:**
   - التحقق من أن `search_expires_at` موجود في قاعدة البيانات
   - التحقق من أن العداد يعرض الوقت المتبقي مباشرة

3. **التحقق من Logs:**
   - التحقق من logs `create-order` للتأكد من تعيين `search_expires_at`
   - التحقق من logs `start-order-search` للتأكد من تحديث `search_expires_at`
