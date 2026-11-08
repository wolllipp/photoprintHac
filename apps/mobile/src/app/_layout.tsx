import { Pacifico_400Regular, useFonts } from '@expo-google-fonts/pacifico';
import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';

import { StoreProvider } from '@/data/store';
import { colors } from '@/theme';

SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  const [loaded, error] = useFonts({ Pacifico_400Regular });

  useEffect(() => {
    if (loaded || error) SplashScreen.hideAsync();
  }, [loaded, error]);

  if (!loaded && !error) return null;

  return (
    <StoreProvider>
      <StatusBar style="dark" />
      <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.bg } }}>
        <Stack.Screen name="(tabs)" />
        <Stack.Screen name="story" />
        <Stack.Screen name="build" options={{ gestureEnabled: false }} />
        <Stack.Screen name="select" />
        <Stack.Screen name="book/[id]" />
        <Stack.Screen name="checkout" options={{ presentation: 'modal' }} />
      </Stack>
    </StoreProvider>
  );
}
