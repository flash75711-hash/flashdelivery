import { calculateDistance } from './locationUtils';

/**
 * حساب سعر التوصيل بناءً على:
 * - أول طلب في نطاق 3 كيلومتر = 25 جنيه
 * - كل طلب زيادة = +5 جنيه
 * - كل كيلومتر زيادة = +5 جنيه
 * 
 * @param ordersCount عدد الطلبات
 * @param totalDistance المسافة الإجمالية بالكيلومتر (من أقرب سائق لأبعد مكان + من أبعد مكان لمكان العميل)
 * @returns السعر الأساسي
 */
export function calculateDeliveryPrice(
  ordersCount: number,
  totalDistance: number
): number {
  // السعر الأساسي لأول طلب في نطاق 3 كيلومتر
  const basePrice = 25;
  
  // حساب تكلفة الطلبات الإضافية (كل طلب زيادة = +5 جنيه)
  const additionalOrdersPrice = ordersCount > 1 ? (ordersCount - 1) * 5 : 0;
  
  // حساب تكلفة الكيلومترات الإضافية (كل كيلومتر زيادة عن 3 = +5 جنيه)
  const additionalDistance = Math.max(0, totalDistance - 3);
  const additionalDistancePrice = additionalDistance * 5;
  
  const totalPrice = basePrice + additionalOrdersPrice + additionalDistancePrice;
  
  console.log(`💰 حساب السعر:`);
  console.log(`  - السعر الأساسي (أول طلب في 3 كم): ${basePrice} ج.م`);
  console.log(`  - عدد الطلبات: ${ordersCount}`);
  console.log(`  - تكلفة الطلبات الإضافية: ${additionalOrdersPrice} ج.م`);
  console.log(`  - المسافة الإجمالية: ${totalDistance.toFixed(2)} كم`);
  console.log(`  - المسافة الإضافية (فوق 3 كم): ${additionalDistance.toFixed(2)} كم`);
  console.log(`  - تكلفة المسافة الإضافية: ${additionalDistancePrice} ج.م`);
  console.log(`  - السعر الإجمالي: ${totalPrice} ج.م`);
  
  return Math.round(totalPrice);
}

/**
 * حساب المسافة الإجمالية للطلب:
 * - من أبعد مكان → المكان التالي → المكان التالي → ... → مكان العميل
 * 
 * @param placesOrdered الأماكن مرتبة من الأبعد للأقرب (من أبعد مكان لمكان العميل)
 * @param customerLocation موقع العميل
 * @returns المسافة الإجمالية بالكيلومتر
 */
export function calculateTotalDistance(
  placesOrdered: Array<{ lat: number; lon: number }>,
  customerLocation: { lat: number; lon: number }
): number {
  let totalDistance = 0;
  
  if (placesOrdered.length === 0) {
    return 0;
  }
  
  // المسافة من أبعد مكان للمكان التالي، ثم التالي، إلخ
  for (let i = 0; i < placesOrdered.length - 1; i++) {
    const distance = calculateDistance(
      placesOrdered[i].lat,
      placesOrdered[i].lon,
      placesOrdered[i + 1].lat,
      placesOrdered[i + 1].lon
    ) / 1000; // تحويل من متر إلى كيلومتر
    totalDistance += distance;
    console.log(`📏 المسافة من المكان ${i + 1} للمكان ${i + 2}: ${distance.toFixed(2)} كم`);
  }
  
  // المسافة من آخر مكان لمكان العميل
  const lastPlaceToCustomer = calculateDistance(
    placesOrdered[placesOrdered.length - 1].lat,
    placesOrdered[placesOrdered.length - 1].lon,
    customerLocation.lat,
    customerLocation.lon
  ) / 1000; // تحويل من متر إلى كيلومتر
  
  totalDistance += lastPlaceToCustomer;
  console.log(`📏 المسافة من آخر مكان لمكان العميل: ${lastPlaceToCustomer.toFixed(2)} كم`);
  console.log(`📏 المسافة الإجمالية: ${totalDistance.toFixed(2)} كم`);
  
  return totalDistance;
}

/**
 * إنشاء اقتراحات أسعار للتفاوض
 * يقترح 4 اختيارات فوق السعر الأصلي (كل واحد +5 جنيه)
 * 
 * @param basePrice السعر الأساسي
 * @returns قائمة بالأسعار المقترحة
 */
export function generatePriceSuggestions(basePrice: number): number[] {
  const suggestions: number[] = [];
  
  // 4 اقتراحات: السعر الأصلي + 5، +10، +15، +20
  for (let i = 1; i <= 4; i++) {
    suggestions.push(basePrice + (i * 5));
  }
  
  return suggestions;
}

/**
 * إيجاد أبعد مكان من مكان العميل
 * 
 * @param places مواقع الأماكن المختارة
 * @param customerLocation موقع العميل
 * @returns أبعد مكان أو null
 */
export function findFarthestPlaceFromCustomer(
  places: Array<{ latitude?: number; longitude?: number }>,
  customerLocation: { lat: number; lon: number }
): { lat: number; lon: number } | null {
  if (places.length === 0) {
    return null;
  }
  
  const validPlaces = places.filter(p => p.latitude && p.longitude);
  if (validPlaces.length === 0) {
    return null;
  }
  
  // إذا كان هناك مكان واحد فقط، نرجعه
  if (validPlaces.length === 1) {
    return { lat: validPlaces[0].latitude!, lon: validPlaces[0].longitude! };
  }
  
  // إيجاد أبعد مكان من مكان العميل
  let farthestPlace: { lat: number; lon: number } | null = null;
  let maxDistance = 0;
  
  validPlaces.forEach(place => {
    const distance = calculateDistance(
      customerLocation.lat,
      customerLocation.lon,
      place.latitude!,
      place.longitude!
    );
    
    if (distance > maxDistance) {
      maxDistance = distance;
      farthestPlace = { lat: place.latitude!, lon: place.longitude! };
    }
  });
  
  return farthestPlace;
}

/**
 * ترتيب الأماكن من الأبعد للأقرب (من أبعد مكان لمكان العميل)
 * 
 * @param places مواقع الأماكن المختارة
 * @param customerLocation موقع العميل
 * @returns الأماكن مرتبة من الأبعد للأقرب
 */
export function orderPlacesByDistance(
  places: Array<{ latitude?: number; longitude?: number }>,
  customerLocation: { lat: number; lon: number }
): Array<{ lat: number; lon: number }> {
  const validPlaces = places
    .filter(p => p.latitude && p.longitude)
    .map(p => ({ lat: p.latitude!, lon: p.longitude! }));
  
  if (validPlaces.length === 0) {
    return [];
  }
  
  // ترتيب الأماكن حسب المسافة من مكان العميل (من الأبعد للأقرب)
  const placesWithDistance = validPlaces.map(place => ({
    place,
    distance: calculateDistance(
      customerLocation.lat,
      customerLocation.lon,
      place.lat,
      place.lon
    )
  }));
  
  placesWithDistance.sort((a, b) => b.distance - a.distance); // ترتيب تنازلي (من الأبعد للأقرب)
  
  return placesWithDistance.map(item => item.place);
}

