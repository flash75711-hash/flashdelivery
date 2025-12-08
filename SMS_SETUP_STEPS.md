# خطوات إعداد SMS OTP - خطوة بخطوة

## ✅ الخطوة 1: تفعيل Phone Auth في Supabase Dashboard

1. اذهب إلى: https://supabase.com/dashboard/project/tnwrmybyvimlsamnputn/auth/providers
2. اضغط على **Phone** (السهم بجانب "Disabled")
3. فعّل **"Enable Phone provider"** ✅
4. **اترك "SMS provider" فارغاً** (أو اختر أي واحد مؤقتاً)
5. فعّل **"Enable phone confirmations"** ✅
6. اضغط **"Save"**

## ✅ الخطوة 2: إنشاء Edge Function

الكود جاهز في: `supabase/functions/send-sms/index.ts`

### الطريقة الأولى: عبر Supabase Dashboard (أسهل)

1. اذهب إلى: https://supabase.com/dashboard/project/tnwrmybyvimlsamnputn/functions
2. اضغط **"Create a new function"**
3. اسم الوظيفة: `send-sms`
4. انسخ الكود من الملف: `supabase/functions/send-sms/index.ts`
5. الصق الكود في المحرر
6. اضغط **"Deploy"**

### الطريقة الثانية: عبر Terminal (إذا كان لديك Access Token)

```bash
# 1. احصل على Access Token من:
# https://supabase.com/dashboard/account/tokens

# 2. اضبط Environment Variable
export SUPABASE_ACCESS_TOKEN="your_access_token_here"

# 3. سجل الدخول
supabase login --token $SUPABASE_ACCESS_TOKEN

# 4. اربط المشروع
supabase link --project-ref tnwrmybyvimlsamnputn

# 5. انشر Edge Function
supabase functions deploy send-sms
```

## ✅ الخطوة 3: إضافة Environment Variables

1. اذهب إلى: https://supabase.com/dashboard/project/tnwrmybyvimlsamnputn/settings/functions
2. في قسم **"Secrets"**، أضف:

   - **Name**: `MSEGAT_API_KEY`
   - **Value**: (مفتاح API من Msegat)
   
   - **Name**: `MSEGAT_USERNAME`
   - **Value**: (اسم المستخدم من Msegat)
   
   - **Name**: `MSEGAT_SENDER_NAME` (اختياري)
   - **Value**: `FlashDelivery`

3. اضغط **"Save"** لكل secret

## ✅ الخطوة 4: إنشاء Send SMS Hook

1. اذهب إلى: https://supabase.com/dashboard/project/tnwrmybyvimlsamnputn/auth/hooks
2. اضغط **"Create a new hook"**
3. اختر **"Send SMS"**
4. في **"Edge Function"**، اختر: `send-sms`
5. اضغط **"Save"**

## ✅ الخطوة 5: إنشاء حساب في Msegat (إذا لم يكن لديك)

1. اذهب إلى: https://msegat.com
2. سجل حساب جديد
3. بعد التسجيل، احصل على:
   - **API Key** (مفتاح API)
   - **Username** (اسم المستخدم)
   - **Sender Name** (اسم المرسل - مثال: FlashDelivery)

4. أضف هذه المعلومات في **الخطوة 3** أعلاه

## ✅ الخطوة 6: اختبار

1. شغّل التطبيق
2. جرب تسجيل الدخول برقم هاتف (مثال: 01234567890)
3. يجب أن تصل رسالة SMS برمز التحقق

## 🔍 استكشاف الأخطاء

### إذا لم تصل رسالة SMS:

1. **تحقق من Logs**:
   - اذهب إلى: https://supabase.com/dashboard/project/tnwrmybyvimlsamnputn/functions/send-sms/logs
   - ابحث عن أي أخطاء

2. **تحقق من Environment Variables**:
   - تأكد من إضافة جميع الأسرار بشكل صحيح
   - تأكد من أن الأسماء مطابقة تماماً (حساسة لحالة الأحرف)

3. **تحقق من رصيد Msegat**:
   - تأكد من وجود رصيد كافٍ في حساب Msegat

4. **تحقق من تنسيق رقم الهاتف**:
   - يجب أن يكون بصيغة: +20xxxxxxxxxx

## 📝 ملاحظات مهمة

- ✅ Edge Function جاهز في: `supabase/functions/send-sms/index.ts`
- ✅ لا تحتاج لاختيار SMS Provider مباشر من Supabase
- ✅ استخدم Send SMS Hook مع Edge Function
- ✅ التكلفة: حوالي 0.15-0.25 جنيه لكل رسالة SMS

## 🎯 الخطوات السريعة (ملخص)

1. فعّل Phone Auth في Supabase Dashboard
2. أنشئ Edge Function `send-sms` (الكود جاهز)
3. أضف Environment Variables (MSEGAT_API_KEY, MSEGAT_USERNAME)
4. أنشئ Send SMS Hook واربطه بـ Edge Function
5. أنشئ حساب في Msegat واحصل على API credentials
6. اختبر!

