import { usePathname } from 'expo-router';
import { NativeTabs } from 'expo-router/native-tabs';

import { useStore } from '@/data/store';
import { colors } from '@/theme';

/**
 * Нижнее меню: Главная · Корзина · Заказы. Профиль — по аватару в шапке.
 * Нативные вкладки: на iOS 26+ система сама рисует плавающую стеклянную капсулу.
 */
export default function TabsLayout() {
  const { tabBarHidden, cartCount } = useStore();
  // iOS 26 не применяет отдельный цвет значка у выбранной вкладки — красим сами по открытому экрану
  const onCart = usePathname() === '/cart';
  return (
    <NativeTabs hidden={tabBarHidden} tintColor={colors.coralAction} badgeBackgroundColor={onCart ? colors.coralAction : colors.fg} iconColor={{ default: colors.mut, selected: colors.coralAction }}>
      <NativeTabs.Trigger name="index">
        <NativeTabs.Trigger.Label>Главная</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon sf="house.fill" md="home" />
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="cart">
        <NativeTabs.Trigger.Label>Корзина</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon sf="bag.fill" md="shopping_bag" />
        {/* то же число, что в шапке корзины; чёрный, пока вкладка не открыта, коралловый — когда открыта */}
        {cartCount ? <NativeTabs.Trigger.Badge>{String(cartCount)}</NativeTabs.Trigger.Badge> : null}
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="orders">
        <NativeTabs.Trigger.Label>Заказы</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon sf="list.bullet.rectangle.portrait.fill" md="receipt_long" />
      </NativeTabs.Trigger>
    </NativeTabs>
  );
}
