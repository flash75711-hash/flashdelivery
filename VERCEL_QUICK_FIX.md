# 🚀 إصلاح سريع - Vercel Build Error

## ❌ الخطأ:
```
CommandError: expo export:web can only be used with Webpack
```

## ✅ الحل السريع:

### في Vercel Dashboard → Settings → Build and Deployment:

#### Build Command:
```
npx expo export -p web
```

#### Output Directory:
```
.output
```

---

## 📋 خطوات سريعة:

1. افتح: https://vercel.com/dashboard
2. Settings → Build and Deployment
3. Build Command: `npx expo export -p web`
4. Output Directory: `.output`
5. Save
6. Redeploy

---

## ✅ جاهز!

