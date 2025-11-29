# ⚙️ إعدادات Vercel Dashboard - مهم جداً!

## ⚠️ المشكلة:

Vercel قد يستخدم إعدادات Dashboard بدلاً من `vercel.json`!

## ✅ الحل: تحديث إعدادات Dashboard يدوياً

### 1. افتح Vercel Dashboard:
```
https://vercel.com/dashboard
```

### 2. اذهب إلى:
```
Settings → Build and Deployment
```

### 3. في قسم "Build & Development Settings":

#### Framework Preset:
```
Other
```
أو اتركه **فارغاً**

#### Build Command:
```
npx expo export -p web
```
**مهم:** تأكد من حذف أي أمر قديم مثل `expo export:web`

#### Output Directory:
```
.output
```
**مهم:** تأكد من تغييرها من `web-build` إلى `.output`

#### Install Command:
```
npm install
```

---

## 🔍 التحقق:

بعد التحديث، تأكد من:
- ✅ Build Command: `npx expo export -p web` (وليس `expo export:web`)
- ✅ Output Directory: `.output` (وليس `web-build`)
- ✅ Framework Preset: `Other` أو فارغ

---

## 📝 ملاحظة مهمة:

إذا كانت الإعدادات في Dashboard مختلفة عن `vercel.json`، **Dashboard له الأولوية**!

لذلك يجب تحديث Dashboard يدوياً.

---

## ✅ بعد التحديث:

1. اضغط **Save**
2. اذهب إلى **Deployments**
3. اضغط **Redeploy** على آخر deployment
4. أو انتظر حتى يتم Deploy تلقائياً بعد push جديد

---

## 🚀 جاهز!

بعد تحديث Dashboard، البناء سيكتمل بنجاح!

