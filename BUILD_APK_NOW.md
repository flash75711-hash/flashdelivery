# 🚀 بناء APK - خطوات مباشرة

## ⚡ نفّذ هذه الأوامر بالترتيب

---

## الخطوة 1: افتح Terminal تفاعلي جديد

اضغط `Ctrl+Alt+T` أو افتح Terminal من القائمة

---

## الخطوة 2: انتقل للمشروع

```bash
cd /home/zero/.cursor/worktrees/flash/sai
```

---

## الخطوة 3: إعداد EAS Build

```bash
npx eas-cli build:configure
```

### سيسألك:
```
✔ Would you like to automatically create an EAS project for @nemu700/flash-delivery? (Y/n)
```
**اكتب:** `Y` واضغط Enter

```
✔ What would you like your Android package name to be? › com.flash.delivery
```
**اضغط:** Enter (سيستخدم الافتراضي)

---

## الخطوة 4: بناء APK

```bash
npx eas-cli build --platform android --profile preview
```

### سيسألك:
```
✔ Generate a new Android Keystore? (Y/n)
```
**اكتب:** `Y` واضغط Enter

---

## الخطوة 5: انتظر البناء

```
⏳ Queued build...
⏳ In queue... (1-5 دقائق)
⏳ Building... (10-15 دقيقة)

✅ Build finished!

📥 Download build artifact? (Y/n)
```

**اكتب:** `Y` لتحميل APK مباشرة

أو ستحصل على رابط:
```
Build URL: https://expo.dev/accounts/nemu700/projects/flash-delivery/builds/[id]
```

---

## الخطوة 6: تحميل على الموبايل

### الطريقة 1: من الرابط
1. انسخ الرابط من Terminal
2. افتحه على الموبايل
3. اضغط "Download"
4. بعد التحميل، افتح الملف
5. اسمح بالتثبيت من "Unknown sources"
6. اضغط "Install"

### الطريقة 2: عبر USB
إذا حمّلت APK على الكمبيوتر:
```bash
# وصّل الموبايل بالكمبيوتر
adb devices

# ثبّت APK
adb install /path/to/downloaded/app.apk
```

---

## 🎯 الأوامر الكاملة (انسخ كلها):

```bash
cd /home/zero/.cursor/worktrees/flash/sai
npx eas-cli build:configure
npx eas-cli build --platform android --profile preview
```

---

## ⏱️ الوقت المتوقع:

- ⚙️ الإعداد: 2-3 دقائق
- ⏳ في الطابور: 1-5 دقائق
- 🏗️ البناء: 10-15 دقيقة
- **إجمالي: 15-20 دقيقة**

---

## ⚠️ إذا واجهت مشاكل:

### "You don't have permissions"
```bash
# سجل دخول مرة أخرى:
npx eas-cli logout
npx eas-cli login
```

### "Build failed"
```bash
# امسح cache وأعد المحاولة:
npx eas-cli build --platform android --profile preview --clear-cache
```

### "Cannot install APK"
على الموبايل:
- Settings > Security > Unknown sources (فعّله)
- أو: Settings > Apps > Special access > Install unknown apps

---

## 💡 معلومات مهمة:

- **الحساب:** nemu700
- **المشروع:** flash-delivery
- **Package:** com.flash.delivery
- **الكوتا:** 30 build/شهر (مجاني)

---

## 📊 ما يحدث في الخلفية:

1. ✅ EAS يرفع مشروعك للسحابة
2. ✅ يثبت Dependencies
3. ✅ يبني APK على سيرفرات Expo
4. ✅ يوقّع APK بشهادة تلقائية
5. ✅ يعطيك رابط للتحميل

---

## 🎉 بعد التثبيت:

افتح التطبيق على الموبايل وجرّب:
- ✅ تسجيل الدخول
- ✅ إنشاء طلب
- ✅ الإشعارات
- ✅ تحديد الموقع

---

**✅ ابدأ الآن! افتح Terminal وانسخ الأوامر!** 🚀











