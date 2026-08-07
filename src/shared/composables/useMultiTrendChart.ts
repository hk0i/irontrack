// Multi-series variant of useTrendChart: same idea (scale a series of
// numeric values to SVG x/y for a polyline + point markers), but supports
// several series over the same item list, each independently normalized on
// its own min/max. Kept separate from useTrendChart (rather than
// refactored to share internals) so BodyMetricsScreen's single-series usage
// is untouched.
import { computed, type Ref } from 'vue';
import type { TrendChartOptions, TrendChartPoint } from './useTrendChart';

export interface TrendChartSeries<T> {
  key: string;
  valueOf: (item: T) => number;
}

export function useMultiTrendChart<T>(
  items: Ref<T[]>,
  series: TrendChartSeries<T>[],
  options: TrendChartOptions
) {
  const seriesPoints = computed<Record<string, TrendChartPoint<T>[]>>(() => {
    const result: Record<string, TrendChartPoint<T>[]> = {};
    if (items.value.length === 0) {
      for (const s of series) result[s.key] = [];
      return result;
    }

    const usableWidth = options.width - options.padding * 2;
    const usableHeight = options.height - options.padding * 2;
    const step = items.value.length > 1 ? usableWidth / (items.value.length - 1) : 0;

    for (const s of series) {
      const values = items.value.map(s.valueOf);
      const min = Math.min(...values);
      const max = Math.max(...values);
      const range = max - min || 1;
      result[s.key] = items.value.map((item, i) => ({
        x: options.padding + step * i,
        y: options.padding + usableHeight - ((s.valueOf(item) - min) / range) * usableHeight,
        item,
      }));
    }

    return result;
  });

  const seriesPolylines = computed<Record<string, string>>(() => {
    const result: Record<string, string> = {};
    for (const [key, points] of Object.entries(seriesPoints.value)) {
      result[key] = points.map((p) => `${p.x},${p.y}`).join(' ');
    }
    return result;
  });

  return { seriesPoints, seriesPolylines };
}
