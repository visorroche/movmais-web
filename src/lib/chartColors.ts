export const CHART_COLORS = [
  "#0C77B5",
  "#FF751A",
  "#FFDF64",
  "#61C9A8",
  "#BA3B46",
  "#94C6FF",
  "#FAA36A",
  "#FFEEA8",
  "#9EF8DC",
  "#F18992",
] as const;

export function getChartColor(index: number): string {
  const i = ((index % CHART_COLORS.length) + CHART_COLORS.length) % CHART_COLORS.length;
  return CHART_COLORS[i];
}

export function getChartColors(count: number): string[] {
  return Array.from({ length: Math.max(0, count) }, (_, i) => getChartColor(i));
}


