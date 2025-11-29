#!/usr/bin/env python3
"""
سكريبت لتنفيذ إعداد قاعدة البيانات تلقائياً
Flash Delivery - Database Setup Script
"""

import psycopg2
import sys
import os

# رابط الاتصال
DATABASE_URL = "postgresql://postgres:FlashExtra@321@db.tnwrmybyvimlsamnputn.supabase.co:5432/postgres"

def read_sql_file(filename):
    """قراءة ملف SQL"""
    try:
        with open(filename, 'r', encoding='utf-8') as f:
            return f.read()
    except FileNotFoundError:
        print(f"❌ ملف {filename} غير موجود!")
        sys.exit(1)

def execute_sql(connection, sql_content):
    """تنفيذ استعلامات SQL"""
    try:
        cursor = connection.cursor()
        
        # تقسيم المحتوى إلى استعلامات منفصلة
        statements = sql_content.split(';')
        
        executed = 0
        for statement in statements:
            statement = statement.strip()
            if statement and not statement.startswith('--'):
                try:
                    cursor.execute(statement)
                    executed += 1
                    print(f"✅ تم تنفيذ الاستعلام {executed}")
                except Exception as e:
                    # تجاهل الأخطاء المتعلقة بالموجود مسبقاً
                    if "already exists" not in str(e).lower() and "duplicate" not in str(e).lower():
                        print(f"⚠️  تحذير: {str(e)[:100]}")
        
        connection.commit()
        cursor.close()
        print(f"\n✅ تم تنفيذ {executed} استعلام بنجاح!")
        return True
        
    except Exception as e:
        print(f"❌ خطأ في التنفيذ: {e}")
        connection.rollback()
        return False

def main():
    print("=" * 60)
    print("🚀 Flash Delivery - إعداد قاعدة البيانات")
    print("=" * 60)
    
    # قراءة ملف SQL
    print("\n📖 قراءة ملف supabase_setup.sql...")
    sql_content = read_sql_file('supabase_setup.sql')
    
    # الاتصال بقاعدة البيانات
    print("🔌 الاتصال بقاعدة البيانات...")
    try:
        # إعدادات الاتصال مع SSL
        conn = psycopg2.connect(
            host='db.tnwrmybyvimlsamnputn.supabase.co',
            port=5432,
            database='postgres',
            user='postgres',
            password='FlashExtra@321',
            sslmode='require'
        )
        print("✅ تم الاتصال بنجاح!")
    except Exception as e:
        print(f"❌ فشل الاتصال: {e}")
        print("\n💡 تأكد من:")
        print("   1. تثبيت psycopg2: pip install psycopg2-binary")
        print("   2. صحة رابط الاتصال")
        sys.exit(1)
    
    # تنفيذ الاستعلامات
    print("\n⚙️  تنفيذ استعلامات SQL...")
    success = execute_sql(conn, sql_content)
    
    # إغلاق الاتصال
    conn.close()
    print("\n🔌 تم إغلاق الاتصال")
    
    if success:
        print("\n" + "=" * 60)
        print("✅ تم إعداد قاعدة البيانات بنجاح!")
        print("=" * 60)
        print("\n📋 الخطوات التالية:")
        print("   1. افتح Supabase Dashboard")
        print("   2. اذهب إلى Database > Replication")
        print("   3. فعّل Realtime للجداول: orders, profiles, wallets")
        print("\n🎉 جاهز للاستخدام!")
    else:
        print("\n❌ حدث خطأ أثناء التنفيذ")
        sys.exit(1)

if __name__ == "__main__":
    main()

