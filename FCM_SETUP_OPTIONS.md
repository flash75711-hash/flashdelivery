# 🔔 خيارات إعداد FCM - دليل سريع

## 📋 الخياران المتاحان

### ✅ الخيار 1: Legacy API (أسهل) - **موصى به للبداية**

#### المطلوب:
- **Server Key** من Firebase Console

#### الخطوات:
1. افتح [Firebase Console](https://console.firebase.google.com/)
2. Project Settings → **Cloud Messaging**
3. في قسم **Cloud Messaging API (Legacy)**:
   - إذا كان معطلاً، اضغط **Enable**
   - انسخ **Server Key**

4. في Supabase:
   - Edge Functions → Settings → Secrets
   - أضف: `FCM_SERVER_KEY` = (Server Key)

#### ✅ الكود الحالي جاهز لهذا الخيار!

---

### 🚀 الخيار 2: HTTP v1 API (أحدث) - **موصى به للمستقبل**

#### المطلوب:
- **Service Account JSON** كامل من Firebase

#### الخطوات:
1. افتح [Firebase Console](https://console.firebase.google.com/)
2. Project Settings → **Service accounts**
3. اضغط **Generate new private key**
4. سيتم تحميل ملف JSON (مثل: `firebase-adminsdk-xxxxx.json`)

5. في Supabase:
   - Edge Functions → Settings → Secrets
   - أضف: `FCM_SERVICE_ACCOUNT_JSON` = (محتوى ملف JSON كامل)

#### ⚠️ ملاحظة:
- الكود الحالي يستخدم Legacy API
- يحتاج تحديث الكود لاستخدام HTTP v1 API

---

## 🔍 الفرق بينهما

| الميزة | Legacy API | HTTP v1 API |
|--------|-----------|------------|
| **سهولة الإعداد** | ⭐⭐⭐⭐⭐ | ⭐⭐⭐ |
| **الأمان** | ⭐⭐⭐ | ⭐⭐⭐⭐⭐ |
| **الدعم** | ⚠️ سيتوقف يونيو 2024 | ✅ موصى به |
| **المطلوب** | Server Key فقط | Service Account JSON |

---

## 💡 التوصية

### للبداية السريعة:
✅ استخدم **Legacy API** (الخيار 1) - الكود جاهز!

### للمستقبل:
🚀 انتقل إلى **HTTP v1 API** (الخيار 2) - يحتاج تحديث الكود

---

## 📝 ملاحظة مهمة

**Private Key** الذي تراه في Firebase Console هو جزء من Service Account JSON. 

- إذا أردت استخدام **Legacy API**: احصل على **Server Key** (ليس Private Key)
- إذا أردت استخدام **HTTP v1 API**: احصل على **Service Account JSON كامل**

---

**تاريخ التحديث**: $(date)
