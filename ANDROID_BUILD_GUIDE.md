# 📱 دليل تثبيت التطبيق على أندرويد

## 🎯 الخيارات المتاحة:

### الخيار 1: Expo Go (للتطوير والاختبار السريع) ⚡
- **الأسرع والأسهل**
- لا يحتاج بناء APK
- مناسب للتطوير والاختبار فقط
- ⚠️ لا يصلح للنشر للمستخدمين

### الخيار 2: Development Build (للتطوير المتقدم) 🔧
- يحتاج بناء APK مخصص
- يدعم جميع المكتبات الأصلية
- مناسب للتطوير والاختبار

### الخيار 3: Production Build (للنشر) 🚀
- **للنشر الفعلي للمستخدمين**
- APK/AAB محسّن ومُوقّع
- جاهز للرفع على Google Play Store

---

## ⚡ الخيار 1: استخدام Expo Go (الأسرع)

### الخطوات:

#### 1. تثبيت Expo Go على الهاتف:
- افتح Google Play Store
- ابحث عن **"Expo Go"**
- ثبّت التطبيق

أو من الرابط المباشر:
```
https://play.google.com/store/apps/details?id=host.exp.exponent
```

#### 2. تشغيل السيرفر على الكمبيوتر:
```bash
cd /home/zero/.cursor/worktrees/flash/sai
npx expo start
```

#### 3. المسح الضوئي:
- ستظهر لك **QR Code** في Terminal
- افتح Expo Go على الهاتف
- اضغط **"Scan QR code"**
- وجّه الكاميرا على الـ QR Code

#### 4. انتظر التحميل:
- سيتم تحميل التطبيق تلقائياً
- يمكنك البدء في الاستخدام!

### ✅ المميزات:
- سريع جداً (دقائق)
- لا يحتاج إعدادات معقدة
- تحديث فوري (Hot Reload)

### ⚠️ العيوب:
- يحتاج اتصال بنفس الشبكة (أو Tunnel)
- لا يصلح للنشر للمستخدمين
- قد لا يدعم بعض المكتبات الأصلية

---

## 🔧 الخيار 2 & 3: بناء APK/AAB

### المتطلبات الأساسية:

#### 1. حساب Expo:
```bash
# إنشاء حساب أو تسجيل الدخول
npx expo login
```

#### 2. إعداد ملف التكوين:

تحقق من `app.json`:

```json
{
  "expo": {
    "name": "Sai App",
    "slug": "sai-app",
    "version": "1.0.0",
    "orientation": "portrait",
    "icon": "./assets/icon.png",
    "userInterfaceStyle": "light",
    "splash": {
      "image": "./assets/splash.png",
      "resizeMode": "contain",
      "backgroundColor": "#ffffff"
    },
    "android": {
      "package": "com.yourcompany.saiapp",
      "versionCode": 1,
      "adaptiveIcon": {
        "foregroundImage": "./assets/adaptive-icon.png",
        "backgroundColor": "#ffffff"
      },
      "permissions": [
        "ACCESS_COARSE_LOCATION",
        "ACCESS_FINE_LOCATION",
        "CAMERA",
        "READ_EXTERNAL_STORAGE",
        "WRITE_EXTERNAL_STORAGE"
      ]
    }
  }
}
```

---

## 🏗️ بناء APK للتطوير (Development Build)

### الطريقة 1: باستخدام EAS Build (الموصى به)

#### تثبيت EAS CLI:
```bash
npm install -g eas-cli
```

#### تسجيل الدخول:
```bash
eas login
```

#### تكوين EAS:
```bash
cd /home/zero/.cursor/worktrees/flash/sai
eas build:configure
```

#### بناء APK للتطوير:
```bash
# Development Build
eas build --platform android --profile development
```

أو للإنتاج:
```bash
# Production Build
eas build --platform android --profile production
```

#### انتظر اكتمال البناء:
- العملية تتم على سحابة Expo
- ستستغرق 10-20 دقيقة
- ستحصل على رابط لتحميل APK

#### تحميل وتثبيت APK:
```bash
# سيعطيك رابط مثل:
https://expo.dev/accounts/[username]/projects/[project]/builds/[build-id]
```

- افتح الرابط على الهاتف
- حمّل APK
- ثبّته (قد تحتاج السماح بتثبيت من مصادر غير معروفة)

---

### الطريقة 2: بناء محلي (Local Build)

#### المتطلبات:
- **Android Studio** مثبّت
- **Java Development Kit (JDK)** 11 أو أعلى
- **Android SDK** و **Android NDK**

#### تثبيت Android Studio:
```bash
# تحميل من الموقع الرسمي
https://developer.android.com/studio

# أو عبر snap على Ubuntu:
sudo snap install android-studio --classic
```

