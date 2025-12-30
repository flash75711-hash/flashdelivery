# 🚀 تنفيذ الآن - خطوات مباشرة

## الخطوة 1: Migration SQL

**افتح Supabase → SQL Editor → انسخ والصق:**

```sql
-- ============================================
-- Flash Delivery - Migration to PIN Authentication
-- ============================================

-- 1. إضافة أعمدة PIN
ALTER TABLE profiles 
ADD COLUMN IF NOT EXISTS pin_hash TEXT,
ADD COLUMN IF NOT EXISTS failed_attempts INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS locked_until TIMESTAMP WITH TIME ZONE;

-- 2. إنشاء index
CREATE INDEX IF NOT EXISTS idx_profiles_phone ON profiles(phone) WHERE phone IS NOT NULL;

-- 3. Functions لإدارة failed_attempts
CREATE OR REPLACE FUNCTION increment_failed_attempts(user_phone TEXT)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  current_attempts INTEGER;
  lock_duration INTERVAL := '30 minutes';
BEGIN
  UPDATE profiles
  SET 
    failed_attempts = failed_attempts + 1,
    locked_until = CASE 
      WHEN failed_attempts + 1 >= 5 THEN NOW() + lock_duration
      ELSE locked_until
    END
  WHERE phone = user_phone
  RETURNING failed_attempts INTO current_attempts;
END;
$$;

CREATE OR REPLACE FUNCTION reset_failed_attempts(user_phone TEXT)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  UPDATE profiles
  SET 
    failed_attempts = 0,
    locked_until = NULL
  WHERE phone = user_phone;
END;
$$;

CREATE OR REPLACE FUNCTION is_account_locked(user_phone TEXT)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  lock_time TIMESTAMP WITH TIME ZONE;
BEGIN
  SELECT locked_until INTO lock_time
  FROM profiles
  WHERE phone = user_phone;
  
  IF lock_time IS NULL THEN
    RETURN FALSE;
  END IF;
  
  IF lock_time > NOW() THEN
    RETURN TRUE;
  ELSE
    UPDATE profiles
    SET locked_until = NULL, failed_attempts = 0
    WHERE phone = user_phone;
    RETURN FALSE;
  END IF;
END;
$$;
```

**✅ اضغط Run**

---

## الخطوة 2: إنشاء Admin

**في Terminal:**

```bash
# تأكد من وجود .env أو متغيرات البيئة
node scripts/create-admin.js
```

**أو يدوياً:**

1. Supabase → Authentication → Users → Add User
   - Phone: `+201200006637`
   - Email: `admin@flash.local`
   - Password: (أي شيء)

2. SQL Editor:
   ```sql
   -- أولاً احصل على hash من الكود أو استخدم:
   -- node -e "const bcrypt=require('bcryptjs'); bcrypt.hash('000000',10).then(h=>console.log(h))"
   
   UPDATE profiles
   SET 
     pin_hash = '$2b$10$YOUR_HASH_HERE',
     role = 'admin',
     status = 'active',
     failed_attempts = 0,
     locked_until = NULL
   WHERE phone = '+201200006637';
   ```

---

## الخطوة 3: اختبار

```bash
npm start
```

**افتح:** `http://localhost:8081`

**تسجيل الدخول:**
- Phone: `01200006637`
- PIN: `000000`

---

✅ **تم!**
