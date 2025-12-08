# إضافة Test Phone Numbers في Supabase

## المشكلة:
عند استخدام رقم هاتف للاختبار، يجب إضافة Test Phone Numbers في Supabase حتى يعمل التحقق بدون إرسال SMS حقيقي.

## الحل:

### 1. اذهب إلى Supabase Dashboard:
https://supabase.com/dashboard/project/tnwrmybyvimlsamnputn/auth/providers?provider=Phone

### 2. في صفحة Phone settings:
- ابحث عن حقل **"Test Phone Numbers and OTPs"**
- أدخل:
  ```
  +201200006637=123456
  ```
- هذا يعني: رقم الهاتف `+201200006637` مع OTP `123456`

### 3. يمكنك إضافة أكثر من رقم:
```
+201200006637=123456,+201234567890=654321
```

### 4. اضغط **"Save"** ✅

---

## بعد الإعداد:

1. افتح التطبيق
2. أدخل رقم: `01200006637`
3. اضغط "إرسال رمز التحقق"
4. أدخل OTP: `123456`
5. سيتم تسجيل الدخول بنجاح! ✅

---

## ملاحظات:

- Test Phone Numbers تعمل فقط في Development
- في Production، سيتم إرسال SMS حقيقي
- يمكنك إضافة أي رقم هاتف مع أي OTP للاختبار











