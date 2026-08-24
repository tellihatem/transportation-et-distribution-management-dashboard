/**
 * Chart colours.
 *
 * Recharts takes plain SVG attributes, not classNames, so the palette swap in
 * index.css cannot reach it — grid lines and tooltips have to be handed the
 * right colours explicitly. Series colours are deliberately absent: those are
 * saturated mid tones that read on either background and stay put so a bar
 * keeps its meaning when the theme changes.
 */

export type ThemeName = 'dark' | 'light';

export interface ChartTheme {
  /** Grid rules — barely there against the card behind them. */
  grid: string;
  /** Axis lines and their labels. */
  axis: string;
  tooltipBg: string;
  tooltipBorder: string;
  tooltipText: string;
}

export function chartTheme(theme: ThemeName): ChartTheme {
  return theme === 'light'
    ? { grid: '#e2e8f0', axis: '#64748b', tooltipBg: '#ffffff', tooltipBorder: '#cbd5e1', tooltipText: '#0f172a' }
    : { grid: '#1e293b', axis: '#64748b', tooltipBg: '#0f172a', tooltipBorder: '#334155', tooltipText: '#f8fafc' };
}
