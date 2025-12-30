# ⚡ إعداد سريع لنظام PIN

## 📋 الخطوات (3 خطوات فقط!)

### 1️⃣ تحديث قاعدة البيانات

**افتح Supabase Dashboard → SQL Editor → انسخ والصق:**

```sql
-- انسخ محتوى pin_auth_migration.sql بالكامل
-- أو نفذ هذا:

ALTER TABLE profiles 
ADD COLUMN IF NOT EXISTS pin_hash TEXT,
ADD COLUMN IF NOT EXISTS failed_attempts INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS locked_until TIMESTAMP WITH TIME ZONE;

CREATE INDEX IF NOT EXISTS idx_profiles_phone ON profiles(phone) WHERE phone IS NOT NULL;
```

✅ اضغط **Run**

---

### 2️⃣ إنشاء مستخدم Admin

**اختر طريقة واحدة:**

#### أ) استخدام Script (أسهل)

```bash
# تأكد من وجود .env أو متغيرات البيئة:
# EXPO_PUBLIC_SUPABASE_URL=...
# SUPABASE_SERVICE_ROLE_KEY=...

node scripts/create-admin.js
```

#### ب) يدوياً في Supabase

1. **Authentication → Users → Add User**
   - Phone: `+201200006637`
   - Email: `admin@flash.local`
   - Password: (أي كلمة مرور)

2. **SQL Editor → نفذ:**
   ```sql
   -- احصل على hash PIN أولاً من الكود
   -- ثم:
   UPDATE profiles
   SET 
     pin_hash = '$2b$10$YOUR_HASH',
     role = 'admin',
     status = 'active'
   WHERE phone = '+201200006637';
   ```

---

### 3️⃣ اختبار

```bash
npm start
```

**افتح المتصفح → تسجيل الدخول:**
- رقم الموبايل: `01200006637`
- PIN: `000000`

✅ يجب أن يعمل!

---

## 🔧 استكشاف الأخطاء

| المشكلة | الحل |
|---------|------|
| "رقم الموبايل غير مسجل" | تأكد من تنفيذ Migration |
| "رمز PIN غير صحيح" | تحقق من `pin_hash` في قاعدة البيانات |
| "Missing environment variables" | أضف `SUPABASE_SERVICE_ROLE_KEY` |

---

**🎉 جاهز!**

