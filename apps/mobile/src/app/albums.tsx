/**
 * «Мои альбомы» — книга из альбома айфона в одно касание. Доступ к фото — только по кнопке «Показать мои альбомы»;
 * список альбомов остаётся на телефоне. На сервер уходят фото только того альбома, который выбрали (как при выборе в галерее),
 * перед первой загрузкой — согласие на обработку ИИ. Тариф — под коллажи (components/tabBar.tsx, collageTariff).
 */
import * as Haptics from 'expo-haptics';
import { Image } from 'expo-image';
import * as MediaLibrary from 'expo-media-library/legacy';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Linking, ScrollView, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import Animated from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ConsentSheet } from '@/components/consent';
import { TitleBar } from '@/components/nav';
import { collageTariff, startBook } from '@/components/tabBar';
import { Tap } from '@/components/ui';
import { tariffs } from '@/data/demo';
import { rememberLibrary } from '@/data/picked';
import { useStore } from '@/data/store';
import { enterItem } from '@/motion';
import { colors, fonts } from '@/theme';

/** Сколько фото альбома берём в книгу: последние 80 — больше на 24–60 страниц не встанет коллажами. */
const TAKE = 80;
/** Меньше — книгу не собрать (самая маленькая — Premium на 10 страниц). */
const MIN = 10;

type Item = { id: string; title: string; count: number; cover?: string; album: MediaLibrary.Album };

export default function Albums() {
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const { aiConsent, setAiConsent } = useStore();
  const [perm, setPerm] = useState<'unknown' | 'granted' | 'denied'>('unknown');
  const [items, setItems] = useState<Item[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [ask, setAsk] = useState<Item | null>(null);
  const cell = (width - 32 - 12) / 2;

  // альбомы: свои и умные («Избранное», «Недавние», люди, места); пустые и маленькие не показываем
  const load = useCallback(async () => {
    const albums = await MediaLibrary.getAlbumsAsync({ includeSmartAlbums: true });
    const big = albums.filter((a) => a.assetCount >= MIN).sort((a, b) => b.assetCount - a.assetCount).slice(0, 24);
    const withCovers = await Promise.all(
      big.map(async (a) => {
        const page = await MediaLibrary.getAssetsAsync({ album: a, first: 1, mediaType: 'photo', sortBy: [['creationTime', false]] }).catch(() => null);
        return { id: a.id, title: a.title, count: a.assetCount, cover: page?.assets[0]?.uri, album: a };
      }),
    );
    setItems(withCovers.filter((x) => x.cover));
  }, []);

  // разрешение уже давали раньше — сразу показываем альбомы; иначе ждём кнопку
  useEffect(() => {
    MediaLibrary.getPermissionsAsync()
      .then((p) => {
        if (p.granted) {
          setPerm('granted');
          load().catch(() => setErr('Не получилось открыть альбомы'));
        }
      })
      .catch(() => {});
  }, [load]);

  const allow = async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    const p = await MediaLibrary.requestPermissionsAsync().catch(() => null);
    if (!p?.granted) {
      setPerm('denied');
      return;
    }
    setPerm('granted');
    await load().catch(() => setErr('Не получилось открыть альбомы'));
  };

  // выбрали альбом: последние фото → файлы на телефоне → копии для экрана → сборка коллажами
  const build = async (it: Item) => {
    setBusy(it.id);
    setErr(null);
    try {
      const page = await MediaLibrary.getAssetsAsync({ album: it.album, first: TAKE, mediaType: 'photo', sortBy: [['creationTime', false]] });
      // ph:// — адрес в медиатеке; для загрузки и копий нужен файл (localUri)
      const files: { uri: string; width: number; height: number; creationTime: number }[] = [];
      const queue = [...page.assets];
      const worker = async () => {
        for (let a = queue.shift(); a; a = queue.shift()) {
          const info = await MediaLibrary.getAssetInfoAsync(a).catch(() => null);
          if (info?.localUri) files.push({ uri: info.localUri, width: a.width, height: a.height, creationTime: a.creationTime });
        }
      };
      await Promise.all([worker(), worker(), worker(), worker()]);
      files.sort((a, b) => a.creationTime - b.creationTime);
      const tariff = collageTariff(files.length);
      if (!tariff) {
        setErr(`В альбоме «${it.title}» мало фото с телефона — нужно хотя бы ${MIN}`);
        return;
      }
      const uris = await rememberLibrary(files);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      startBook(uris, tariff, it.title);
    } catch {
      setErr('Не получилось взять фото из альбома — попробуйте ещё раз');
    } finally {
      setBusy(null);
    }
  };
  const pick = (it: Item) => {
    if (busy) return;
    // перед первой загрузкой фото — согласие на обработку ИИ (план 1.15)
    if (!aiConsent) return setAsk(it);
    build(it).catch(() => {});
  };

  return (
    <View style={[s.screen, { paddingTop: insets.top }]}>
      <TitleBar title="Мои альбомы" />
      <ScrollView contentContainerStyle={[s.content, { paddingBottom: insets.bottom + 32 }]}>
        <Text style={s.lead}>Выберите альбом — соберём из него книгу коллажами. На сервер уходят только фото выбранного альбома.</Text>

        {perm !== 'granted' ? (
          <View style={s.card}>
            <Text style={s.cardTitle}>{perm === 'denied' ? 'Нет доступа к фото' : 'Альбомы с вашего айфона'}</Text>
            <Text style={s.cardText}>
              {perm === 'denied'
                ? 'Разрешите доступ в настройках телефона: Настройки → Expo Go → Фото.'
                : 'Покажем ваши альбомы: «Избранное», поездки, люди и места. Список остаётся на телефоне.'}
            </Text>
            <Tap style={s.cta} onPress={() => (perm === 'denied' ? Linking.openSettings() : allow()).catch(() => {})} accessibilityRole="button">
              <Text style={s.ctaText}>{perm === 'denied' ? 'Открыть настройки' : 'Показать мои альбомы'}</Text>
            </Tap>
          </View>
        ) : null}

        {err ? <Text style={s.err}>{err}</Text> : null}

        {perm === 'granted' && !items ? <ActivityIndicator color={colors.coralAction} style={{ marginTop: 24 }} /> : null}
        {items && !items.length ? <Text style={s.lead}>Альбомов, где хотя бы {MIN} фото, нет.</Text> : null}

        <View style={s.grid}>
          {items?.map((it, i) => {
            const t = collageTariff(Math.min(it.count, TAKE));
            const name = tariffs.find((x) => x.id === t)?.name;
            return (
              <Animated.View key={it.id} entering={enterItem(i)}>
                <Tap style={{ width: cell }} onPress={() => pick(it)} disabled={!!busy} accessibilityRole="button" accessibilityLabel={`Альбом ${it.title}, ${it.count} фото. Собрать книгу`}>
                  <View style={[s.cover, { width: cell, height: cell }]}>
                    {it.cover ? <Image source={{ uri: it.cover }} style={StyleSheet.absoluteFill} contentFit="cover" /> : null}
                    {busy === it.id ? (
                      <View style={s.busy}>
                        <ActivityIndicator color="#fff" />
                        <Text style={s.busyText}>Готовим фото…</Text>
                      </View>
                    ) : null}
                  </View>
                  <Text style={s.title} numberOfLines={1}>{it.title}</Text>
                  <Text style={s.sub} numberOfLines={1}>
                    {it.count} фото{name ? ` · ${name}, коллажи` : ''}
                  </Text>
                </Tap>
              </Animated.View>
            );
          })}
        </View>
      </ScrollView>

      <ConsentSheet
        visible={!!ask}
        cta="Согласен, собрать книгу"
        onClose={() => setAsk(null)}
        onAccept={() => {
          setAiConsent(true);
          const it = ask;
          setAsk(null);
          if (it) build(it).catch(() => {});
        }}
      />
    </View>
  );
}

