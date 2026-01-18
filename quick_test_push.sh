#!/bin/bash

# 🚀 اختبار سريع لـ Push Notification
# 
# الاستخدام:
# 1. احصل على Service Role Key من Supabase Dashboard → Settings → API
# 2. شغّل: bash quick_test_push.sh YOUR_SERVICE_ROLE_KEY

if [ -z "$1" ]; then
  echo "❌ خطأ: يجب توفير Service Role Key"
  echo ""
  echo "الاستخدام:"
  echo "  bash quick_test_push.sh YOUR_SERVICE_ROLE_KEY"
  echo ""
  echo "للحصول على Service Role Key:"
  echo "  1. اذهب إلى Supabase Dashboard"
  echo "  2. Settings → API"
  echo "  3. انسخ Service Role Key"
  exit 1
fi

SERVICE_ROLE_KEY="$1"
SUPABASE_URL="https://tnwrmybyvimlsamnputn.supabase.co"
DRIVER_ID="6426591d-b457-49e0-9674-4cb769969d19"  # تاتات

echo "🧪 اختبار Push Notification..."
echo "📱 Driver ID: $DRIVER_ID"
echo "🔗 URL: $SUPABASE_URL/functions/v1/send-push-notification"
echo ""

# إرسال Push Notification
echo "📤 إرسال Push Notification..."
RESPONSE=$(curl -s -w "\n%{http_code}" -X POST "${SUPABASE_URL}/functions/v1/send-push-notification" \
  -H "Authorization: Bearer ${SERVICE_ROLE_KEY}" \
  -H "X-Internal-Call: true" \
  -H "Content-Type: application/json" \
  -d "{
    \"user_id\": \"${DRIVER_ID}\",
    \"title\": \"اختبار Push Notification\",
    \"message\": \"هذا اختبار لإرسال Push Notification. إذا وصلت هذه الرسالة، فالنظام يعمل بشكل صحيح!\",
    \"data\": {
      \"order_id\": \"test-order-$(date +%s)\",
      \"test\": \"true\"
    }
  }")

# فصل الـ response body من status code
HTTP_CODE=$(echo "$RESPONSE" | tail -n1)
BODY=$(echo "$RESPONSE" | sed '$d')

echo ""
echo "════════════════════════════════════════"
echo "📊 النتيجة:"
echo "════════════════════════════════════════"
echo "HTTP Status Code: $HTTP_CODE"
echo ""
echo "Response Body:"
if command -v jq &> /dev/null; then
  echo "$BODY" | jq '.' 2>/dev/null || echo "$BODY"
else
  echo "$BODY"
fi
echo "════════════════════════════════════════"
echo ""

# التحقق من النتيجة
if [ "$HTTP_CODE" = "200" ]; then
  # التحقق من أن sent > 0
  if echo "$BODY" | grep -q '"sent":\s*[1-9]'; then
    echo "✅ تم إرسال Push Notification بنجاح!"
    echo "📱 يجب أن يتلقى السائق الإشعار على جهازه"
    echo ""
    echo "📝 الخطوات التالية:"
    echo "  1. تحقق من Edge Function Logs في Supabase Dashboard"
    echo "  2. تحقق من جهاز السائق (يجب أن يصل الإشعار)"
    exit 0
  else
    echo "⚠️ الطلب نجح لكن لم يتم إرسال الإشعار"
    echo ""
    echo "📝 الأسباب المحتملة:"
    echo "  - FCM token غير صحيح أو منتهي الصلاحية"
    echo "  - FCM_SERVICE_ACCOUNT_JSON غير مضبوط"
    echo "  - Service Account لا يملك صلاحيات Firebase Cloud Messaging"
    exit 1
  fi
else
  echo "❌ فشل إرسال Push Notification"
  echo ""
  echo "📝 الأسباب المحتملة:"
  echo "  - Service Role Key غير صحيح"
  echo "  - Edge Function غير موجودة أو معطلة"
  echo "  - خطأ في الإعدادات"
  echo ""
  echo "🔍 تحقق من Edge Function Logs في Supabase Dashboard للخطأ الدقيق"
  exit 1
fi
