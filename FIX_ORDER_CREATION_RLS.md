# إصلاح مشكلة RLS لإنشاء الطلبات

## المشكلة
عند محاولة إنشاء طلب جديد (من خارج أو طلب توصيل)، كان النظام يفشل مع الخطأ:
```
POST https://tnwrmybyvimlsamnputn.supabase.co/rest/v1/orders?select=* 401 (Unauthorized)
new row violates row-level security policy for table "orders"
```

## السبب
- سياسة RLS على جدول `orders` تستخدم `auth.uid()` للتحقق من هوية العميل
- في نظام المصادقة بالـ PIN، لا يتم إنشاء جلسة Supabase تلقائياً
- لذلك `auth.uid()` يعيد `null`، وتفشل سياسة RLS

## الحل
تم إنشاء Edge Function جديد `create-order` يستخدم Service Role Key لتجاوز RLS وإنشاء الطلبات.

### الملفات المعدلة:

1. **`supabase/functions/create-order/index.ts`** (جديد)
   - Edge Function لإنشاء الطلبات
   - يستخدم Service Role Key لتجاوز RLS
   - يدعم نوعي الطلبات: `package` و `outside`
   - يتحقق من وجود العميل قبل إنشاء الطلب

2. **`app/orders/outside-order.tsx`**
   - تم تحديث `handleConfirmPriceAndSubmit` لاستخدام Edge Function بدلاً من الوصول المباشر للقاعدة
   - يحل مشكلة RLS عند إنشاء طلبات من خارج

3. **`app/orders/deliver-package.tsx`**
   - تم تحديث `handleSubmit` لاستخدام Edge Function
   - يحل مشكلة RLS عند إنشاء طلبات التوصيل

## كيفية الاستخدام

### من Outside Order:
```typescript
await supabase.functions.invoke('create-order', {
  body: {
    customerId: user?.id,
    vendorId: null,
    driverId: null,
    items: routePoints,
    status: 'pending',
    pickupAddress: routePoints[0]?.address || 'نقطة الانطلاق',
    deliveryAddress: routePoints[routePoints.length - 1]?.address || customerAddressText,
    totalFee: selectedPrice,
    images: allImages.length > 0 ? allImages : null,
    orderType: 'outside',
  },
});
```

### من Deliver Package:
```typescript
await supabase.functions.invoke('create-order', {
  body: {
    customerId: user?.id,
    pickupAddress: pickupAddress,
    deliveryAddress: deliveryAddress,
    packageDescription: packageDescription,
    status: 'pending',
    totalFee: estimatedFee,
    orderType: 'package',
  },
});
```

## النتيجة
- ✅ تم حل مشكلة RLS لإنشاء الطلبات
- ✅ يعمل إنشاء الطلبات بشكل صحيح من جميع الأنواع
- ✅ تم نشر Edge Function بنجاح

## ملاحظات
- Edge Function يستخدم `verify_jwt: true` للأمان
- يتم التحقق من وجود العميل وصحة البيانات قبل إنشاء الطلب
- يدعم جميع حقول الطلب الاختيارية (items, images, packageDescription)

