# ⚡ تنفيذ الإعداد الآن

## 🎯 الطريقة الأسرع (موصى به)

### استخدام Node.js (جاهز الآن):

```bash
# تم تثبيت المكتبة بالفعل
node run_setup.js
```

## 🔄 أو استخدام Python (إذا كان pip3 متوفر):

```bash
# تثبيت المكتبة
pip3 install psycopg2-binary

# تشغيل السكريبت
python3 run_setup.py
```

## 📋 أو النسخ اليدوي (الأسهل والأضمن):

1. افتح ملف `supabase_setup.sql`
2. انسخ جميع المحتوى (Ctrl+A ثم Ctrl+C)
3. افتح [Supabase Dashboard](https://supabase.com/dashboard)
4. اذهب إلى **SQL Editor** → **New Query**
5. الصق المحتوى (Ctrl+V)
6. اضغط **Run**

## ⚙️ بعد التنفيذ:

### 1. تفعيل Realtime:
- في Supabase Dashboard
- **Database** → **Replication**
- فعّل Realtime لـ:
  - ✅ `orders`
  - ✅ `profiles`
  - ✅ `wallets`

### 2. التحقق:
```bash
node -e "
const { Client } = require('pg');
const client = new Client({
  connectionString: 'postgresql://postgres:FlashExtra@321@db.tnwrmybyvimlsamnputn.supabase.co:5432/postgres'
});
client.connect().then(() => {
  return client.query(\"SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' AND table_name IN ('profiles', 'vendors', 'orders', 'wallets', 'driver_locations') ORDER BY table_name\");
}).then(res => {
  console.log('✅ الجداول المنشأة:', res.rows.map(r => r.table_name).join(', '));
  client.end();
}).catch(err => {
  console.error('❌ خطأ:', err.message);
  process.exit(1);
});
"
```

## ✅ جاهز!

بعد التنفيذ، شغّل التطبيق:
```bash
npm start
```

