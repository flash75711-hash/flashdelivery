# 🔐 إعداد Environment Variables في Vercel

## ⚠️ خطأ: "supabaseUrl is required"

إذا ظهر هذا الخطأ، يعني أن متغيرات البيئة غير معرّفة في Vercel.

## ✅ الحل السريع:

### 1. افتح Vercel Dashboard
```
https://vercel.com/dashboard
```

### 2. اختر مشروعك
- اختر مشروع `flashdelivery`

### 3. اذهب إلى Settings → Environment Variables

### 4. أضف المتغيرات التالية:

#### 🔑 EXPO_PUBLIC_SUPABASE_URL
```
https://tnwrmybyvimlsamnputn.supabase.co
```
**Environment:** Production, Preview, Development

---

#### 🔑 EXPO_PUBLIC_SUPABASE_ANON_KEY
```
eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRud3JteWJ5dmltbHNhbW5wdXRuIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjQxNDA1OTQsImV4cCI6MjA3OTcxNjU5NH0.Uaki5K4zkCt2P2JunTVCpME6WOKO_uX0Qe4Gy8QRreg
```
**Environment:** Production, Preview, Development

---

#### 🔑 EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID (اختياري)
```
1015830991386-1esj2s7gt6e1q7ori2bqjn0oq1p1rqrs.apps.googleusercontent.com
```
**Environment:** Production, Preview, Development

---

### 5. بعد إضافة المتغيرات:

1. **احفظ** جميع المتغيرات
2. اذهب إلى **Deployments**
3. اضغط على **Redeploy** على آخر deployment
4. أو انتظر حتى يتم push جديد من GitHub

---

## 📋 قائمة التحقق:

- [ ] تم إضافة `EXPO_PUBLIC_SUPABASE_URL`
- [ ] تم إضافة `EXPO_PUBLIC_SUPABASE_ANON_KEY`
- [ ] تم اختيار Environment: **Production, Preview, Development** لكل متغير
- [ ] تم الضغط على **Save**
- [ ] تم عمل Redeploy

---

## 🔍 كيفية التحقق:

بعد Redeploy، افتح الموقع وتحقق من:
- لا يوجد خطأ "supabaseUrl is required" في Console
- التطبيق يعمل بشكل طبيعي

---

## 📝 ملاحظات:

- ⚠️ **لا ترفع** ملف `.env` على GitHub
- ✅ استخدم **Vercel Environment Variables** فقط
- ✅ المتغيرات محمية ولا تظهر في الكود

---

## 🆘 إذا استمرت المشكلة:

1. تحقق من أن المتغيرات موجودة في Vercel Dashboard
2. تحقق من أن Environment صحيح (Production/Preview/Development)
3. تأكد من عمل Redeploy بعد إضافة المتغيرات
4. تحقق من Console في المتصفح لرؤية رسائل الخطأ

