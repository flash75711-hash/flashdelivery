# 🔐 Vercel Secrets - جميع الـ Secrets المطلوبة

## 📋 قائمة الـ Secrets الكاملة

### 1. Supabase Secrets

#### `EXPO_PUBLIC_SUPABASE_URL`
```
انسخ من ملف .env أو Supabase Dashboard
```

#### `EXPO_PUBLIC_SUPABASE_ANON_KEY`
```
انسخ من ملف .env أو Supabase Dashboard
```

#### `EXPO_SUPABASE_SERVICE_ROLE` (اختياري - للإدارة)
```
انسخ من ملف .env أو Supabase Dashboard
```

### 2. Google OAuth Secrets

#### `EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID`
```
انسخ من ملف .env أو Google Cloud Console
```

---

## 🚀 خطوات إضافة الـ Secrets في Vercel

### 1. افتح Vercel Dashboard
```
https://vercel.com/dashboard
```

### 2. اختر المشروع
- اختر مشروع `flashdelivery` أو أنشئ مشروع جديد

### 3. اذهب إلى Settings → Environment Variables

### 4. أضف الـ Secrets التالية:

#### للـ Production, Preview, Development:
- `EXPO_PUBLIC_SUPABASE_URL` - من Supabase Dashboard
- `EXPO_PUBLIC_SUPABASE_ANON_KEY` - من Supabase Dashboard  
- `EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID` - من Google Cloud Console

---

## 📝 ملاحظات مهمة

### ⚠️ الأمان:
- **لا تشارك** هذه الـ Secrets مع أحد
- **لا ترفع** ملف `.env` على GitHub
- استخدم **Vercel Secrets** فقط

### ✅ أفضل الممارسات:
1. استخدم **Environment Variables** في Vercel
2. لا تكتب الـ Secrets مباشرة في الكود
3. استخدم `.env.example` كقالب فقط

---

## 📍 أين تجد القيم:

### Supabase:
1. افتح [Supabase Dashboard](https://supabase.com/dashboard)
2. Settings → API
3. انسخ `URL` و `anon key`

### Google:
1. افتح [Google Cloud Console](https://console.cloud.google.com)
2. APIs & Services → Credentials
3. انسخ `Client ID`

---

## ✅ جاهز!

بعد إضافة جميع الـ Secrets، Vercel سيربط تلقائياً مع:
- ✅ GitHub (للحصول على الكود)
- ✅ Supabase (للمصادقة وقاعدة البيانات)

