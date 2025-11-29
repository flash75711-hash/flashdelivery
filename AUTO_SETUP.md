# 🤖 الإعداد التلقائي لقاعدة البيانات

لديك رابط اتصال بقاعدة البيانات. يمكنك استخدام أحد الطرق التالية:

## 🚀 الطريقة 1: استخدام Python (موصى به)

### 1. تثبيت المكتبة المطلوبة:
```bash
pip install psycopg2-binary
```

### 2. تشغيل السكريبت:
```bash
python3 run_setup.py
```

## 🚀 الطريقة 2: استخدام Node.js

### 1. تثبيت المكتبة المطلوبة:
```bash
npm install pg
```

### 2. تشغيل السكريبت:
```bash
node run_setup.js
```

## 🚀 الطريقة 3: استخدام Bash (إذا كان psql مثبت)

```bash
./setup_database.sh
```

## 🚀 الطريقة 4: استخدام psql مباشرة

```bash
psql "postgresql://postgres:FlashExtra@321@db.tnwrmybyvimlsamnputn.supabase.co:5432/postgres" -f supabase_setup.sql
```

## 🚀 الطريقة 5: النسخ واللصق اليدوي (الأسهل)

1. افتح [Supabase Dashboard](https://supabase.com/dashboard)
2. اختر مشروعك
3. اذهب إلى **SQL Editor** → **New Query**
4. افتح ملف `supabase_setup.sql`
5. انسخ جميع المحتوى والصقه
6. اضغط **Run**

## ⚙️ بعد التنفيذ

### 1. تفعيل Realtime:
1. في Supabase Dashboard
2. اذهب إلى **Database** → **Replication**
3. فعّل Realtime للجداول:
   - ✅ `orders`
   - ✅ `profiles`
   - ✅ `wallets`

### 2. التحقق من الإعداد:
```bash
# باستخدام Python
python3 -c "
import psycopg2
conn = psycopg2.connect('postgresql://postgres:FlashExtra@321@db.tnwrmybyvimlsamnputn.supabase.co:5432/postgres')
cur = conn.cursor()
cur.execute(\"SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' AND table_name IN ('profiles', 'vendors', 'orders', 'wallets', 'driver_locations')\")
tables = cur.fetchall()
print('✅ الجداول المنشأة:', [t[0] for t in tables])
conn.close()
"
```

## 📋 معلومات الاتصال

```
Host: db.tnwrmybyvimlsamnputn.supabase.co
Port: 5432
Database: postgres
User: postgres
Password: FlashExtra@321
```

## ⚠️ ملاحظات أمنية

- ⚠️ **لا تشارك** رابط الاتصال هذا مع أحد
- ⚠️ احفظه في مكان آمن
- ⚠️ يمكنك تغيير كلمة المرور من Supabase Dashboard

## ✅ جاهز!

بعد التنفيذ، التطبيق جاهز للعمل! 🎉

