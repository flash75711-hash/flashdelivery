#!/bin/bash

# 🧪 اختبار سريع لإرسال Push Notification
# 
# الاستخدام:
# bash test_push_notification.sh

# ⚠️ استبدل SERVICE_ROLE_KEY بقيمة Service Role Key من Supabase Dashboard
SERVICE_ROLE_KEY="YOUR_SERVICE_ROLE_KEY_HERE"

# معلومات Supabase
SUPABASE_URL="https://tnwrmybyvimlsamnputn.supabase.co"

# Driver ID للسائق "تاتات" (من الاستعلام السابق)
DRIVER_ID="6426591d-b457-49e0-9674-4cb769969d19"

echo "🧪 بدء اختبار Push Notification..."
echo "📱 Driver ID: $DRIVER_ID"
echo "🔗 Supabase URL: $SUPABASE_URL"
echo ""

# التحقق من Service Role Key
if [ "$SERVICE_ROLE_KEY" = "YOUR_SERVICE_ROLE_KEY_HERE" ]; then
  echo "❌ خطأ: يجب استبدال SERVICE_ROLE_KEY بقيمة Service Role Key من Supabase Dashboard"
  echo "📍 الحصول على Service Role Key:"
  echo "   1. اذهب إلى Supabase Dashboard"
  echo "   2. Settings → API"
  echo "   3. انسخ Service Role Key"
  exit 1
fi

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
echo "📊 النتيجة:"
echo "HTTP Status: $HTTP_CODE"
echo "Response Body:"
echo "$BODY" | jq '.' 2>/dev/null || echo "$BODY"

# التحقق من النتيجة
if [ "$HTTP_CODE" = "200" ]; then
  # التحقق من أن sent > 0
  SENT=$(echo "$BODY" | jq -r '.sent // 0' 2>/dev/null || echo "0")
  if [ "$SENT" -gt 0 ]; then
    echo ""
    echo "✅ تم إرسال Push Notification بنجاح!"
    echo "📱 يجب أن يتلقى السائق الإشعار على جهازه"
    exit 0
  else
    echo ""
    echo "⚠️ الطلب نجح لكن لم يتم إرسال الإشعار"
    echo "📝 تحقق من:"
    echo "   - FCM token صحيح في قاعدة البيانات"
    echo "   - FCM_SERVICE_ACCOUNT_JSON مضبوط في Edge Function secrets"
    exit 1
  fi
else
  echo ""
  echo "❌ فشل إرسال Push Notification"
  echo "📝 تحقق من:"
  echo "   - Service Role Key صحيح"
  echo "   - Edge Function موجودة ومفعلة"
  exit 1
fi
