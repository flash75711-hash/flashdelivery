# إعداد MessageBird في Supabase - خطوة بخطوة كاملة

## ✅ الخطوة 1: إنشاء حساب MessageBird

1. اذهب إلى: https://dashboard.messagebird.com/en/sign-up
2. اضغط **"Sign up here"**
3. سجل حساب جديد:
   - أدخل البريد الإلكتروني
   - أدخل كلمة المرور
   - أكمل التسجيل
4. بعد التسجيل، ستحصل على Trial credits للاختبار

---

## ✅ الخطوة 2: الحصول على API Key

### بعد تسجيل الدخول:

1. اذهب إلى Dashboard: https://dashboard.messagebird.com/
2. في Dashboard، ابحث عن:
   - **"API Access"** أو
   - **"Settings"** > **"API Access"** أو
   - **"Developers"** > **"API Keys"**
3. ستجد **"API Key"** (يبدأ بحروف وأرقام، مثل: `live_xxxxxxxxxxxxx`)
4. انسخ API Key

### أو من Developers Portal:

1. اذهب إلى: https://developers.messagebird.com/quickstarts/test-credits-api-keys/
2. اتبع التعليمات للحصول على API Key
3. انسخ API Key

---

## ✅ الخطوة 3: إعداد Supabase

1. اذهب إلى: https://supabase.com/dashboard/project/tnwrmybyvimlsamnputn/auth/providers?provider=Phone

2. في صفحة Phone settings:
   - فعّل **"Enable Phone provider"** ✅
   - في **"SMS provider"**، اختر **"Messagebird"** 📱
   - أدخل:
     - **Messagebird API Key**: (الصق API Key الذي نسخته)
     - **Messagebird From**: (اتركه فارغاً أولاً - إذا طلب، ستحتاج لشراء رقم)
   - فعّل **"Enable phone confirmations"** ✅
   - اضغط **"Save"** ✅

---

## ⚠️ ملاحظات مهمة:

### إذا طلب "Messagebird From":
- قد تحتاج لشراء رقم هاتف من MessageBird
- أو جرب ترك الحقل فارغاً
- أو استخدم رقم هاتف مؤقت للاختبار

### Trial Credits:
- MessageBird يعطي Trial credits للاختبار
- بعد انتهاء Trial، التكلفة: ~$0.008 لكل رسالة

---

## 🔍 استكشاف الأخطاء:

### إذا لم تصل رسالة SMS:

1. **تحقق من API Key**:
   - تأكد من نسخ API Key بشكل صحيح
   - تأكد من أنه نشط في MessageBird Dashboard

2. **تحقق من Logs في MessageBird**:
   - اذهب إلى MessageBird Dashboard
   - ابحث عن "Logs" أو "Messages"
   - ابحث عن أي أخطاء

3. **تحقق من Logs في Supabase**:
   - اذهب إلى Supabase Dashboard > Authentication > Logs
   - ابحث عن أي أخطاء

---

## 📋 ملخص الخطوات:

1. ✅ سجل في MessageBird: https://dashboard.messagebird.com/en/sign-up
2. ✅ احصل على API Key من Dashboard
3. ✅ في Supabase: اختر "Messagebird" من قائمة SMS provider
4. ✅ أدخل API Key
5. ✅ احفظ واختبر

---

## 💡 نصيحة:

**إذا واجهت مشكلة مع MessageBird:**
- جرب **Vonage** مع Test Numbers (أسهل)
- أو **Upgrade Twilio** (أكثر موثوقية)

---

## 🚀 بعد الإعداد:

1. شغّل التطبيق
2. جرب تسجيل الدخول برقم هاتف
3. يجب أن تصل رسالة SMS برمز التحقق









































