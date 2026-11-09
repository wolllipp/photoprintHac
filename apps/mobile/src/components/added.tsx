/**
 * «Добавлено в корзину»: товар уходит в корзину, человек остаётся на месте — внизу всплывает
 * плашка с обложкой и «Открыть», сама гаснет через 4 с. Корзина — отдельный шаг, а не автоматический переход к оплате.
 */
import * as Haptics from 'expo-haptics';
import { Image } from 'expo-image';
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Animated, { FadeInDown, FadeOutDown } from 'react-native-reanimated';

import { Tap } from '@/components/ui';
import { pic, type Pic } from '@/data/photos';
import { ease } from '@/motion';
import { colors, fonts } from '@/theme';

/** Хук: показать плашку на 4 секунды. Каждый новый вызов перезапускает отсчёт. */
export function useAdded() {
  const [shown, setShown] = useState<{ n: number; title: string; cover: Pic } | null>(null);
  useEffect(() => {
    if (!shown) return;
    const t = setTimeout(() => setShown(null), 4000);
    return () => clearTimeout(t);
  }, [shown]);
  const show = (title: string, cover: Pic) => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    setShown((x) => ({ n: (x?.n ?? 0) + 1, title, cover }));
  };
  return { shown, show };
}

export function AddedToast({ shown, bottom }: { shown: { n: number; title: string; cover: Pic } | null; bottom: number }) {
  if (!shown) return null;
  const open = () => {
    router.dismissAll();
    router.navigate('/cart');
  };
  return (
    <Animated.View
      key={shown.n}
      entering={FadeInDown.duration(320).easing(ease.smoothOut)}
      exiting={FadeOutDown.duration(200)}
      style={[s.toast, { bottom }]}
      accessibilityLiveRegion="polite">
      <Image source={pic(shown.cover)} style={s.cover} contentFit="cover" />
      <View style={{ flex: 1 }}>
        <Text style={s.title}>В корзине</Text>
        <Text style={s.sub} numberOfLines={1}>{shown.title}</Text>
      </View>
      <Tap style={s.btn} onPress={open} accessibilityRole="button" accessibilityLabel="Открыть корзину" hitSlop={6}>
        <Text style={s.btnText}>Открыть</Text>
      </Tap>
    </Animated.View>
  );
}

const s = StyleSheet.create({
  toast: {
    position: 'absolute', left: 12, right: 12, flexDirection: 'row', alignItems: 'center', gap: 12,
    backgroundColor: '#fff', borderRadius: 24, padding: 10, paddingRight: 10,
    boxShadow: '0 12px 32px -12px rgba(60,40,30,0.35), 0 0 0 1px rgba(60,40,30,0.06)',
  },
  cover: { width: 44, height: 44, borderRadius: 12 },
  title: { fontSize: 15, fontFamily: fonts.bold, color: colors.fg },
  sub: { fontSize: 13, fontFamily: fonts.regular, color: colors.mut, marginTop: 1 },
  btn: { height: 40, paddingHorizontal: 16, borderRadius: 20, backgroundColor: colors.coralAction, justifyContent: 'center' },
  btnText: { fontSize: 15, fontFamily: fonts.bold, color: '#fff' },
});
