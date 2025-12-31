/**
 * سكريبت بسيط لمزامنة مدينة السادات
 * يمكن تشغيله مباشرة من المتصفح أو Node.js
 */

const SUPABASE_URL = 'https://tnwrmybyvimlsamnputn.supabase.co';
const cityName = 'السادات';
const placeTypes = ['mall', 'market', 'area'];

// ملاحظة: هذا السكريبت يحتاج إلى SUPABASE_ANON_KEY
// يمكنك الحصول عليه من Supabase Dashboard > Settings > API

async function syncPlaces(placeType, anonKey) {
  try {
    console.log(`\n🔄 مزامنة ${placeType} لمدينة ${cityName}...`);
    
    const response = await fetch(`${SUPABASE_URL}/functions/v1/sync-places`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${anonKey}`,
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
      console.log(`✅ تم مزامنة ${result.placesCount || 0} مكان`);
      if (result.cached) {
        console.log(`   (من الـ cache)`);
      }
      return result.placesCount || 0;
    } else {
      throw new Error(result.error || 'Unknown error');
    }
  } catch (error) {
    console.error(`❌ خطأ:`, error.message);
    return 0;
  }
}

// للاستخدام في Node.js
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { syncPlaces, cityName, placeTypes };
  
  // إذا تم تشغيله مباشرة
  if (require.main === module) {
    const anonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;
    if (!anonKey) {
      console.error('❌ يرجى تعيين EXPO_PUBLIC_SUPABASE_ANON_KEY');
      process.exit(1);
    }
    
    (async () => {
      console.log('🚀 بدء مزامنة مدينة السادات...\n');
      let total = 0;
      for (const type of placeTypes) {
        const count = await syncPlaces(type, anonKey);
        total += count;
        await new Promise(r => setTimeout(r, 2000));
      }
      console.log(`\n✅ اكتملت! المجموع: ${total} مكان`);
    })();
  }
}

