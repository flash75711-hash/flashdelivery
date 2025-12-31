# إصلاح مشكلة RLS لتحديث موقع السائق

## المشكلة
بعد إكمال السائق للتسجيل، كان النظام يحاول تحديث موقع السائق في جدول `driver_locations`، لكن العملية كانت تفشل مع الخطأ:
```
POST https://tnwrmybyvimlsamnputn.supabase.co/rest/v1/driver_locations 401 (Unauthorized)
new row violates row-level security policy for table "driver_locations"
```

## السبب
- سياسة RLS على جدول `driver_locations` تستخدم `auth.uid()` للتحقق من هوية السائق
- في نظام المصادقة بالـ PIN، لا يتم إنشاء جلسة Supabase تلقائياً
- لذلك `auth.uid()` يعيد `null`، وتفشل سياسة RLS

## الحل
تم إنشاء Edge Function جديد `update-driver-location` يستخدم Service Role Key لتجاوز RLS وتحديث موقع السائق.

### الملفات المعدلة:

1. **`supabase/functions/update-driver-location/index.ts`** (جديد)
   - Edge Function لتحديث موقع السائق
   - يستخدم Service Role Key لتجاوز RLS
   - يدعم إضافة موقع جديد أو تحديث موقع موجود
   - يدعم `orderId` (للمواقع المرتبطة بطلب) أو `null` (للمواقع العامة)

2. **`app/(tabs)/driver/dashboard.tsx`**
   - تم تحديث `updateDriverLocationInDB` لاستخدام Edge Function بدلاً من الوصول المباشر للقاعدة
   - يحل مشكلة RLS عند تحديث موقع السائق عند تفعيل "متاح"

3. **`app/(tabs)/driver/trips.tsx`**
   - تم تحديث `startLocationTracking` لاستخدام Edge Function
   - يحل مشكلة RLS عند تتبع موقع السائق أثناء تنفيذ الطلب

## كيفية الاستخدام

### من Dashboard (عند تفعيل "متاح"):
```typescript
await supabase.functions.invoke('update-driver-location', {
  body: {
    driverId: user.id,
    latitude: location.lat,
    longitude: location.lon,
    orderId: null, // بدون طلب نشط
  },
});
```

### من Trips (أثناء تنفيذ طلب):
```typescript
await supabase.functions.invoke('update-driver-location', {
  body: {
    driverId: user.id,
    latitude: location.latitude,
    longitude: location.longitude,
    orderId: orderId, // معرف الطلب
  },
});
```

## النتيجة
- ✅ تم حل مشكلة RLS لتحديث موقع السائق
- ✅ يعمل تحديث الموقع بشكل صحيح بعد إكمال التسجيل
- ✅ يعمل تتبع الموقع أثناء تنفيذ الطلبات
- ✅ تم نشر Edge Function بنجاح

## ملاحظات
- Edge Function يستخدم `verify_jwt: true` للأمان
- يتم التحقق من وجود السائق وصحة البيانات قبل التحديث
- يدعم إضافة موقع جديد أو تحديث موقع موجود تلقائياً

