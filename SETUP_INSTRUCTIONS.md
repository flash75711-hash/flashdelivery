# تعليمات إعداد SMS OTP - خطوة بخطوة

## الخطوة 1: إعداد Supabase Phone Auth

1. في Supabase Dashboard، اذهب إلى **Authentication** > **Providers**
2. اختر **Phone**
3. فعّل **"Enable Phone provider"** ✅
4. **اترك "SMS provider" فارغاً** (أو اختر أي واحد مؤقتاً - سنستخدم Hook بدلاً منه)
5. فعّل **"Enable phone confirmations"** ✅
6. اضغط **"Save"**

## الخطوة 2: إنشاء حساب في Msegat

1. اذهب إلى [Msegat.com](https://msegat.com)
2. سجل حساب جديد
3. بعد التسجيل، احصل على:
   - **API Key** (مفتاح API)
   - **Username** (اسم المستخدم)
   - **Sender Name** (اسم المرسل - مثال: FlashDelivery)

## الخطوة 3: نشر Edge Function

### الطريقة الأولى: عبر Supabase CLI

```bash
# تثبيت Supabase CLI (إذا لم يكن مثبتاً)
npm install -g supabase

# تسجيل الدخول
supabase login

# ربط المشروع
supabase link --project-ref tnwrmybyvimlsamnputn

# نشر Edge Function
supabase functions deploy send-sms
```

### الطريقة الثانية: عبر Supabase Dashboard

1. اذهب إلى **Edge Functions** في Supabase Dashboard
2. اضغط **"Create a new function"**
3. اسم الوظيفة: `send-sms`
4. انسخ الكود من `supabase/functions/send-sms/index.ts`
5. اضغط **"Deploy"**

## الخطوة 4: إضافة Environment Variables

1. في Supabase Dashboard، اذهب إلى **Project Settings** > **Edge Functions** > **Secrets**
2. أضف الأسرار التالية:
   - `MSEGAT_API_KEY`: مفتاح API من Msegat
   - `MSEGAT_USERNAME`: اسم المستخدم من Msegat
   - `MSEGAT_SENDER_NAME`: اسم المرسل (اختياري - افتراضي: FlashDelivery)

## الخطوة 5: ربط Send SMS Hook

1. في Supabase Dashboard، اذهب إلى **Authentication** > **Hooks**
2. اضغط **"Create a new hook"**
3. اختر **"Send SMS"**
4. اختر Edge Function: **`send-sms`**
5. اضغط **"Save"**

## الخطوة 6: اختبار

1. شغّل التطبيق
2. جرب تسجيل الدخول برقم هاتف (مثال: 01234567890)
3. يجب أن تصل رسالة SMS برمز التحقق

## استكشاف الأخطاء

### إذا لم تصل رسالة SMS:

1. **تحقق من Logs**:
   - اذهب إلى **Edge Functions** > **send-sms** > **Logs**
   - ابحث عن أي أخطاء

2. **تحقق من Environment Variables**:
   - تأكد من إضافة جميع الأسرار بشكل صحيح

3. **تحقق من رصيد Msegat**:
   - تأكد من وجود رصيد كافٍ في حساب Msegat

4. **تحقق من تنسيق رقم الهاتف**:
   - يجب أن يكون بصيغة: +20xxxxxxxxxx

## التكلفة

- **Msegat**: حوالي 0.15-0.25 جنيه لكل رسالة SMS
- **Supabase**: مجاني (Edge Functions ضمن الخطة المجانية)

## ملاحظات مهمة

- ✅ لا تحتاج لاختيار SMS Provider مباشر من Supabase
- ✅ استخدم Send SMS Hook مع Edge Function
- ✅ هذا يعطيك مرونة أكبر في اختيار مزود SMS
- ✅ يمكنك تغيير مزود SMS لاحقاً بدون تغيير الكود

