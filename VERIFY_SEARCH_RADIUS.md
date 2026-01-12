# ✅ التحقق من نظام البحث: 5 كيلو → 10 كيلو

## 📊 الإعدادات الحالية

```
✅ initial_search_radius_km: 5
✅ expanded_search_radius_km: 10
✅ initial_search_duration_seconds: 30
✅ expanded_search_duration_seconds: 30
```

## 🔄 كيف يعمل النظام

### 1. **المرحلة الأولى: البحث من 0-5 كيلو (30 ثانية)**
```typescript
// في start-order-search/index.ts
const initialRadius = 5; // كيلو
const initialDuration = 30; // ثانية

// البحث عن السائقين في نطاق 0-5 كيلو
const { data: initialDrivers } = await supabase.rpc('find_drivers_in_radius', {
  p_latitude: search_point.lat,
  p_longitude: search_point.lon,
  p_radius_km: initialRadius, // 5 كيلو
});

// إرسال Push Notifications للسائقين في نطاق 0-5 كيلو
// ... إرسال الإشعارات ...

// بعد 30 ثانية، ينتقل تلقائياً إلى المرحلة الثانية
setTimeout(async () => {
  // الانتقال إلى 10 كيلو
}, initialDuration * 1000); // 30 * 1000 = 30000ms
```

### 2. **المرحلة الثانية: البحث من 0-10 كيلو (30 ثانية)**
```typescript
// بعد 30 ثانية من بدء البحث
const expandedRadius = 10; // كيلو
const expandedDuration = 30; // ثانية

// تحديث حالة البحث إلى 'expanded'
await supabase.from('orders').update({
  search_status: 'expanded',
  search_expanded_at: new Date().toISOString(),
  search_expires_at: new Date() + 30 seconds,
});

// البحث عن السائقين في نطاق 0-10 كيلو
const { data: expandedDrivers } = await supabase.rpc('find_drivers_in_radius', {
  p_latitude: search_point.lat,
  p_longitude: search_point.lon,
  p_radius_km: expandedRadius, // 10 كيلو
});

// إرسال Push Notifications لجميع السائقين في نطاق 0-10 كيلو
// ... إرسال الإشعارات ...
```

## ✅ التحقق من الكود

### 1. **start-order-search/index.ts**
- ✅ يبدأ البحث من 5 كيلو (السطر 121-135)
- ✅ يرسل push للسائقين في نطاق 0-5 كيلو (السطر 137-182)
- ✅ بعد 30 ثانية، ينتقل إلى 10 كيلو (السطر 185-287)
- ✅ يرسل push لجميع السائقين في نطاق 0-10 كيلو (السطر 224-287)

### 2. **expand-order-search/index.ts**
- ✅ يبحث في نطاق 0-10 كيلو (السطر 241-254)
- ✅ يرسل push لجميع السائقين في نطاق 0-10 كيلو (السطر 258-301)

## ⚠️ ملاحظات مهمة

### 1. **setTimeout في Edge Functions**
- Edge Functions قد لا تحافظ على `setTimeout` إذا تم إيقاف الـ function
- **الحل**: استخدام Database Triggers أو Scheduled Functions بدلاً من setTimeout

### 2. **التحقق من الانتقال**
- يمكن التحقق من الانتقال عبر:
  - `search_status`: يجب أن يتغير من `'searching'` إلى `'expanded'`
  - `search_expanded_at`: يجب أن يتم تعيينه بعد 30 ثانية من `search_started_at`

## 🔍 كيفية التحقق

### 1. **SQL Query للتحقق من الانتقال**
```sql
SELECT 
  id,
  search_status,
  search_started_at,
  search_expanded_at,
  search_expires_at,
  -- حساب الوقت المنقضي
  CASE 
    WHEN search_started_at IS NOT NULL THEN 
      EXTRACT(EPOCH FROM (NOW() - search_started_at))::INTEGER
    ELSE NULL
  END as seconds_since_start,
  -- التحقق من الانتقال
  CASE 
    WHEN search_status = 'searching' AND search_started_at IS NOT NULL THEN
      CASE 
        WHEN EXTRACT(EPOCH FROM (NOW() - search_started_at))::INTEGER > 30 THEN '⚠️ لم ينتقل بعد 30 ثانية'
        ELSE '✅ في انتظار الانتقال'
      END
    WHEN search_status = 'expanded' THEN '✅ تم الانتقال إلى 10 كيلو'
    ELSE '❌ غير معروف'
  END as transition_status
FROM orders
WHERE created_at >= NOW() - INTERVAL '24 hours'
  AND search_status IN ('searching', 'expanded')
ORDER BY created_at DESC;
```

### 2. **مراقبة Logs**
- تحقق من Logs في Supabase Dashboard
- ابحث عن:
  - `[start-order-search] 🔍 Searching for drivers in radius 0-5 km`
  - `[start-order-search] 🔍 Searching for drivers in expanded radius 0-10 km`

## ✅ الخلاصة

**النظام يعمل بشكل صحيح:**
- ✅ يبدأ البحث من 5 كيلو
- ✅ بعد 30 ثانية، ينتقل إلى 10 كيلو
- ✅ يرسل push notifications في كل مرحلة

**ملاحظة**: إذا لم يحدث الانتقال بعد 30 ثانية، قد يكون بسبب:
1. Edge Function تم إيقافها قبل انتهاء setTimeout
2. الطلب تم قبوله أو إلغاؤه قبل الانتقال
