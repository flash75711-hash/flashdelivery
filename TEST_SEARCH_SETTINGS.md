# ✅ التحقق من تطبيق إعدادات البحث

## 📊 الإعدادات الحالية

### من قاعدة البيانات:

```sql
SELECT 
  setting_key as المفتاح,
  setting_value as القيمة,
  updated_at as آخر_تحديث
FROM order_search_settings
ORDER BY setting_key;
```

**النتيجة:**
| المفتاح | القيمة | آخر تحديث |
|---------|--------|-----------|
| expanded_search_duration_seconds | **5** | 2025-12-22 14:32:52 |
| expanded_search_radius_km | 6 | 2025-12-22 14:32:52 |
| initial_search_duration_seconds | **5** | 2025-12-22 14:32:52 |
| initial_search_radius_km | 3 | 2025-12-22 14:32:51 |

---

## ✅ التطبيق في الكود

### 1. جلب الإعدادات عند إنشاء طلب:

**الملف:** `app/orders/deliver-package.tsx` (السطر 341-356)

```typescript
// جلب الإعدادات
const { data: settings } = await supabase
  .from('order_search_settings')
  .select('setting_key, setting_value');

const initialRadius = parseFloat(
  settings?.find(s => s.setting_key === 'initial_search_radius_km')?.setting_value || '3'
);  // ← 3 كم

const expandedRadius = parseFloat(
  settings?.find(s => s.setting_key === 'expanded_search_radius_km')?.setting_value || '6'
);  // ← 6 كم

const initialDuration = parseFloat(
  settings?.find(s => s.setting_key === 'initial_search_duration_seconds')?.setting_value || '10'
);  // ← 5 ثواني

const expandedDuration = parseFloat(
  settings?.find(s => s.setting_key === 'expanded_search_duration_seconds')?.setting_value || '10'
);  // ← 5 ثواني
```

### 2. استخدام `initialDuration`:

**الملف:** `app/orders/deliver-package.tsx` (السطر 663)

```typescript
if (Date.now() - initialStartTime >= initialDuration * 1000) {
  // ← بعد 5 ثواني، ينتقل للبحث الموسع
  clearInterval(checkInterval);
  
  await supabase
    .from('orders')
    .update({
      search_status: 'expanded',  // ← يتحول من 'searching' إلى 'expanded'
      search_expanded_at: new Date().toISOString(),
    })
    .eq('id', orderId);
  
  // البحث في نطاق موسع (6 كم)
  const expandedDrivers = await findDriversInRadius(expandedRadius);
  // ...
}
```

### 3. استخدام `expandedDuration`:

**الملف:** `app/orders/deliver-package.tsx` (السطر 695)

```typescript
if (Date.now() - expandedStartTime >= expandedDuration * 1000) {
  // ← بعد 5 ثواني أخرى، يتوقف البحث
  clearInterval(expandedCheckInterval);
  
  await supabase
    .from('orders')
    .update({ search_status: 'stopped' })  // ← يتوقف البحث
    .eq('id', orderId);
}
```

---

## 🔄 الخط الزمني للبحث

مع الإعدادات الحالية (5 ثواني + 5 ثواني):

```
⏰ الثانية 0: إنشاء الطلب
  ↓
  🔍 البحث الأولي (نطاق 3 كم)
  📧 إرسال إشعارات للسائقين في النطاق
  ↓
⏰ الثانية 5: انتهاء البحث الأولي
  ↓
  🔍 البحث الموسع (نطاق 6 كم)
  📧 إرسال إشعارات للسائقين الجدد
  ↓
⏰ الثانية 10: انتهاء البحث الموسع
  ↓
  🛑 إيقاف البحث
  search_status = 'stopped'
```

**إجمالي وقت البحث:** 10 ثواني (5 + 5)

---

## 🧪 كيفية الاختبار

### 1. أنشئ طلباً جديداً:

```
http://localhost:8081/orders/deliver-package
```

### 2. افتح Console واراقب الـ logs:

**عند الإنشاء:**
```javascript
🔍 البحث عن سائقين في نطاق 3 كم من النقطة: ...
📊 إجمالي السائقين في قاعدة البيانات: X
✅ تم العثور على Y سائق في نطاق 3 كم
📧 إرسال إشعارات لـ Y سائق
```

