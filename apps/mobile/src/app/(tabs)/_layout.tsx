import { NativeTabs } from 'expo-router/native-tabs';

import { useStore } from '@/data/store';
import { colors } from '@/theme';

/**
 * Нижнее меню: Главная · Черновики · Заказы. Корзины нет — «Заказать» сразу ведёт на оформление (notes/25). Профиль — по аватару в шапке.
 * Нативные вкладки: на iOS 26+ система сама рисует плавающую стеклянную капсулу.
 */
export default function TabsLayout() {
  const { tabBarHidden, started, hiddenDrafts } = useStore();
  // сколько книг начато и не заказано — то же число, что в заголовке «Черновиков»
  const draftsCount = Object.keys(started).filter((id) => !hiddenDrafts.includes(id)).length;
  return (
    <NativeTabs hidden={tabBarHidden} tintColor={colors.coralAction} badgeBackgroundColor={colors.coralAction} iconColor={{ default: colors.mut, selected: colors.coralAction }}>
      <NativeTabs.Trigger name="index">
        <NativeTabs.Trigger.Label>Главная</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon sf="house.fill" md="home" />
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="drafts">
        <NativeTabs.Trigger.Label>Черновики</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon sf="book.closed.fill" md="auto_stories" />
        {draftsCount ? <NativeTabs.Trigger.Badge>{String(draftsCount)}</NativeTabs.Trigger.Badge> : null}
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="orders">
        <NativeTabs.Trigger.Label>Заказы</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon sf="list.bullet.rectangle.portrait.fill" md="receipt_long" />
      </NativeTabs.Trigger>
    </NativeTabs>
  );
}
