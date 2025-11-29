#!/bin/bash
# سكريبت Bash لتنفيذ إعداد قاعدة البيانات
# Flash Delivery - Database Setup Script

echo "============================================================"
echo "🚀 Flash Delivery - إعداد قاعدة البيانات"
echo "============================================================"

# رابط الاتصال
DB_URL="postgresql://postgres:FlashExtra@321@db.tnwrmybyvimlsamnputn.supabase.co:5432/postgres"

# التحقق من وجود ملف SQL
if [ ! -f "supabase_setup.sql" ]; then
    echo "❌ ملف supabase_setup.sql غير موجود!"
    exit 1
fi

echo ""
echo "📖 قراءة ملف supabase_setup.sql..."
echo "🔌 الاتصال بقاعدة البيانات..."

# تنفيذ SQL باستخدام psql
if command -v psql &> /dev/null; then
    psql "$DB_URL" -f supabase_setup.sql
    if [ $? -eq 0 ]; then
        echo ""
        echo "============================================================"
        echo "✅ تم إعداد قاعدة البيانات بنجاح!"
        echo "============================================================"
        echo ""
        echo "📋 الخطوات التالية:"
        echo "   1. افتح Supabase Dashboard"
        echo "   2. اذهب إلى Database > Replication"
        echo "   3. فعّل Realtime للجداول: orders, profiles, wallets"
        echo ""
        echo "🎉 جاهز للاستخدام!"
    else
        echo "❌ حدث خطأ أثناء التنفيذ"
        exit 1
    fi
else
    echo "❌ psql غير مثبت!"
    echo ""
    echo "💡 يمكنك:"
    echo "   1. تثبيت PostgreSQL client"
    echo "   2. أو استخدام Python script: python3 run_setup.py"
    echo "   3. أو استخدام Node.js script: node run_setup.js"
    echo "   4. أو نسخ supabase_setup.sql إلى Supabase SQL Editor"
    exit 1
fi