#### إعداد المتغيرات البيئية:
```bash
# أضف إلى ~/.bashrc أو ~/.zshrc
export ANDROID_HOME=$HOME/Android/Sdk
export PATH=$PATH:$ANDROID_HOME/emulator
export PATH=$PATH:$ANDROID_HOME/platform-tools
export PATH=$PATH:$ANDROID_HOME/tools
export PATH=$PATH:$ANDROID_HOME/tools/bin
```

#### إعادة تحميل البيئة:
```bash
source ~/.bashrc
# أو
source ~/.zshrc
```

#### بناء APK محلياً:
```bash
cd /home/zero/.cursor/worktrees/flash/sai

# Pre-build (إنشاء ملفات Android الأصلية)
npx expo prebuild --platform android

# البناء باستخدام Gradle
cd android
./gradlew assembleRelease

# أو للتطوير:
./gradlew assembleDebug
```

#### موقع APK:
```
android/app/build/outputs/apk/release/app-release.apk
# أو
android/app/build/outputs/apk/debug/app-debug.apk
```

---

## 📦 تثبيت APK على الهاتف

### الطريقة 1: عبر USB

#### 1. تفعيل خيارات المطور على الهاتف:
- Settings > About phone
- اضغط على "Build number" 7 مرات
- ستظهر رسالة "You are now a developer"

#### 2. تفعيل USB Debugging:
- Settings > Developer options
- فعّل "USB debugging"

#### 3. توصيل الهاتف:
```bash
# تحقق من اتصال الهاتف
adb devices

# إذا ظهر الجهاز، ثبّت APK:
adb install android/app/build/outputs/apk/release/app-release.apk

# أو:
adb install path/to/your/app.apk
```

### الطريقة 2: نقل الملف مباشرة

#### 1. انقل APK للهاتف:
- وصّل الهاتف بالكمبيوتر عبر USB
- انسخ ملف APK للهاتف

#### 2. على الهاتف:
- افتح "File Manager" أو "Files"
- ابحث عن ملف APK
- اضغط عليه
- اسمح بالتثبيت من مصادر غير معروفة (إذا طُلب منك)
- اضغط "Install"

### الطريقة 3: عبر رابط مباشر

إذا استخدمت EAS Build:
- افتح الرابط الذي حصلت عليه على الهاتف
- حمّل APK
- ثبّته

---

## 🎨 تخصيص التطبيق قبل البناء

### 1. تغيير اسم التطبيق:

في `app.json`:
```json
{
  "expo": {
    "name": "تطبيق ساي",
    "slug": "sai-app"
  }
}
```

### 2. تغيير الأيقونة:

ضع صورة الأيقونة في:
```
assets/icon.png (1024x1024 px)
assets/adaptive-icon.png (1024x1024 px)
```

### 3. تغيير Splash Screen:

ضع صورة شاشة البداية في:
```
assets/splash.png
```

في `app.json`:
```json
{
  "expo": {
    "splash": {
      "image": "./assets/splash.png",
      "resizeMode": "contain",
      "backgroundColor": "#007AFF"
    }
  }
}
```

### 4. تغيير اسم الحزمة (Package Name):

في `app.json`:
```json
{
  "expo": {
    "android": {
      "package": "com.yourcompany.saiapp"
    }
  }
}
```

⚠️ **مهم:** اسم الحزمة يجب أن يكون فريداً ولا يمكن تغييره بعد النشر!

---

## 🔐 التوقيع والأمان

### للبناء الإنتاجي (Production):

#### استخدام EAS (الأسهل):
```bash
# EAS سيُنشئ ويدير الشهادات تلقائياً
eas build --platform android --profile production
```

#### يدوياً (متقدم):

##### إنشاء Keystore:
```bash
keytool -genkeypair -v \
  -storetype PKCS12 \
  -keystore sai-app.keystore \
  -alias sai-app-key \
  -keyalg RSA \
  -keysize 2048 \
  -validity 10000
```

##### إضافة معلومات Keystore:

في `android/gradle.properties`:
```properties
MYAPP_UPLOAD_STORE_FILE=sai-app.keystore
MYAPP_UPLOAD_KEY_ALIAS=sai-app-key
MYAPP_UPLOAD_STORE_PASSWORD=YOUR_PASSWORD
MYAPP_UPLOAD_KEY_PASSWORD=YOUR_PASSWORD
```

في `android/app/build.gradle`:
```gradle
android {
    ...
    signingConfigs {
        release {
            if (project.hasProperty('MYAPP_UPLOAD_STORE_FILE')) {
                storeFile file(MYAPP_UPLOAD_STORE_FILE)
                storePassword MYAPP_UPLOAD_STORE_PASSWORD
                keyAlias MYAPP_UPLOAD_KEY_ALIAS
                keyPassword MYAPP_UPLOAD_KEY_PASSWORD
            }
        }
    }
    buildTypes {
        release {
            ...
            signingConfig signingConfigs.release
        }
    }
}
```

