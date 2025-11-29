# 🚀 إعداد Vercel - خطوة بخطوة

## 📋 الخطوات الكاملة

### 1. ربط Vercel مع GitHub

1. افتح [Vercel Dashboard](https://vercel.com/dashboard)
2. اضغط **Add New Project**
3. اختر **Import Git Repository**
4. اختر **GitHub**
5. ابحث عن: `flash75711-hash/flashdelivery`
6. اضغط **Import**

### 2. إعداد المشروع في Vercel

#### Framework Preset:
```
Expo
```

#### Root Directory:
```
./
```

#### Build Command:
```
npm run build
```

#### Output Directory:
```
web-build
```

### 3. إضافة Environment Variables (Secrets)

اذهب إلى **Settings** → **Environment Variables** وأضف:

#### 🔑 Secret 1: `EXPO_PUBLIC_SUPABASE_URL`
**Value:**
```
https://tnwrmybyvimlsamnputn.supabase.co
```
**Environment:** Production, Preview, Development

---

#### 🔑 Secret 2: `EXPO_PUBLIC_SUPABASE_ANON_KEY`
**Value:**
```
eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRud3JteWJ5dmltbHNhbW5wdXRuIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjQxNDA1OTQsImV4cCI6MjA3OTcxNjU5NH0.Uaki5K4zkCt2P2JunTVCpME6WOKO_uX0Qe4Gy8QRreg
```
**Environment:** Production, Preview, Development

---

#### 🔑 Secret 3: `EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID`
**Value:**
```
1015830991386-1esj2s7gt6e1q7ori2bqjn0oq1p1rqrs.apps.googleusercontent.com
```
**Environment:** Production, Preview, Development

---

#### 🔑 Secret 4: `EXPO_SUPABASE_SERVICE_ROLE` (اختياري)
**Value:**
```
eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRud3JteWJ5dmltbHNhbW5wdXRuIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2NDE0MDU5NCwiZXhwIjoyMDc5NzE2NTk0fQ.ZVouDirjktZrtP-sh3ma6aEhjQT88F76XEGivEYGGfs
```
**Environment:** Production (للإدارة فقط)

---

### 4. Deploy

بعد إضافة جميع الـ Secrets:
1. اضغط **Deploy**
2. انتظر حتى يكتمل البناء
3. سيتم إنشاء رابط للموقع

---

## 📋 ملخص الـ Secrets

| الاسم | القيمة | البيئة |
|------|--------|--------|
| `EXPO_PUBLIC_SUPABASE_URL` | `https://tnwrmybyvimlsamnputn.supabase.co` | All |
| `EXPO_PUBLIC_SUPABASE_ANON_KEY` | `eyJhbGci...` | All |
| `EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID` | `1015830991386-...` | All |
| `EXPO_SUPABASE_SERVICE_ROLE` | `eyJhbGci...` | Production |

---

## ✅ بعد النشر

سيتم إنشاء رابط مثل:
```
https://flash-delivery.vercel.app
```

---

## 🔧 استكشاف الأخطاء

### مشكلة: "Environment variable not found"
- تأكد من إضافة جميع الـ Secrets
- تأكد من اختيار البيئة الصحيحة (Production/Preview/Development)

### مشكلة: "Build failed"
- تحقق من أن Framework Preset = Expo
- تحقق من Build Command

---

## 📝 ملاحظات

- ✅ Vercel سيربط تلقائياً مع GitHub
- ✅ كل push جديد سيتم نشره تلقائياً
- ✅ الـ Secrets محمية ولا تظهر في الكود

