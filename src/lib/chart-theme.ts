import { useTheme } from '../contexts/ThemeContext';
import { chartTheme, type ChartTheme } from './chart-palette';

// The palette and its rules live in chart-palette.ts (pure, unit-tested);
// this file only binds them to the app's theme.
export * from './chart-palette';

export function useChartTheme(): ChartTheme {
  const { isDark } = useTheme();
  return chartTheme(isDark);
}
