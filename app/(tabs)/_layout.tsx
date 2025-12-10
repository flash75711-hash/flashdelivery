import { useEffect } from 'react';
import { Tabs, Redirect } from 'expo-router';
import { useAuth } from '@/contexts/AuthContext';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';

export default function TabsLayout() {
  const { user, loading } = useAuth();
  const { t } = useTranslation();

  if (loading) {
    return null; // يمكن إضافة شاشة تحميل هنا
  }

  if (!user) {
    return <Redirect href="/(auth)/login" />;
  }

  // تحديد التبويبات حسب الدور
  const getTabs = () => {
    switch (user.role) {
      case 'customer':
        return (
          <>
            <Tabs.Screen
              name="customer/home"
              options={{
                title: t('customer.home'),
                tabBarIcon: ({ color, size }) => (
                  <Ionicons name="home" size={size} color={color} />
                ),
                headerShown: false,
              }}
            />
            <Tabs.Screen
              name="customer/orders"
              options={{
                title: t('customer.orderHistory'),
                tabBarIcon: ({ color, size }) => (
                  <Ionicons name="receipt" size={size} color={color} />
                ),
                headerShown: false,
              }}
            />
            <Tabs.Screen
              name="customer/profile"
              options={{
                title: t('customer.profile'),
                tabBarIcon: ({ color, size }) => (
                  <Ionicons name="person" size={size} color={color} />
                ),
                headerShown: false,
              }}
            />
          </>
        );
      case 'driver':
        return (
          <>
            <Tabs.Screen
              name="driver/dashboard"
              options={{
                title: t('driver.dashboard'),
                tabBarIcon: ({ color, size }) => (
                  <Ionicons name="speedometer" size={size} color={color} />
                ),
                headerShown: false,
              }}
            />
            <Tabs.Screen
              name="driver/trips"
              options={{
                title: t('driver.newTrips'),
                tabBarIcon: ({ color, size }) => (
                  <Ionicons name="map" size={size} color={color} />
                ),
                headerShown: false,
              }}
            />
            <Tabs.Screen
              name="driver/wallet"
              options={{
                title: t('driver.wallet'),
                tabBarIcon: ({ color, size }) => (
                  <Ionicons name="wallet" size={size} color={color} />
                ),
                headerShown: false,
              }}
            />
            <Tabs.Screen
              name="driver/history"
              options={{
                title: t('driver.tripHistory'),
                tabBarIcon: ({ color, size }) => (
                  <Ionicons name="time" size={size} color={color} />
                ),
                headerShown: false,
              }}
            />
          </>
        );
      case 'vendor':
        return (
          <>
            <Tabs.Screen
              name="vendor/store"
              options={{
                title: t('vendor.store'),
                tabBarIcon: ({ color, size }) => (
                  <Ionicons name="storefront" size={size} color={color} />
                ),
                headerShown: false,
              }}
            />
            <Tabs.Screen
              name="vendor/profile"
              options={{
                title: t('vendor.profile'),
                tabBarIcon: ({ color, size }) => (
                  <Ionicons name="person" size={size} color={color} />
                ),
                headerShown: false,
              }}
            />
          </>
        );
      case 'admin':
        return (
          <>
            <Tabs.Screen
              name="admin/dashboard"
              options={{
                title: t('admin.dashboard'),
                tabBarIcon: ({ color, size }) => (
                  <Ionicons name="grid" size={size} color={color} />
                ),
                headerShown: false,
              }}
            />
            <Tabs.Screen
              name="admin/drivers"
              options={{
                title: t('admin.drivers'),
                tabBarIcon: ({ color, size }) => (
                  <Ionicons name="people" size={size} color={color} />
                ),
                headerShown: false,
              }}
            />
            <Tabs.Screen
              name="admin/accounting"
              options={{
                title: t('admin.accounting'),
                tabBarIcon: ({ color, size }) => (
                  <Ionicons name="cash" size={size} color={color} />
                ),
                headerShown: false,
              }}
            />
            <Tabs.Screen
              name="admin/orders"
              options={{
                title: t('admin.allOrders'),
                tabBarIcon: ({ color, size }) => (
                  <Ionicons name="list" size={size} color={color} />
                ),
                headerShown: false,
              }}
            />
            <Tabs.Screen
              name="admin/places"
              options={{
                title: t('admin.places') || 'الأماكن',
                tabBarIcon: ({ color, size }) => (
                  <Ionicons name="location" size={size} color={color} />
                ),
                headerShown: false,
              }}
            />
          </>
        );
      default:
        return <Redirect href="/(auth)/login" />;
    }
  };

  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: '#007AFF',
        tabBarInactiveTintColor: '#999',
        headerShown: false,
      }}
    >
      {getTabs()}
    </Tabs>
  );
}

