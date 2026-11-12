import { Tabs } from 'expo-router/tabs';
import { View } from 'react-native';

import { CreateHost, TabBar } from '@/components/tabBar';
import { colors } from '@/theme';

/**
 * Нижнее меню: Главная · Черновики · Заказы — три отдельные кнопки-квадратика над экраном, в духе Pinterest
 * (components/tabBar.tsx). Корзины нет — «Заказать» сразу ведёт на оформление (notes/25).
 */
export default function TabsLayout() {
  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <Tabs tabBar={(props) => <TabBar {...props} />} screenOptions={{ headerShown: false, sceneStyle: { backgroundColor: colors.bg } }}>
        <Tabs.Screen name="index" options={{ title: 'Главная' }} />
        <Tabs.Screen name="drafts" options={{ title: 'Черновики' }} />
        <Tabs.Screen name="orders" options={{ title: 'Заказы' }} />
      </Tabs>
      <CreateHost />
    </View>
  );
}
