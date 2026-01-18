# مراجعة Edge Functions المرتبطة بالعداد

## ✅ Edge Functions المرتبطة بالعداد

### 1. **`create-order` (Version 12)**
**الحالة:** ✅ نشط ومحدث

**الوظيفة:**
- إنشاء طلب جديد
- تعيين `search_expires_at` عند إنشاء الطلب
- استدعاء `start-order-search` تلقائياً

**الكود:**
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
  // ...
  search_status: status === 'pending' ? 'searching' : null,
  search_started_at: status === 'pending' ? now : null,
  search_expires_at: searchExpiresAt, // ✅ يتم تعيينه
  // ...
};
```

**النتيجة:** ✅ يعمل بشكل صحيح

---

### 2. **`start-order-search` (Version 8)**
**الحالة:** ✅ نشط ومحدث

**الوظيفة:**
- بدء البحث عن السائقين
- تحديث `search_expires_at` عند بدء البحث
- إرسال إشعارات للسائقين

**الكود:**
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

**النتيجة:** ✅ يعمل بشكل صحيح

---

### 3. **`update-order` (Version 5)**
**الحالة:** ✅ نشط ومحدث

**الوظيفة:**
- تحديث الطلب
- تحديث `search_status` إلى `'found'` عند قبول الطلب

**الكود:**
```typescript
// تحديد ما إذا كان هذا قبول طلب جديد
const isAcceptingOrder = status === 'accepted' && driverId && existingOrder?.status === 'pending' && !existingOrder?.driver_id;

// عند قبول الطلب، تحديث search_status إلى 'found' لإيقاف البحث
if (isAcceptingOrder) {
  updateData.search_status = 'found';
  console.log('[update-order] تحديث search_status إلى "found" عند قبول الطلب');
}
```

**النتيجة:** ✅ يعمل بشكل صحيح

---

## 📊 ملخص

| Edge Function | Version | الحالة | search_expires_at | search_status |
|--------------|---------|--------|-------------------|---------------|
| `create-order` | 12 | ✅ نشط | ✅ يتم تعيينه | ✅ يتم تعيينه |
| `start-order-search` | 8 | ✅ نشط | ✅ يتم تحديثه | ✅ يتم تحديثه |
| `update-order` | 5 | ✅ نشط | - | ✅ يتم تحديثه إلى `'found'` |

---

## ✅ الخلاصة

جميع Edge Functions المرتبطة بالعداد تعمل بشكل صحيح:

1. ✅ **`create-order`**: يحدث `search_expires_at` عند إنشاء الطلب
2. ✅ **`start-order-search`**: يحدث `search_expires_at` عند بدء البحث
3. ✅ **`update-order`**: يحدث `search_status` إلى `'found'` عند قبول الطلب

**لا توجد مشاكل في Edge Functions!**
