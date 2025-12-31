/**
 * سكريبت لمزامنة مدينة السادات لجميع أنواع الأماكن
 * Usage: node scripts/sync-sadat-city.js
 */

const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL || 'https://tnwrmybyvimlsamnputn.supabase.co';
const SUPABASE_ANON_KEY = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

if (!SUPABASE_ANON_KEY) {
  console.error('❌ EXPO_PUBLIC_SUPABASE_ANON_KEY is required');
  process.exit(1);
}

const cityName = 'السادات';
const placeTypes = ['mall', 'market', 'area'];

async function syncPlaces(placeType) {
  try {
    console.log(`\n🔄 بدء مزامنة ${placeType} لمدينة ${cityName}...`);
    
    const response = await fetch(`${SUPABASE_URL}/functions/v1/sync-places`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
      },
      body: JSON.stringify({
        cityName,
        placeType,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`HTTP ${response.status}: ${errorText}`);
    }

    const result = await response.json();
    
    if (result.success) {
      console.log(`✅ تم مزامنة ${result.placesCount || 0} مكان من نوع ${placeType}`);
      if (result.cached) {
        console.log(`   (من الـ cache - تم التحديث مؤخراً)`);
      }
      return result.placesCount || 0;
    } else {
      throw new Error(result.error || 'Unknown error');
    }
  } catch (error) {
    console.error(`❌ خطأ في مزامنة ${placeType}:`, error.message);
    return 0;
  }
}

async function updateLastSyncAt() {
  try {
    // ملاحظة: هذا يتطلب Service Role Key، لكن يمكن تجاهله
    // لأن Edge Function يحدث last_sync_at تلقائياً
    console.log('\n📝 سيتم تحديث last_sync_at تلقائياً من Edge Function');
  } catch (error) {
    console.warn('⚠️  لم يتم تحديث last_sync_at:', error.message);
  }
}

async function main() {
  console.log('🚀 بدء مزامنة مدينة السادات...\n');
  console.log(`📍 المدينة: ${cityName}`);
  console.log(`📦 الأنواع: ${placeTypes.join(', ')}\n`);

  const results = {};
  let totalPlaces = 0;

  for (const placeType of placeTypes) {
    const count = await syncPlaces(placeType);
    results[placeType] = count;
    totalPlaces += count;
    
    // تأخير بين الأنواع لتجنب rate limit
    if (placeType !== placeTypes[placeTypes.length - 1]) {
      await new Promise(resolve => setTimeout(resolve, 2000));
    }
  }

  console.log('\n' + '='.repeat(50));
  console.log('📊 ملخص النتائج:');
  console.log('='.repeat(50));
  console.log(`   مولات: ${results.mall || 0}`);
  console.log(`   أسواق: ${results.market || 0}`);
  console.log(`   مناطق: ${results.area || 0}`);
  console.log(`   المجموع: ${totalPlaces} مكان`);
  console.log('='.repeat(50));
  console.log('\n✅ اكتملت المزامنة!');
}

main().catch(error => {
  console.error('❌ خطأ عام:', error);
  process.exit(1);
});

