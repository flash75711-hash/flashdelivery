import { Redirect } from 'expo-router';
import { useAuth } from '@/contexts/AuthContext';
import { View, ActivityIndicator, StyleSheet } from 'react-native';

export default function TabsIndex() {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <View style={styles.container}>
        <ActivityIndicator size="large" color="#007AFF" />
      </View>
    );
  }

  if (!user) {
    return <Redirect href="/(auth)/login" />;
  }

  // التوجيه حسب دور المستخدم
  switch (user.role) {
    case 'customer':
      return <Redirect href="/(tabs)/customer/home" />;
    case 'driver':
      return <Redirect href="/(tabs)/driver/dashboard" />;
    case 'vendor':
      return <Redirect href="/(tabs)/vendor/store" />;
    case 'admin':
      return <Redirect href="/(tabs)/admin/dashboard" />;
    default:
      return <Redirect href="/(auth)/login" />;
  }
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#fff',
  },
});











