# مزامنة مدينة السادات - دليل سريع

## الطريقة 1: من لوحة الإدارة (الأسهل) ✅

1. افتح التطبيق وتسجيل الدخول كـ admin
2. اذهب إلى: **لوحة الإدارة** → **إعدادات مزامنة الأماكن**
3. ستجد مدينة السادات موجودة
4. اضغط **"مزامنة"** بجانب المدينة
5. سيتم مزامنة جميع الأنواع (مولات، أسواق، مناطق) تلقائياً

## الطريقة 2: من المتصفح (Console)

افتح Console في المتصفح (F12) والصق:

```javascript
// استبدل YOUR_ANON_KEY بمفتاح Supabase Anon Key
const SUPABASE_URL = 'https://tnwrmybyvimlsamnputn.supabase.co';
const ANON_KEY = 'YOUR_ANON_KEY'; // من Supabase Dashboard > Settings > API
const cityName = 'السادات';

async function syncType(type) {
  const res = await fetch(`${SUPABASE_URL}/functions/v1/sync-places`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${ANON_KEY}`,
    },
    body: JSON.stringify({ cityName, placeType: type }),
  });
  const data = await res.json();
  console.log(`${type}: ${data.placesCount || 0} مكان`);
  return data.placesCount || 0;
}

// مزامنة جميع الأنواع
(async () => {
  console.log('🚀 بدء المزامنة...');
  const mall = await syncType('mall');
  await new Promise(r => setTimeout(r, 2000));
  const market = await syncType('market');
  await new Promise(r => setTimeout(r, 2000));
  const area = await syncType('area');
  console.log(`✅ اكتملت! المجموع: ${mall + market + area} مكان`);
})();
```

## الطريقة 3: من Terminal (Node.js)

```bash
# تأكد من وجود EXPO_PUBLIC_SUPABASE_ANON_KEY في .env
node scripts/sync-sadat-city-simple.js
```

## التحقق من النتائج

بعد المزامنة، يمكنك التحقق من:

```sql
-- عدد الأماكن لكل نوع
SELECT 
  type,
  COUNT(*) as count
FROM places
WHERE city = 'السادات'
GROUP BY type;

-- جميع الأماكن
SELECT name, type, address, latitude, longitude
FROM places
WHERE city = 'السادات'
ORDER BY type, name;
```

## ملاحظات

- ✅ مدينة السادات محسّنة تلقائياً (30 نتيجة، 500ms delay)
- ✅ مصطلحات بحث إضافية لتحسين النتائج
- ✅ المزامنة تحدث `last_sync_at` تلقائياً
- ⚠️ Nominatim API قد يحتاج وقت للاستجابة

## استكشاف الأخطاء

### لا توجد نتائج
- تحقق من صحة اسم المدينة (يجب أن يكون "السادات")
- جرب البحث يدوياً في Nominatim: https://nominatim.openstreetmap.org/

### خطأ 401/403
- تحقق من صحة ANON_KEY
- تأكد من أن Edge Function منشور

### خطأ 429 (Rate Limit)
- انتظر دقيقة ثم حاول مرة أخرى
- Nominatim يسمح بـ 1 request/ثانية

