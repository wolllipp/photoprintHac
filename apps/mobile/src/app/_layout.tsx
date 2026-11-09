import { Manrope_400Regular, Manrope_500Medium, Manrope_600SemiBold, Manrope_700Bold, Manrope_800ExtraBold } from '@expo-google-fonts/manrope';
import { Pacifico_400Regular, useFonts } from '@expo-google-fonts/pacifico';
import { Unbounded_600SemiBold, Unbounded_700Bold, Unbounded_800ExtraBold } from '@expo-google-fonts/unbounded';
import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { GestureHandlerRootView } from 'react-native-gesture-handler';

import { StoreProvider } from '@/data/store';
import { colors } from '@/theme';

SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  // Batica и Onehart: положить .ttf/.otf в assets/fonts и добавить сюда, затем сменить fonts.display/accent в theme.ts
  const [loaded, error] = useFonts({ Pacifico_400Regular, Manrope_400Regular, Manrope_500Medium, Manrope_600SemiBold, Manrope_700Bold, Manrope_800ExtraBold, Unbounded_600SemiBold, Unbounded_700Bold, Unbounded_800ExtraBold });

  useEffect(() => {
    if (loaded || error) SplashScreen.hideAsync();
  }, [loaded, error]);

  if (!loaded && !error) return null;

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
    <StoreProvider>
      <StatusBar style="dark" />
      <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.bg } }}>
        <Stack.Screen name="(tabs)" />
        <Stack.Screen name="story" />
        <Stack.Screen name="build" options={{ gestureEnabled: false }} />
        <Stack.Screen name="select" />
        <Stack.Screen name="book/[id]" />
        <Stack.Screen name="checkout" options={{ presentation: 'modal' }} />
        <Stack.Screen name="assistant" />
        <Stack.Screen name="shared" />
        <Stack.Screen name="settings" options={{ presentation: 'modal' }} />
      </Stack>
    </StoreProvider>
    </GestureHandlerRootView>
  );
}
