# ⚙️ إعدادات Vercel - Build and Deployment

## 📋 الإعدادات المطلوبة في Vercel Dashboard

### 1. افتح صفحة Build and Deployment:
```
Settings → Build and Deployment
```

### 2. Build & Development Settings:

#### Framework Preset:
```
Other
```
أو اتركه فارغاً (سيستخدم vercel.json)

#### Build Command:
```
npm run build:web
```
أو:
```
npx expo export:web
```

#### Output Directory:
```
web-build
```

#### Install Command:
```
npm install
```

#### Development Command:
```
npm start
```

---

## 🔧 إذا كان لديك ملف vercel.json:

Vercel سيستخدم الإعدادات من `vercel.json` تلقائياً، لكن يمكنك التحقق من:

### Build Command في vercel.json:
```json
"buildCommand": "npx expo export:web"
```

### Output Directory في vercel.json:
```json
"outputDirectory": "web-build"
```

---

## ✅ بعد التحديث:

1. **احفظ** الإعدادات
2. اذهب إلى **Deployments**
3. اضغط **Redeploy** للـ deployment الأخير
4. أو انتظر حتى يتم Deploy تلقائياً بعد push جديد

---

## 🔍 التحقق من الإعدادات:

### في صفحة Build and Deployment:
- ✅ Framework Preset: **Other**
- ✅ Build Command: **npm run build:web** أو **npx expo export:web**
- ✅ Output Directory: **web-build**
- ✅ Install Command: **npm install**

---

## 📝 ملاحظات:

- ملف `vercel.json` موجود في المشروع وسيتم استخدامه تلقائياً
- إذا كانت الإعدادات في Dashboard مختلفة عن `vercel.json`، سيتم استخدام إعدادات Dashboard
- تأكد من إضافة جميع Environment Variables في Settings → Environment Variables

---

## 🚀 بعد الإعداد:

الموقع سيعمل على:
```
https://flashdeliver700.vercel.app
```

