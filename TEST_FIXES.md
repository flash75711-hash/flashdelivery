# 🧪 دليل اختبار الإصلاحات

## ✅ الإصلاحات المطبقة

### 1. Push Notifications
- ✅ إضافة logging مفصل لتتبع إرسال push notifications
- ✅ تسجيل عدد الإشعارات المرسلة بنجاح
- ✅ تسجيل المسافة لكل سائق

### 2. البحث عن سائقين بعيدين
- ✅ إضافة validation للتأكد من أن جميع السائقين ضمن النطاق المحدد (≤ 10 كم)
- ✅ تصفية السائقين الذين يتجاوزون الحد الأقصى قبل إرسال الإشعارات
- ✅ تسجيل تحذيرات للسائقين الذين يتجاوزون النطاق

### 3. إزالة delivery_address من البحث
- ✅ إزالة `delivery_address` تماماً من البحث
- ✅ الاعتماد فقط على:
  - `pickup_address` (نقطة الاستلام/الانطلاق)
  - `items[0].address` (الأماكن التي سيشتري منها السائق الأشياء)

---

## 🧪 خطوات الاختبار

### 1. اختبار Push Notifications

#### الخطوات:
1. افتح Supabase Dashboard → Edge Functions → Logs
2. أنشئ طلب جديد من التطبيق
3. راقب Logs في `start-order-search` و `expand-order-search`

#### ما يجب أن تراه في Logs:
```
[start-order-search] 📤 Attempting to send push notification to driver {driver_id}...
[start-order-search] Push notification response for driver {driver_id}: {
  status: 200,
  ok: true,
  sent: 1,
  result: {...}
}
✅ [start-order-search] Push notification sent successfully to driver {driver_id}
```

#### التحقق:
- ✅ يجب أن ترى `sent: 1` في الرد
- ✅ يجب أن ترى `✅ Push notification sent successfully`
- ✅ يجب أن ترى `📊 Summary: X drivers notified, Y push notifications sent`

---

### 2. اختبار البحث عن سائقين بعيدين

#### الخطوات:
1. تأكد من وجود سائقين في قاعدة البيانات:
   - بعضهم قريب (< 10 كم)
   - بعضهم بعيد (> 10 كم)
2. أنشئ طلب جديد
3. راقب Logs في `start-order-search` و `expand-order-search`

#### ما يجب أن تراه في Logs:
```
[start-order-search] ✅ Found 5 drivers, 3 within 5 km radius
[start-order-search] ⚠️ Driver {driver_id} is 12.45 km away (exceeds 5 km limit)
```

#### التحقق:
- ✅ يجب أن ترى تحذيرات للسائقين البعيدين (> 10 كم)
- ✅ يجب أن ترى `X drivers, Y within Z km radius`
- ✅ يجب أن يتم إرسال إشعارات فقط للسائقين القريبين

---

### 3. اختبار إزالة delivery_address من البحث

#### الخطوات:
1. أنشئ طلب جديد من نوع `outside` أو `package`
2. راقب Logs في `create-order` و `expand-order-search`

#### ما يجب أن تراه في Logs:

**لطلبات `outside`:**
```
[create-order] Order type is 'outside', checking items...
[create-order] 📍 Using farthest item address for search point: {address}
[create-order] ✅ Using farthest point for search: {address} -> (lat, lon)
```

**لطلبات `package`:**
```
[create-order] Order type is 'package', using pickup address for search point: {address}
[create-order] ✅ Using pickup address for search: {address} -> (lat, lon)
```

#### التحقق:
- ✅ يجب أن ترى استخدام `items[0].address` أو `pickup_address` فقط
- ✅ **يجب ألا ترى** استخدام `delivery_address` أبداً
- ✅ يجب أن ترى `⚠️ Falling back to pickup_address` إذا فشل geocoding للـ items

---

## 📊 SQL Queries للتحقق

### 1. التحقق من السائقين في نطاق معين:
```sql
-- استبدل LAT و LON و RADIUS_KM بالقيم المطلوبة
SELECT * FROM find_drivers_in_radius(
  24.7136,  -- LAT
  46.6753,  -- LON
  10.0      -- RADIUS_KM (10 كيلو)
);
```

### 2. التحقق من FCM Tokens:
```sql
SELECT 
  id,
  email,
  fcm_token IS NOT NULL AS has_fcm_token,
  CASE 
    WHEN fcm_token IS NULL THEN '❌ No FCM Token'
    WHEN LENGTH(fcm_token) < 10 THEN '⚠️ Invalid FCM Token'
    ELSE '✅ Valid FCM Token'
  END AS fcm_status
FROM profiles
WHERE role = 'driver' 
  AND status = 'active'
  AND approval_status = 'approved';
```

### 3. التحقق من آخر طلب تم إنشاؤه:
```sql
SELECT 
  id,
  order_type,
  pickup_address,
  delivery_address,
  items,
  search_status,
  search_started_at,
  search_expanded_at
FROM orders
ORDER BY created_at DESC
LIMIT 1;
```

---

## 🔍 مراقبة Logs في Supabase

### 1. Edge Function Logs:
1. اذهب إلى Supabase Dashboard
2. Edge Functions → اختر Function (مثلاً `start-order-search`)
3. اضغط على "Logs"
4. ابحث عن:
   - `📤 Attempting to send push notification`
   - `✅ Push notification sent successfully`
   - `⚠️ Driver ... is ... km away (exceeds ... km limit)`
   - `📊 Summary:`

### 2. Real-time Logs:
- يمكنك استخدام Supabase CLI:
```bash
supabase functions logs start-order-search --follow
supabase functions logs expand-order-search --follow
```

---

## ✅ Checklist للاختبار

- [ ] Push notifications تُرسل بنجاح (تحقق من Logs)
- [ ] السائقين البعيدين (> 10 كم) لا يتلقون إشعارات
- [ ] البحث يعتمد فقط على `pickup_address` و `items[].address`
- [ ] لا يتم استخدام `delivery_address` في البحث
- [ ] الإشعارات داخل التطبيق تعمل بشكل صحيح
- [ ] الانتقال من 5 كم إلى 10 كم يعمل بشكل صحيح

---

## 🐛 إذا واجهت مشاكل

### Push Notifications لا تُرسل:
1. تحقق من FCM Tokens في قاعدة البيانات
2. تحقق من `FCM_SERVICE_ACCOUNT_JSON` في Supabase Secrets
3. راجع Logs في `send-push-notification` Edge Function

### السائقين البعيدين يتلقون إشعارات:
1. تحقق من Logs - يجب أن ترى تحذيرات
2. تحقق من RPC function `find_drivers_in_radius`
3. تأكد من أن المسافة محسوبة بشكل صحيح

### delivery_address لا يزال يُستخدم:
1. تحقق من Logs في `create-order` و `expand-order-search`
2. تأكد من أن الكود المحدث تم رفعه إلى Supabase
3. تحقق من Git commits

---

## 📝 ملاحظات

- جميع Edge Functions تم رفعها بنجاح:
  - `start-order-search` - Version 7
  - `expand-order-search` - Version 6
  - `create-order` - Version 10

- الكود محدث في Git:
  - Commit: `31ea646` - Fix: إصلاح مشكلة في expand-order-search
  - Commit: `4fa9ea6` - Fix: إصلاح 3 مشاكل

---

**تاريخ الإنشاء:** $(date)
**آخر تحديث:** $(date)
