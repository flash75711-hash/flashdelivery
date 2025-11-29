import { useEffect, useState } from 'react';
import { Redirect, useRouter } from 'expo-router';
import { useAuth } from '@/contexts/AuthContext';
import { isRegistrationComplete } from '@/lib/supabase';
import { View, ActivityIndicator, StyleSheet } from 'react-native';

export default function Index() {
  const { user, loading } = useAuth();
  const [checkingRegistration, setCheckingRegistration] = useState(false);
  const [needsCompletion, setNeedsCompletion] = useState(false);
  const router = useRouter();

  useEffect(() => {
    const checkRegistration = async () => {
      if (user && !loading && !checkingRegistration) {
        setCheckingRegistration(true);
        try {
          const isComplete = await isRegistrationComplete(user.id);
          if (!isComplete) {
            setNeedsCompletion(true);
          }
        } catch (error) {
          console.error('Error checking registration:', error);
        } finally {
          setCheckingRegistration(false);
        }
      }
    };

    checkRegistration();
  }, [user, loading]);

  if (loading || checkingRegistration) {
    return (
      <View style={styles.container}>
        <ActivityIndicator size="large" color="#007AFF" />
      </View>
    );
  }

  if (user && needsCompletion) {
    return <Redirect href={`/(auth)/complete-registration/${user.role}?email=${encodeURIComponent(user.email || '')}`} />;
  }

  if (user) {
    return <Redirect href="/(tabs)" />;
  }

  return <Redirect href="/(auth)/login" />;
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#fff',
  },
});

