const MAP: Record<string, string> = {
  "magazine luiza": "#0099FF",
  "mercado livre": "#FFDB58",
  shopee: "#EE4D2D",
  web: "#122752",
  madeiramadeira: "rgb(254 145 84)",
  cnova: "#E71B3B",
};

function norm(value: string): string {
  return String(value || "").trim().toLowerCase();
}

export function marketplaceColor(name: string): string | null {
  const key = norm(name);
  return MAP[key] ?? null;
}

export function marketplaceColorOrFallback(name: string): string {
  return marketplaceColor(name) ?? "#94A3B8"; // slate-400
}

export function marketplaceTextColor(name: string): string {
  const c = (marketplaceColor(name) ?? "").toLowerCase();
  // amarelo do Mercado Livre pede texto escuro
  if (c === "#ffdb58") return "#0f172a";
  // default: branco funciona bem nas cores mapeadas e no fallback cinza
  return "#ffffff";
}

