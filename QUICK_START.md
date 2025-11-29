# دليل البدء السريع

## الخطوات السريعة

### 1. تثبيت الحزم
```bash
npm install
```

### 2. إعداد Supabase
- انسخ مفاتيح Supabase من ملف `note` إلى `.env`
- أو أنشئ ملف `.env` جديد وأضف:
  ```
  EXPO_PUBLIC_SUPABASE_URL=your_url
  EXPO_PUBLIC_SUPABASE_ANON_KEY=your_key
  ```

### 3. إعداد قاعدة البيانات
- افتح Supabase Dashboard
- اذهب إلى SQL Editor
- انسخ وألصق الكود من `DATABASE_SETUP.md`
- نفذ جميع الاستعلامات

### 4. إنشاء حساب مدير
```sql
-- بعد إنشاء حساب في التطبيق، قم بتحديث دوره:
UPDATE profiles 
SET role = 'admin' 
WHERE email = 'your_admin_email@example.com';
```

### 5. تشغيل التطبيق
```bash
npm start
```

## اختبار الأدوار

### عميل (Customer)
- سجل حساب جديد واختر "عميل"
- جرب إنشاء طلب توصيل أو طلب من متجر

### سائق (Driver)
- سجل حساب جديد واختر "سائق"
- أو قم بتحديث دور مستخدم موجود:
  ```sql
  UPDATE profiles SET role = 'driver' WHERE email = 'driver@example.com';
  ```

### مزود خدمة (Vendor)
- سجل حساب جديد واختر "مزود خدمة"
- أضف معلومات المتجر

### مدير (Admin)
- قم بتحديث دور مستخدم:
  ```sql
  UPDATE profiles SET role = 'admin' WHERE email = 'admin@example.com';
  ```

## ملاحظات

- تأكد من تفعيل Realtime في Supabase
- أضف الأيقونات في مجلد `assets/`
- التطبيق جاهز للعمل على Android و iOS