⚠️ **احتفظ بـ Keystore في مكان آمن! فقدانه يعني عدم القدرة على تحديث التطبيق!**

---

## 📱 النشر على Google Play Store

### الخطوات:

#### 1. إنشاء حساب مطور:
- https://play.google.com/console
- رسوم لمرة واحدة: $25

#### 2. بناء AAB (Android App Bundle):
```bash
# مع EAS:
eas build --platform android --profile production

# محلياً:
cd android
./gradlew bundleRelease
```

#### 3. رفع على Google Play Console:
- سجل دخول في https://play.google.com/console
- اضغط "Create app"
- املأ معلومات التطبيق
- ارفع ملف AAB
- املأ:
  - وصف التطبيق
  - لقطات الشاشة
  - الأيقونة
  - سياسة الخصوصية
  - تصنيف المحتوى

#### 4. اختبار داخلي/مغلق:
- Internal testing: لفريقك فقط
- Closed testing: لمجموعة محددة
- Open testing: للجميع (قبل النشر النهائي)

#### 5. النشر النهائي:
- بعد اكتمال المراجعة
- اضغط "Publish to production"

---

## 🧪 الاختبار قبل النشر

### قائمة فحص (Checklist):

✅ **الوظائف:**
- [ ] تسجيل الدخول/الخروج
- [ ] إنشاء الطلبات
- [ ] قبول الطلبات (السائق)
- [ ] الإشعارات
- [ ] الدفع (إن وُجد)

✅ **الأداء:**
- [ ] سرعة التحميل
- [ ] استهلاك البطارية
- [ ] استخدام الذاكرة

✅ **التوافق:**
- [ ] Android 8.0+ (API 26+)
- [ ] أحجام شاشات مختلفة
- [ ] اتجاه الشاشة (Portrait/Landscape)

✅ **الأذونات:**
- [ ] الموقع الجغرافي
- [ ] الكاميرا
- [ ] الإشعارات

✅ **الأمان:**
- [ ] HTTPS فقط
- [ ] تشفير البيانات الحساسة
- [ ] حماية API keys

---

## 📊 جدول المقارنة

| الميزة | Expo Go | EAS Build | Local Build |
|--------|---------|-----------|-------------|
| **السرعة** | ⚡ فوري | 🕐 10-20 دقيقة | 🕐 5-15 دقيقة |
| **السهولة** | 😊 جداً سهل | 😊 سهل | 😐 متوسط |
| **المتطلبات** | تطبيق فقط | حساب Expo | Android Studio |
| **التكلفة** | مجاني | مجاني محدود* | مجاني |
| **النشر للمستخدمين** | ❌ لا | ✅ نعم | ✅ نعم |
| **المكتبات الأصلية** | ⚠️ محدود | ✅ كل شيء | ✅ كل شيء |

*EAS Build: مجاني لـ 30 بناء/شهر، ثم اشتراك مدفوع

---

## 🎯 التوصيات

### للتطوير والاختبار:
✅ استخدم **Expo Go** - الأسرع والأسهل

### للاختبار مع المستخدمين الفعليين:
✅ استخدم **EAS Build** - سهل ومُدار بالكامل

### للمشاريع الكبيرة أو إذا كنت تريد التحكم الكامل:
✅ استخدم **Local Build** - تحكم كامل

### للنشر الفعلي:
✅ استخدم **EAS Build** + **Google Play Store**

---

## 🚀 البداية السريعة (للتطوير)

### الخطوات الأسهل:

```bash
# 1. تشغيل السيرفر
cd /home/zero/.cursor/worktrees/flash/sai
npx expo start

# 2. على الهاتف:
# - ثبّت Expo Go من Play Store
# - امسح QR Code

# 3. استمتع! 🎉
```

---

## 🔗 روابط مفيدة

- **Expo Go:** https://play.google.com/store/apps/details?id=host.exp.exponent
- **EAS Build:** https://docs.expo.dev/build/introduction/
- **Google Play Console:** https://play.google.com/console
- **Android Studio:** https://developer.android.com/studio
- **Expo Documentation:** https://docs.expo.dev/

---

## 📞 المساعدة

إذا واجهت أي مشاكل:

1. **تحقق من Logs:**
   ```bash
   npx expo start
   # اضغط 'j' لفتح debugger
   ```

2. **امسح Cache:**
   ```bash
   npx expo start --clear
   ```

3. **أعد تثبيت Dependencies:**
   ```bash
   rm -rf node_modules
   npm install
   ```

---

**✅ جاهز! اختر الطريقة المناسبة لك وابدأ!** 🚀📱











