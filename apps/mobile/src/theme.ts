/**
 * Дизайн-токены picPac. Источник: design/app/journey.html (:root) и notes/11-design-decisions.md.
 * Цвет — только для состояния: коралловый — действие, бирюзовый — «всё хорошо».
 */
export const colors = {
  // бренд
  coral: '#CC605B',
  coralAction: '#B84F4B', // кнопки с белым текстом, 4.93:1
  coralLink: '#A9443F', // текст и метки на светлом, 5.2:1
  coralTint: '#FBEDEC',
  teal: '#82DFD6',
  tealInk: '#1F6F67',
  tealTint: '#E3F6F3',
  ink2: '#3B4B4A',
  // поверхности: белый — основа, тёплые оттенки — для групп и заливок
  bg: '#FFFFFF',
  card: '#F8F4F0', // плотные карточки на белом
  card2: '#F1EAE3',
  // персиковый — акцент для заливок (метки, кружки иконок, второстепенные кнопки)
  peach: '#FCE9DE',
  peachStrong: '#F7D5C2',
  peachInk: '#A9472B', // текст и иконки на персиковом, ≈5.4:1
  hair: 'rgba(35,43,42,0.10)',
  line: 'rgba(35,43,42,0.08)',
  // текст
  fg: '#1D2120',
  mut: '#5F6664', // вторичный текст, ≈5:1 на фоне
  mut2: '#A3A8A6', // только декор и неактивное
  warn: '#A84F00',
  warnTint: '#FFF3E3',
} as const;

export const radius = { sm: 12, md: 18, lg: 22, xl: 26, pill: 999 } as const;

export const space = { xs: 4, sm: 8, md: 12, lg: 16, xl: 18, xxl: 24 } as const;

/**
 * Шрифты. Inter — интерфейс. Batica и Onehart — акцентные (крупные заголовки),
 * файлов пока нет: до их появления роли закрыты Inter (см. FONT_FILES в app/_layout.tsx).
 */
export const fonts = {
  logo: 'Pacifico_400Regular',
  regular: 'Manrope_400Regular',
  medium: 'Manrope_500Medium',
  semibold: 'Manrope_600SemiBold',
  bold: 'Manrope_700Bold',
  heavy: 'Manrope_800ExtraBold',
  /** заголовки — Unbounded (кириллица, OFL) */
  display: 'Unbounded_700Bold',
  /** «наплыв» — крупные заголовки заглавными на фото */
  overlap: 'Unbounded_800ExtraBold',
  displayMedium: 'Unbounded_600SemiBold',
  accent: 'Manrope_500Medium',
} as const;

/** Типографика: размер + интерлиньяж + трекинг как набор. */
export const type = {
  title: { fontSize: 21, fontWeight: '700', letterSpacing: -0.4 },
  body: { fontSize: 16, fontWeight: '600', letterSpacing: -0.15 },
  sub: { fontSize: 13, fontWeight: '400', color: colors.mut },
  input: { fontSize: 18, fontWeight: '600', letterSpacing: -0.2 },
} as const;

/** Заглушки фото — градиенты из макета (g1…g6). */
export const photoGradients = {
  g1: ['#F7CFAF', '#E79179', '#A3605D'],
  g2: ['#C4E6E9', '#8FC6C3', '#5A8A79'],
  g3: ['#F4E5C6', '#D8B68B'],
  g4: ['#CCD6EC', '#8EA2CF', '#5D6E98'],
  g5: ['#FADBCB', '#E5A496'],
  g6: ['#D7E9DA', '#8DB79B'],
} as const;
export type PhotoKey = keyof typeof photoGradients;

/** Иконка проекта подбирается по теме альбома (notes/11-design-decisions.md). */
export const themeTint = {
  travel: { bg: '#E6EEF8', fg: '#3F6FB0' },
  child: { bg: '#FBEADF', fg: '#B9622E' },
  wedding: { bg: '#F6E5EA', fg: '#A8475F' },
  graduation: { bg: '#EEF0F7', fg: '#4C5F95' },
  newyear: { bg: '#E5F1E8', fg: '#2F6B45' },
  love: { bg: '#FBEDEC', fg: '#A9443F' },
  family: { bg: '#F4EEE3', fg: '#8A6A3B' },
  default: { bg: '#F1ECE5', fg: '#3B4B4A' },
} as const;
export type AlbumTheme = keyof typeof themeTint;
