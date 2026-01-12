/**
 * اختبار Edge Function start-order-search
 * 
 * Usage:
 * node test_start_order_search.js ORDER_ID LAT LON
 * 
 * Example:
 * node test_start_order_search.js "123e4567-e89b-12d3-a456-426614174000" 24.7136 46.6753
 */

const SUPABASE_URL = process.env.SUPABASE_URL || 'YOUR_SUPABASE_URL';
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || 'YOUR_SERVICE_ROLE_KEY';

async function testStartOrderSearch(orderId, lat, lon) {
  console.log('🧪 Testing start-order-search Edge Function...\n');
  console.log('Parameters:');
  console.log(`  - Order ID: ${orderId}`);
  console.log(`  - Search Point: (${lat}, ${lon})`);
  console.log(`  - Initial Radius: 5 km`);
  console.log(`  - Initial Duration: 30 seconds\n`);

  try {
    const response = await fetch(`${SUPABASE_URL}/functions/v1/start-order-search`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        order_id: orderId,
        search_point: {
          lat: parseFloat(lat),
          lon: parseFloat(lon),
        },
      }),
    });

    const result = await response.json();
    
    console.log('Response Status:', response.status);
    console.log('Response Body:', JSON.stringify(result, null, 2));
    
    if (response.ok && result.success) {
      console.log('\n✅ Test PASSED: Edge Function executed successfully');
      console.log('\n📋 Next Steps:');
      console.log('1. Check Supabase Dashboard → Edge Functions → Logs');
      console.log('2. Look for [start-order-search] logs');
      console.log('3. Verify push notifications were sent');
      console.log('4. Check driver devices for push notifications');
    } else {
      console.log('\n❌ Test FAILED:');
      console.log('Error:', result.error || 'Unknown error');
    }
  } catch (error) {
    console.error('\n❌ Test FAILED with exception:');
    console.error(error);
  }
}

// Get command line arguments
const args = process.argv.slice(2);

if (args.length < 3) {
  console.error('Usage: node test_start_order_search.js ORDER_ID LAT LON');
  console.error('Example: node test_start_order_search.js "123e4567-e89b-12d3-a456-426614174000" 24.7136 46.6753');
  process.exit(1);
}

const [orderId, lat, lon] = args;

// Validate inputs
if (!orderId || !lat || !lon) {
  console.error('Error: All parameters are required');
  process.exit(1);
}

if (isNaN(parseFloat(lat)) || isNaN(parseFloat(lon))) {
  console.error('Error: LAT and LON must be valid numbers');
  process.exit(1);
}

testStartOrderSearch(orderId, lat, lon);
