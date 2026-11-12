/**
 * Раскрывающийся блок: содержимое всегда на месте и измерено, видимая высота плавно меняется
 * от 0 до полной и обратно по одной кривой — раскрытие и сворачивание одинаково мягкие, без рывка.
 */
import { useEffect, useState, type ReactNode } from 'react';
import { View } from 'react-native';
import Animated, { Easing, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';

export function Collapse({ open, children, gap = 0 }: { open: boolean; children: ReactNode; gap?: number }) {
  const [h, setH] = useState(0);
  const p = useSharedValue(open ? 1 : 0);
  useEffect(() => {
    p.set(withTiming(open ? 1 : 0, { duration: 340, easing: Easing.bezier(0.32, 0.72, 0, 1) }));
  }, [open, p]);
  const style = useAnimatedStyle(() => ({ height: p.value * h, opacity: Math.min(1, p.value * 1.3) }));
  return (
    <Animated.View style={[{ overflow: 'hidden' }, style]} pointerEvents={open ? 'auto' : 'none'}>
      <View style={{ position: 'absolute', left: 0, right: 0, top: 0, paddingTop: gap }} onLayout={(e) => setH(e.nativeEvent.layout.height)}>
        {children}
      </View>
    </Animated.View>
  );
}
