import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from 'jsr:@supabase/supabase-js@2';

Deno.serve(async (req) => {
  try {
    const { user, sms } = await req.json();
    
    console.log('Sending SMS to:', user.phone);
    console.log('OTP:', sms.otp);
    
    // إعدادات Msegat
    const msegatApiKey = Deno.env.get('MSEGAT_API_KEY');
    const msegatUsername = Deno.env.get('MSEGAT_USERNAME');
    const msegatSenderName = Deno.env.get('MSEGAT_SENDER_NAME') || 'FlashDelivery';
    
    if (!msegatApiKey || !msegatUsername) {
      console.error('Msegat credentials not configured');
      throw new Error('SMS provider not configured');
    }
    
    // تنسيق رقم الهاتف (إزالة +)
    const phoneNumber = user.phone.replace('+', '');
    
    // إرسال SMS عبر Msegat API
    const msegatUrl = 'https://www.msegat.com/gw/sendsms.php';
    
    const response = await fetch(msegatUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        userName: msegatUsername,
        apiKey: msegatApiKey,
        numbers: phoneNumber,
        userSender: msegatSenderName,
        msg: `رمز التحقق الخاص بك هو: ${sms.otp}`,
        msgEncoding: 'UTF8',
      }),
    });
    
    const result = await response.json();
    
    console.log('Msegat API response:', result);
    
    if (result.code === '1' || result.status === 'success') {
      return new Response(JSON.stringify({ success: true }), {
        headers: { 'Content-Type': 'application/json' },
        status: 200,
      });
    } else {
      console.error('Msegat API error:', result);
      throw new Error(`Msegat API error: ${result.message || result.error || 'Unknown error'}`);
    }
  } catch (error) {
    console.error('Error sending SMS:', error);
    return new Response(
      JSON.stringify({ error: error.message || 'Failed to send SMS' }),
      {
        headers: { 'Content-Type': 'application/json' },
        status: 500,
      }
    );
  }
});

