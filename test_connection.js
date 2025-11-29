#!/usr/bin/env node
/**
 * اختبار الاتصال بـ Supabase
 */

const { Client } = require('pg');
const { lookup } = require('dns').promises;

async function getIPv4(hostname) {
  try {
    const addresses = await lookup(hostname, { family: 4 });
    return addresses.address;
  } catch (err) {
    console.log('⚠️  لم يتم العثور على IPv4، استخدام الاسم الأصلي');
    return hostname;
  }
}

async function main() {
  console.log('🔌 محاولة الاتصال...');
  
  const hostname = 'db.tnwrmybyvimlsamnputn.supabase.co';
  
  // محاولة الحصول على IPv4
  let host = hostname;
  try {
    const ipv4 = await getIPv4(hostname);
    if (ipv4 && ipv4 !== hostname) {
      host = ipv4;
      console.log(`📍 استخدام IPv4: ${ipv4}`);
    } else {
      console.log(`📍 استخدام الاسم: ${hostname}`);
      console.log('⚠️  قد تواجه مشكلة في الاتصال عبر IPv6');
      console.log('💡 الحل: استخدم Supabase Dashboard بدلاً من ذلك');
    }
  } catch (err) {
    console.log(`📍 استخدام الاسم: ${hostname}`);
  }
  
  const client = new Client({
    host: host,
    port: 5432,
    database: 'postgres',
    user: 'postgres',
    password: 'FlashExtra@321',
    ssl: {
      rejectUnauthorized: false
    },
    // إجبار استخدام IPv4 إذا أمكن
    connectionTimeoutMillis: 10000
  });

  try {
    await client.connect();
    console.log('✅ تم الاتصال بنجاح!');
    
    const versionRes = await client.query('SELECT version()');
    console.log('✅ قاعدة البيانات متصلة!');
    console.log('📊 إصدار PostgreSQL:', versionRes.rows[0].version.split(',')[0]);
    
    const tablesRes = await client.query(
      "SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' LIMIT 5"
    );
    console.log('📋 الجداول الموجودة:', 
      tablesRes.rows.map(r => r.table_name).join(', ') || 'لا توجد جداول'
    );
    
    await client.end();
    console.log('\n✅ الاتصال يعمل بشكل صحيح!');
    process.exit(0);
  } catch (err) {
    console.error('\n❌ خطأ في الاتصال:', err.message);
    console.error('\n💡 الحلول المقترحة:');
    console.error('   1. ✅ استخدم Supabase Dashboard (الأسهل والأضمن)');
    console.error('      - افتح: https://supabase.com/dashboard');
    console.error('      - SQL Editor → New Query');
    console.error('      - انسخ supabase_setup.sql والصقه');
    console.error('   2. تحقق من اتصال الإنترنت');
    console.error('   3. راجع ملف: مشكلة_الاتصال.md');
    console.error('   4. راجع ملف: تنفيذ_الخطوات.md');
    process.exit(1);
  }
}

main();
