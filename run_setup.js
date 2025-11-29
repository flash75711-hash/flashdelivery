#!/usr/bin/env node
/**
 * سكريبت Node.js لتنفيذ إعداد قاعدة البيانات تلقائياً
 * Flash Delivery - Database Setup Script
 */

const { Client } = require('pg');
const fs = require('fs');
const path = require('path');

// رابط الاتصال
const DATABASE_URL = "postgresql://postgres:FlashExtra@321@db.tnwrmybyvimlsamnputn.supabase.co:5432/postgres";

function readSqlFile(filename) {
  try {
    return fs.readFileSync(filename, 'utf8');
  } catch (error) {
    console.error(`❌ ملف ${filename} غير موجود!`);
    process.exit(1);
  }
}

async function executeSql(client, sqlContent) {
  try {
    // تقسيم المحتوى إلى استعلامات منفصلة
    const statements = sqlContent
      .split(';')
      .map(s => s.trim())
      .filter(s => s && !s.startsWith('--'));

    let executed = 0;
    for (const statement of statements) {
      try {
        await client.query(statement);
        executed++;
        process.stdout.write(`✅ تم تنفيذ الاستعلام ${executed}\r`);
      } catch (error) {
        // تجاهل الأخطاء المتعلقة بالموجود مسبقاً
        if (!error.message.toLowerCase().includes('already exists') && 
            !error.message.toLowerCase().includes('duplicate')) {
          console.log(`\n⚠️  تحذير: ${error.message.substring(0, 100)}`);
        }
      }
    }
    
    console.log(`\n✅ تم تنفيذ ${executed} استعلام بنجاح!`);
    return true;
  } catch (error) {
    console.error(`❌ خطأ في التنفيذ: ${error.message}`);
    return false;
  }
}

async function main() {
  console.log('='.repeat(60));
  console.log('🚀 Flash Delivery - إعداد قاعدة البيانات');
  console.log('='.repeat(60));

  // قراءة ملف SQL
  console.log('\n📖 قراءة ملف supabase_setup.sql...');
  const sqlContent = readSqlFile('supabase_setup.sql');

  // الاتصال بقاعدة البيانات
  console.log('🔌 الاتصال بقاعدة البيانات...');
  const client = new Client({
    connectionString: DATABASE_URL,
    ssl: {
      rejectUnauthorized: false // مطلوب لـ Supabase
    },
    // إجبار استخدام IPv4
    host: 'db.tnwrmybyvimlsamnputn.supabase.co',
    port: 5432,
    database: 'postgres',
    user: 'postgres',
    password: 'FlashExtra@321',
  });

  try {
    await client.connect();
    console.log('✅ تم الاتصال بنجاح!');

    // تنفيذ الاستعلامات
    console.log('\n⚙️  تنفيذ استعلامات SQL...');
    const success = await executeSql(client, sqlContent);

    await client.end();
    console.log('\n🔌 تم إغلاق الاتصال');

    if (success) {
      console.log('\n' + '='.repeat(60));
      console.log('✅ تم إعداد قاعدة البيانات بنجاح!');
      console.log('='.repeat(60));
      console.log('\n📋 الخطوات التالية:');
      console.log('   1. افتح Supabase Dashboard');
      console.log('   2. اذهب إلى Database > Replication');
      console.log('   3. فعّل Realtime للجداول: orders, profiles, wallets');
      console.log('\n🎉 جاهز للاستخدام!');
    } else {
      console.log('\n❌ حدث خطأ أثناء التنفيذ');
      process.exit(1);
    }
  } catch (error) {
    console.error(`❌ فشل الاتصال: ${error.message}`);
    console.log('\n💡 تأكد من:');
    console.log('   1. تثبيت pg: npm install pg');
    console.log('   2. صحة رابط الاتصال');
    process.exit(1);
  }
}

main();

