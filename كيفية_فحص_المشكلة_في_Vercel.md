# 🔍 كيفية فحص المشكلة في Vercel

## 📋 الخطوات:

### 1. سجّل الدخول إلى Vercel:
```
https://vercel.com/login
```

### 2. اذهب إلى المشروع:
```
https://vercel.com/flashs-projects-5d8607b5/flashdeliver700
```

### 3. اذهب إلى Settings → Build and Deployment

### 4. تحقق من الإعدادات التالية:

#### ✅ Build Command يجب أن يكون:
```
npx expo export -p web
```
**وليس:** `expo export:web` ❌

#### ✅ Output Directory يجب أن يكون:
```
.output
```
**وليس:** `web-build` ❌

#### ✅ Framework Preset:
```
Other
```
أو فارغ

---

## 🔍 فحص آخر Deployment:

### 1. اذهب إلى Deployments
### 2. اضغط على آخر deployment
### 3. افحص Build Logs

### المشكلة المتوقعة:
```
CommandError: expo export:web can only be used with Webpack
```

### الحل:
تأكد من أن Build Command في Dashboard هو:
```
npx expo export -p web
```

---

## ✅ بعد التصحيح:

1. **احفظ** الإعدادات
2. اضغط **Redeploy** على آخر deployment
3. أو انتظر حتى يتم Deploy تلقائياً بعد push جديد

---

## 📝 ملاحظة:

إذا كانت الإعدادات في Dashboard مختلفة عن `vercel.json`، **Dashboard له الأولوية**!

لذلك يجب تحديث Dashboard يدوياً.

---

## 🚀 جاهز!

بعد تحديث Dashboard، البناء سيكتمل بنجاح!

