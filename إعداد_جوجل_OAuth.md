# 🔐 إعداد تسجيل الدخول بجوجل

## ✅ ما تم إنجازه:

- ✅ تم إضافة زر تسجيل الدخول بجوجل في شاشة تسجيل الدخول
- ✅ تم إضافة دالة `signInWithGoogle` في AuthContext
- ✅ تم تثبيت الحزم المطلوبة (expo-auth-session, expo-crypto, expo-web-browser)
- ✅ تم إعداد Supabase لدعم OAuth

## ⚙️ إعداد Supabase (مهم!)

### 1. تفعيل Google Provider في Supabase:

1. افتح [Supabase Dashboard](https://supabase.com/dashboard)
2. اذهب إلى **Authentication** → **Providers**
3. فعّل **Google**
4. أضف:
   - **Client ID**: `1015830991386-1esj2s7gt6e1q7ori2bqjn0oq1p1rqrs.apps.googleusercontent.com`
   - **Client Secret**: (احصل عليه من Google Cloud Console)

### 2. إعداد Redirect URLs:

في Supabase Dashboard → **Authentication** → **URL Configuration**:

أضف هذه الروابط:
```
flash-delivery://
exp://localhost:8081
http://localhost:8081
```

### 3. إعداد Google Cloud Console:

1. اذهب إلى [Google Cloud Console](https://console.cloud.google.com)
2. اختر مشروعك أو أنشئ مشروع جديد
3. اذهب إلى **APIs & Services** → **Credentials**
4. أنشئ **OAuth 2.0 Client ID** (إذا لم يكن موجوداً)
5. أضف **Authorized redirect URIs**:
   ```
   https://tnwrmybyvimlsamnputn.supabase.co/auth/v1/callback
   flash-delivery://
   ```

## 🎯 كيفية الاستخدام:

### في التطبيق:
1. افتح شاشة تسجيل الدخول
2. اضغط على زر **"تسجيل الدخول بجوجل"**
3. سيتم فتح المتصفح لتسجيل الدخول
4. بعد الموافقة، سيتم إرجاعك للتطبيق تلقائياً

## 📋 ملاحظات:

- ✅ ملف المستخدم يتم إنشاؤه تلقائياً عند أول تسجيل دخول بجوجل
- ✅ الدور الافتراضي: `customer`
- ✅ يمكن تغيير الدور لاحقاً من Supabase Dashboard

## ✅ جاهز!

بعد إعداد Supabase و Google Cloud Console، تسجيل الدخول بجوجل سيعمل!

