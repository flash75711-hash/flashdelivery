import { Stack } from 'expo-router';

export default function CompleteRegistrationLayout() {
  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="customer" />
      <Stack.Screen name="driver" />
      <Stack.Screen name="vendor" />
    </Stack>
  );
}

