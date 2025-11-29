# 🔧 إصلاح مشكلة Build في Vercel

## ❌ المشكلة:
```
CommandError: expo export:web can only be used with Webpack. 
Use expo export for other bundlers.
```

## ✅ الحل:

### المشكلة:
- `expo export:web` يعمل فقط مع Webpack
- المشروع يستخدم Metro bundler
- يجب استخدام `expo export -p web` بدلاً من ذلك

### الإعدادات الصحيحة:

#### في vercel.json:
```json
{
  "buildCommand": "npx expo export -p web",
  "outputDirectory": ".output"
}
```

#### في package.json:
```json
{
  "scripts": {
    "build": "expo export -p web",
    "build:web": "expo export -p web"
  }
}
```

---

## 📋 الإعدادات في Vercel Dashboard:

### Build Command:
```
npx expo export -p web
```
أو:
```
npm run build:web
```

### Output Directory:
```
.output
```

---

## ✅ بعد التحديث:

1. تم تحديث الملفات
2. تم رفع التحديثات إلى GitHub
3. Vercel سيقوم بـ Redeploy تلقائياً
4. أو قم بـ Redeploy يدوياً من Dashboard

---

## 🔍 ملاحظات:

- `expo export -p web` يعمل مع Metro bundler
- Output directory: `.output` (الافتراضي لـ Expo)
- تأكد من إضافة جميع Environment Variables

---

## ✅ جاهز!

بعد Redeploy، البناء سيكتمل بنجاح!