const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  content: { paddingHorizontal: 16, gap: 14, paddingTop: 4 },
  lead: { fontSize: 15, lineHeight: 21, fontFamily: fonts.regular, color: colors.mut },
  card: { backgroundColor: colors.card, borderRadius: 24, padding: 16, gap: 10 },
  cardTitle: { fontSize: 18, fontFamily: fonts.display, color: colors.fg },
  cardText: { fontSize: 14.5, lineHeight: 20, fontFamily: fonts.regular, color: colors.mut },
  cta: { height: 52, borderRadius: 26, backgroundColor: colors.coralAction, alignItems: 'center', justifyContent: 'center', marginTop: 4 },
  ctaText: { fontSize: 16, fontFamily: fonts.semibold, color: '#fff' },
  err: { fontSize: 14, lineHeight: 19, fontFamily: fonts.medium, color: colors.coralAction },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  cover: { borderRadius: 20, overflow: 'hidden', backgroundColor: colors.card2 },
  busy: { position: 'absolute', left: 0, top: 0, right: 0, bottom: 0, backgroundColor: 'rgba(20,16,14,0.45)', alignItems: 'center', justifyContent: 'center', gap: 8 },
  busyText: { fontSize: 13, fontFamily: fonts.semibold, color: '#fff' },
  title: { fontSize: 15.5, fontFamily: fonts.bold, color: colors.fg, marginTop: 8 },
  sub: { fontSize: 13, fontFamily: fonts.regular, color: colors.mut, marginTop: 1 },
});