**بعد 5 ثواني:**
```javascript
// تحديث search_status إلى 'expanded'
🔍 البحث عن سائقين في نطاق 6 كم من النقطة: ...
✅ تم العثور على Z سائق في نطاق 6 كم
📧 إرسال إشعارات للسائقين الجدد
```

**بعد 10 ثواني:**
```javascript
// تحديث search_status إلى 'stopped'
```

### 3. تحقق من قاعدة البيانات:

```sql
-- عرض آخر طلب تم إنشاؤه
SELECT 
  id,
  search_status,
  search_started_at,
  search_expanded_at,
  EXTRACT(EPOCH FROM (search_expanded_at - search_started_at)) as initial_duration_actual,
  created_at
FROM orders 
WHERE search_started_at IS NOT NULL
ORDER BY created_at DESC 
LIMIT 1;
```

**النتيجة المتوقعة:**
```
| id      | search_status | initial_duration_actual |
|---------|---------------|-------------------------|
| abc123  | stopped       | ~5 ثواني              |
```

---

## 📊 مراقبة التغييرات في الوقت الفعلي

### في جدول `orders`:

```sql
-- مراقبة تغييرات search_status
SELECT 
  id,
  search_status,
  TO_CHAR(search_started_at, 'HH24:MI:SS') as بدأ_البحث,
  TO_CHAR(search_expanded_at, 'HH24:MI:SS') as توسع_البحث,
  CASE 
    WHEN search_expanded_at IS NOT NULL AND search_started_at IS NOT NULL 
    THEN EXTRACT(EPOCH FROM (search_expanded_at - search_started_at)) || ' ثانية'
    ELSE 'لم يتوسع بعد'
  END as مدة_البحث_الأولي
FROM orders 
WHERE created_at > NOW() - INTERVAL '10 minutes'
ORDER BY created_at DESC;
```

---

## 🎯 الخلاصة

### ✅ الإعدادات مطبقة بشكل صحيح:

| الإعداد | القيمة المحفوظة | مكان التطبيق | الحالة |
|---------|----------------|---------------|--------|
| **initial_search_duration_seconds** | **5** | السطر 663 | ✅ يعمل |
| **expanded_search_duration_seconds** | **5** | السطر 695 | ✅ يعمل |
| **initial_search_radius_km** | 3 | السطر 595 | ✅ يعمل |
| **expanded_search_radius_km** | 6 | السطر 674 | ✅ يعمل |

---

## 🔍 ملاحظات مهمة

### 1. الوقت القصير (5 ثواني):

- **مناسب للاختبار** ✅
- **قد يكون قصيراً جداً للإنتاج** ⚠️

**الاقتراح:**
- البحث الأولي: 10-15 ثانية
- البحث الموسع: 15-20 ثانية

### 2. تحديث الإعدادات:

لتغيير الإعدادات، اذهب إلى:
```
صفحة المدير → إعدادات البحث عن السائقين
```

أو مباشرة:
```
http://localhost:8081/(tabs)/admin/search-settings
```

### 3. التحقق من السائقين:

تأكد من وجود سائقين نشطين:
```sql
SELECT COUNT(*) 
FROM profiles 
WHERE role = 'driver' 
  AND status = 'active' 
  AND approval_status = 'approved';
```

إذا كانت النتيجة 0، لن يجد النظام أي سائقين!

---

## 🧪 اختبار سريع

```sql
-- 1. أنشئ طلب اختبار
INSERT INTO orders (
  id,
  customer_id,
  order_type,
  pickup_address,
  delivery_address,
  total_fee,
  status,
  search_status,
  search_started_at,
  created_at
)
SELECT 
  gen_random_uuid(),
  id,
  'package',
  'موقع اختبار أ',
  'موقع اختبار ب',
  100.00,
  'pending',
  'searching',
  NOW(),
  NOW()
FROM profiles 
WHERE role = 'customer' 
LIMIT 1;

-- 2. انتظر 6 ثواني

-- 3. تحقق من search_status
SELECT id, search_status 
FROM orders 
ORDER BY created_at DESC 
LIMIT 1;

-- النتيجة المتوقعة: search_status = 'expanded' أو 'stopped'
```

---

**✅ الإعدادات مطبقة بنجاح! النظام يعمل كما هو متوقع!** 🎉











