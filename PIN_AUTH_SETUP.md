# نظام المصادقة باستخدام PIN - دليل الإعداد

## نظرة عامة

تم تحويل نظام المصادقة من OTP إلى PIN (6 أرقام) مع الميزات التالية:
- تسجيل دخول باستخدام رقم الموبايل + PIN
- تشفير PIN باستخدام bcrypt
- قفل الحساب بعد 5 محاولات فاشلة
- اهتزاز ورسائل Toast خفيفة
- واجهة مستخدم مع 6 خانات PIN و Auto-focus

## خطوات الإعداد

### 1. تحديث قاعدة البيانات

نفذ ملف `pin_auth_migration.sql` في Supabase SQL Editor:

```sql
-- هذا الملف يضيف:
-- - pin_hash (TEXT)
-- - failed_attempts (INTEGER)
-- - locked_until (TIMESTAMP)
```

### 2. إنشاء مستخدم Admin افتراضي

#### الطريقة الأولى: استخدام Edge Function

1. تأكد من وجود Edge Function `create-admin` في `supabase/functions/create-admin/`
2. استدعِ الـ function:

```bash
curl -X POST https://YOUR_PROJECT.supabase.co/functions/v1/create-admin \
  -H "Authorization: Bearer YOUR_SERVICE_ROLE_KEY" \
  -H "Content-Type: application/json"
```

#### الطريقة الثانية: يدوياً في Supabase Dashboard

1. اذهب إلى Authentication > Users
2. أنشئ مستخدم جديد:
   - Phone: `+201200006637`
   - Email: `admin@flash-delivery.local` (مؤقت)
   - Password: (استخدم hash PIN من الكود)

3. في SQL Editor، نفذ:

```sql
-- Hash لـ PIN "000000" (سيتم إنشاؤه من الكود)
UPDATE profiles
SET 
  pin_hash = '$2b$10$YOUR_HASH_HERE', -- استبدل بالـ hash الصحيح
  role = 'admin',
  status = 'active',
  failed_attempts = 0,
  locked_until = NULL
WHERE phone = '+201200006637';
```

#### الطريقة الثالثة: استخدام script Node.js

أنشئ ملف `scripts/create-admin.js`:

```javascript
const bcrypt = require('bcryptjs');
const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function createAdmin() {
  const phone = '+201200006637';
  const pin = '000000';
  const pinHash = await bcrypt.hash(pin, 10);
  
  // إنشاء user في auth.users
  const { data: authData, error: authError } = await supabase.auth.admin.createUser({
    phone: phone,
    email: `admin-${Date.now()}@flash-delivery.local`,
    password: pinHash,
    email_confirm: true,
    phone_confirm: true,
  });
  
  if (authError) {
    console.error('Error creating auth user:', authError);
    return;
  }
  
  // إنشاء profile
  const { error: profileError } = await supabase
    .from('profiles')
    .insert({
      id: authData.user.id,
      phone: phone,
      pin_hash: pinHash,
      role: 'admin',
      status: 'active',
      failed_attempts: 0,
      locked_until: null,
      full_name: 'Admin User',
    });
  
  if (profileError) {
    console.error('Error creating profile:', profileError);
    return;
  }
  
  console.log('Admin user created successfully!');
  console.log('Phone:', phone);
  console.log('PIN:', pin);
}

createAdmin();
```

نفذ الـ script:

```bash
node scripts/create-admin.js
```

### 3. تثبيت المكتبات المطلوبة

```bash
npm install bcryptjs @types/bcryptjs
```

### 4. اختبار النظام

1. افتح التطبيق
2. اذهب إلى صفحة تسجيل الدخول
3. أدخل رقم الموبايل: `01200006637`
4. أدخل PIN: `000000`
5. يجب أن يتم تسجيل الدخول بنجاح

## الملفات المهمة

### الواجهات
- `app/(auth)/login.tsx` - شاشة تسجيل الدخول
- `app/(auth)/register.tsx` - شاشة التسجيل
- `app/(auth)/forgot-pin.tsx` - صفحة نسيان PIN

### المكتبات
- `lib/pinAuth.ts` - منطق المصادقة باستخدام PIN
- `lib/vibration.ts` - وظائف الاهتزاز
- `lib/alert.ts` - رسائل Toast (تم تحديثها)

### المكونات
- `components/PinInput.tsx` - مكون إدخال PIN مع 6 خانات

### قاعدة البيانات
- `pin_auth_migration.sql` - Migration script

### Edge Functions
- `supabase/functions/create-admin/index.ts` - إنشاء Admin user

## الميزات

### تسجيل الدخول
- إدخال رقم الموبايل
- إدخال PIN (6 أرقام) في 6 خانات منفصلة
- Auto-focus بين الخانات
- اهتزاز عند الخطأ/النجاح
- رسائل Toast خفيفة

### التسجيل
- اختيار نوع الحساب (عميل/سائق/مزود خدمة)
- إدخال رقم الموبايل
- إنشاء PIN (6 أرقام)
- تأكيد PIN

### الأمان
- تشفير PIN باستخدام bcrypt (10 rounds)
- قفل الحساب بعد 5 محاولات فاشلة (30 دقيقة)
- إعادة تعيين failed_attempts عند نجاح تسجيل الدخول

### نسيان PIN
- عرض خيارات التواصل (اتصال/واتساب)
- لا يوجد إعادة تعيين تلقائي
- إعادة تعيين يدوي من لوحة تحكم الأدمن

## ملاحظات مهمة

1. **Supabase Auth**: النظام يستخدم Supabase Auth لإنشاء users، لكن المصادقة الفعلية تتم عبر PIN في جدول profiles.

2. **Session Management**: في نظام PIN، قد لا يكون هناك session في Supabase Auth. يتم استخدام user مباشرة من profiles.

3. **Admin User**: يجب إنشاء مستخدم Admin يدوياً أو عبر Edge Function قبل استخدام النظام.

4. **Phone Format**: جميع أرقام الموبايل يتم تنسيقها تلقائياً إلى `+20xxxxxxxxxx`.

5. **Vibration**: يعمل فقط على الأجهزة التي تدعم Web Vibration API (معظم المتصفحات الحديثة).

## استكشاف الأخطاء

### خطأ: "رقم الموبايل غير مسجل"
- تأكد من أن المستخدم موجود في جدول profiles
- تحقق من تنسيق رقم الموبايل

### خطأ: "رمز PIN غير صحيح"
- تحقق من أن PIN hash صحيح في قاعدة البيانات
- تأكد من استخدام bcrypt للتشفير

### خطأ: "الحساب مقفل مؤقتاً"
- انتظر 30 دقيقة أو أعد تعيين failed_attempts و locked_until في قاعدة البيانات

### خطأ: "فشل إنشاء الحساب"
- تحقق من RLS policies في Supabase
- تأكد من وجود service_role key للعمليات الإدارية

## التطوير المستقبلي

- [ ] إضافة إعادة تعيين PIN تلقائياً عبر SMS
- [ ] إضافة Two-Factor Authentication
- [ ] تحسين أمان PIN (إضافة salt إضافي)
- [ ] إضافة سجل محاولات تسجيل الدخول
- [ ] إضافة إشعارات عند قفل الحساب

