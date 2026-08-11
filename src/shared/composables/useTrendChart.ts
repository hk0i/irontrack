/**
 * Shared by ProgressChartScreen and BodyMetricsScreen: scales a series of
 * numeric values to SVG x/y coordinates for a trend line chart (polyline +
 * point markers). Each returned point carries the source item alongside
 * x/y (not just the number) so callers can wire up tap-to-view without a
 * second parallel array to index back into.
 */
import { computed, type Ref } from 'vue';

export interface TrendChartPoint<T> {
  x: number;
  y: number;
  item: T;
}

export interface TrendChartOptions {
  width: number;
  height: number;
  padding: number;
}

export function useTrendChart<T>(items: Ref<T[]>, valueOf: (item: T) => number, options: TrendChartOptions) {
  const points = computed<TrendChartPoint<T>[]>(() => {
    if (items.value.length === 0) return [];
    const values = items.value.map(valueOf);
    const min = Math.min(...values);
    const max = Math.max(...values);
    const range = max - min || 1;
    const usableWidth = options.width - options.padding * 2;
    const usableHeight = options.height - options.padding * 2;
    const step = items.value.length > 1 ? usableWidth / (items.value.length - 1) : 0;
    return items.value.map((item, i) => ({
      x: options.padding + step * i,
      y: options.padding + usableHeight - ((valueOf(item) - min) / range) * usableHeight,
      item,
    }));
  });

  const polylinePoints = computed(() => points.value.map((p) => `${p.x},${p.y}`).join(' '));

  return { points, polylinePoints };
}
