import { Manrope_400Regular, Manrope_500Medium, Manrope_600SemiBold, Manrope_700Bold, Manrope_800ExtraBold } from '@expo-google-fonts/manrope';
import { Pacifico_400Regular, useFonts } from '@expo-google-fonts/pacifico';
import { Unbounded_600SemiBold, Unbounded_700Bold, Unbounded_800ExtraBold } from '@expo-google-fonts/unbounded';
import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useState } from 'react';
import { GestureHandlerRootView } from 'react-native-gesture-handler';

import { loadCatalog } from '@/api/catalog';
import { StoreProvider } from '@/data/store';
import { colors } from '@/theme';

SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  // Batica и Onehart: положить .ttf/.otf в assets/fonts и добавить сюда, затем сменить fonts.display/accent в theme.ts
  const [loaded, error] = useFonts({ Pacifico_400Regular, Manrope_400Regular, Manrope_500Medium, Manrope_600SemiBold, Manrope_700Bold, Manrope_800ExtraBold, Unbounded_600SemiBold, Unbounded_700Bold, Unbounded_800ExtraBold });

  // цены и сроки — из каталога сервера; ждём его не дольше 1,5 с, дальше — сохранённые или с сайта
  const [catalog, setCatalog] = useState(false);
  useEffect(() => {
    const done = () => setCatalog(true);
    const timer = setTimeout(done, 1500);
    loadCatalog().finally(() => {
      clearTimeout(timer);
      done();
    });
  }, []);

  useEffect(() => {
    if ((loaded || error) && catalog) SplashScreen.hideAsync();
  }, [loaded, error, catalog]);

  if ((!loaded && !error) || !catalog) return null;

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
    <StoreProvider>
      <StatusBar style="dark" />
      <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.bg } }}>
        <Stack.Screen name="(tabs)" />
        <Stack.Screen name="story" options={{ presentation: 'fullScreenModal', animation: 'slide_from_bottom' }} />
        <Stack.Screen name="options" />
        <Stack.Screen name="build" options={{ gestureEnabled: false }} />
        <Stack.Screen name="select" />
        <Stack.Screen name="book/[id]" />
        <Stack.Screen name="checkout" options={{ presentation: 'modal' }} />
        <Stack.Screen name="assistant" options={{ presentation: 'fullScreenModal', animation: 'slide_from_bottom' }} />
        <Stack.Screen name="shared/index" />
        <Stack.Screen name="shared/new" />
        <Stack.Screen name="shared/[id]" />
        <Stack.Screen name="points" />
        <Stack.Screen name="retouch" />
        <Stack.Screen name="print" />
        <Stack.Screen name="editor" />
        <Stack.Screen name="cards" options={{ presentation: 'modal' }} />
        <Stack.Screen name="review" options={{ presentation: 'fullScreenModal', gestureEnabled: false }} />
        <Stack.Screen name="settings" options={{ presentation: 'modal' }} />
      </Stack>
    </StoreProvider>
    </GestureHandlerRootView>
  );
}
