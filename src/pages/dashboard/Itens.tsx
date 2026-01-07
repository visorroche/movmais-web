import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { ResponsiveBar } from "@nivo/bar";
import { ResponsiveLine } from "@nivo/line";
import { ResponsivePie } from "@nivo/pie";
import { ResponsiveTreeMap } from "@nivo/treemap";
import { geoMercator, geoPath } from "d3-geo";
import { scaleQuantize } from "d3-scale";
import { SlidersHorizontal } from "lucide-react";
import brStates from "@/assets/geo/br_states.json";
import { Card } from "@/components/ui/card";
import { DateRangePicker, type DateRangeValue } from "@/components/ui/date-range-picker";
import { SlideOver } from "@/components/ui/slideover";
import { MultiSelect, type MultiSelectOption } from "@/components/ui/multi-select";
import { buildApiUrl } from "@/lib/config";
import { getAuthHeaders } from "@/lib/auth";
import { CHART_COLORS } from "@/lib/chartColors";

type FiltersResponse = {
  companyId: number;
  groupId: number | null;
  stores: { id: number; name: string }[];
  statuses: string[];
  channels: string[];
  categories: string[];
  states: string[];
  cities: string[];
};

type ProductOption = { id: number; sku: number; name: string | null; brand: string | null; model: string | null; category: string | null };

const DashboardItens = () => {
  const formatBRLNoSpace = (value: number): string =>
    new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(value).replace(/\u00A0/g, "");
  const formatBRLCompact = (value: number): string =>
    new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", notation: "compact", maximumFractionDigits: 1 })
      .format(value)
      .replace(/\u00A0/g, "");

  const hexToRgba = (hex: string, alpha: number): string => {
    const h = String(hex || "").replace("#", "").trim();
    if (h.length !== 6) return hex;
    const r = parseInt(h.slice(0, 2), 16);
    const g = parseInt(h.slice(2, 4), 16);
    const b = parseInt(h.slice(4, 6), 16);
    const a = Math.max(0, Math.min(1, alpha));
    return `rgba(${r}, ${g}, ${b}, ${a})`;
  };

  // topo: data (default mês atual) + filtros
  const [dateRange, setDateRange] = useState<DateRangeValue>(() => {
    const now = new Date();
    const start = new Date(now.getFullYear(), now.getMonth(), 1);
    const pad2 = (n: number) => String(n).padStart(2, "0");
    const toISO = (d: Date) => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
    return { start: toISO(start), end: toISO(now) };
  });

  const [filtersOpen, setFiltersOpen] = useState(false);
  const [filtersLoading, setFiltersLoading] = useState(true);
  const [filtersError, setFiltersError] = useState<string | null>(null);
  const [filters, setFilters] = useState<FiltersResponse | null>(null);

  const [status, setStatus] = useState<string[]>([]);
  const [stores, setStores] = useState<string[]>([]);
  const [channels, setChannels] = useState<string[]>([]);
  const [categories, setCategories] = useState<string[]>([]);
  const [states, setStates] = useState<string[]>([]);
  const [cities, setCities] = useState<string[]>([]);

  const [productValues, setProductValues] = useState<string[]>([]);
  const [productOptions, setProductOptions] = useState<ProductOption[]>([]);
  const [productLoading, setProductLoading] = useState(false);
  const [productError, setProductError] = useState<string | null>(null);
  const [productQuery, setProductQuery] = useState("");

  const [citiesOverride, setCitiesOverride] = useState<string[] | null>(null);
  const [citiesLoading, setCitiesLoading] = useState(false);
  const [citiesError, setCitiesError] = useState<string | null>(null);

  const initialStoresSet = useRef(false);

  useEffect(() => {
    const ac = new AbortController();
    setFiltersLoading(true);
    setFiltersError(null);
    fetch(buildApiUrl("/companies/me/dashboard/filters"), { headers: { ...getAuthHeaders() }, signal: ac.signal })
      .then(async (res) => {
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          throw new Error((data as any)?.message || "Erro ao carregar filtros");
        }
        return res.json() as Promise<any>;
      })
      .then((d) => {
        setFilters(d);
        if (!initialStoresSet.current) {
          setStores((d?.stores || []).map((s: any) => String(s.id)));
          initialStoresSet.current = true;
        }
      })
      .catch((e: any) => {
        setFilters(null);
        setFiltersError(String(e?.message || "Erro ao carregar filtros"));
      })
      .finally(() => setFiltersLoading(false));

    return () => ac.abort();
  }, []);

  useEffect(() => {
    const q = productQuery.trim();
    if (!q) {
      setProductOptions([]);
      setProductError(null);
      setProductLoading(false);
      return;
    }
    const ac = new AbortController();
    const t = setTimeout(() => {
      setProductLoading(true);
      setProductError(null);
      fetch(buildApiUrl(`/companies/me/dashboard/products?q=${encodeURIComponent(q)}&limit=50`), {
        headers: { ...getAuthHeaders() },
        signal: ac.signal,
      })
        .then(async (res) => {
          if (!res.ok) {
            const data = await res.json().catch(() => ({}));
            throw new Error((data as any)?.message || "Erro ao buscar produtos");
          }
          return res.json() as Promise<ProductOption[]>;
        })
        .then((d) => setProductOptions(Array.isArray(d) ? d : []))
        .catch((e: any) => {
          setProductOptions([]);
          setProductError(String(e?.message || "Erro ao buscar produtos"));
        })
        .finally(() => setProductLoading(false));
    }, 250);

    return () => {
      clearTimeout(t);
      ac.abort();
    };
  }, [productQuery]);

  useEffect(() => {
    if (!filters) return;
    if (!states.length) {
      setCitiesOverride(null);
      setCitiesError(null);
      setCitiesLoading(false);
      return;
    }
    const ac = new AbortController();
    setCitiesLoading(true);
    setCitiesError(null);
    const qs = new URLSearchParams();
    for (const st of states) qs.append("state", st);
    fetch(buildApiUrl(`/companies/me/dashboard/cities?${qs.toString()}`), {
      headers: { ...getAuthHeaders() },
      signal: ac.signal,
    })
      .then(async (res) => {
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          throw new Error((data as any)?.message || "Erro ao carregar cidades");
        }
        return res.json() as Promise<string[]>;
      })
      .then((list) => {
        const next = Array.isArray(list) ? list : [];
        setCitiesOverride(next);
        setCities((cur) => cur.filter((c) => next.includes(c)));
      })
      .catch((e: any) => {
        setCitiesOverride([]);
        setCitiesError(String(e?.message || "Erro ao carregar cidades"));
      })
      .finally(() => setCitiesLoading(false));

    return () => ac.abort();
  }, [filters, states]);

  const storeOptions: MultiSelectOption[] = useMemo(
    () => (filters?.stores || []).map((s) => ({ value: String(s.id), label: s.name })),
    [filters],
  );
  const statusOptions: MultiSelectOption[] = useMemo(
    () => (filters?.statuses || []).map((s) => ({ value: s, label: s })),
    [filters],
  );
  const channelOptions: MultiSelectOption[] = useMemo(
    () => (filters?.channels || []).map((s) => ({ value: s, label: s })),
    [filters],
  );
  const categoryOptions: MultiSelectOption[] = useMemo(
    () => (filters?.categories || []).map((s) => ({ value: s, label: s })),
    [filters],
  );
  const stateOptions: MultiSelectOption[] = useMemo(
    () => (filters?.states || []).map((s) => ({ value: s, label: s })),
    [filters],
  );
  const cityOptions: MultiSelectOption[] = useMemo(
    () => ((citiesOverride ?? filters?.cities) || []).map((s) => ({ value: s, label: s })),
    [citiesOverride, filters],
  );
  const productSelectOptions: MultiSelectOption[] = useMemo(() => {
    const map = new Map<string, MultiSelectOption>();
    for (const v of productValues) {
      if (!map.has(v)) map.set(v, { value: v, label: v });
    }
    for (const p of productOptions) {
      const label = `${p.sku} — ${p.name || "Sem nome"}`;
      map.set(String(p.sku), { value: String(p.sku), label });
    }
    return Array.from(map.values());
  }, [productOptions, productValues]);

  const toggleSingle = (setter: (v: string[]) => void, current: string[], next: string) => {
    if (current.length === 1 && current[0] === next) setter([]);
    else setter([next]);
  };

  // Dados fakes determinísticos pra visual (depois liga no SQL)
  const scale = useMemo(() => {
    const key =
      [...stores].sort().join("|") +
      "||" +
      [...channels].sort().join("|") +
      "||" +
      [...categories].sort().join("|") +
      "||" +
      [...productValues].sort().join("|");
    if (!key) return 1;
    let h = 0;
    for (let i = 0; i < key.length; i++) h = (h * 31 + key.charCodeAt(i)) >>> 0;
    const v = (h % 70) / 100; // 0..0.69
    return 0.65 + v; // 0.65..1.34
  }, [stores, channels, categories, productValues]);

  // barras: categorias e subcategorias
  const categoryBars = useMemo(
    () => [
      { id: "Café", value: Math.round(42000 * scale) },
      { id: "Acessórios", value: Math.round(27000 * scale) },
      { id: "Máquinas", value: Math.round(31000 * scale) },
      { id: "Chás", value: Math.round(14500 * scale) },
      { id: "Cápsulas", value: Math.round(21500 * scale) },
      { id: "Kits", value: Math.round(9800 * scale) },
      { id: "Peças", value: Math.round(7600 * scale) },
      { id: "Moedores", value: Math.round(13200 * scale) },
      { id: "Canecas", value: Math.round(8900 * scale) },
      { id: "Outros", value: Math.round(6100 * scale) },
    ],
    [scale],
  );

  const [parentCategory, setParentCategory] = useState<string[]>([]);
  const activeParent = parentCategory.length === 1 ? parentCategory[0] : "";

  const subcategoryBars = useMemo(() => {
    const base = [
      { id: "Premium", value: 16000 },
      { id: "Tradicional", value: 12000 },
      { id: "Orgânico", value: 9000 },
      { id: "Descafeinado", value: 6500 },
      { id: "Gourmet", value: 11000 },
      { id: "Acessórios", value: 7800 },
      { id: "Peças", value: 5200 },
      { id: "Filtros", value: 4300 },
    ];
    const k = activeParent || "Geral";
    let h = 0;
    for (let i = 0; i < k.length; i++) h = (h * 31 + k.charCodeAt(i)) >>> 0;
    const bump = 0.75 + ((h % 60) / 100); // 0.75..1.34
    return base.map((x) => ({ id: x.id, value: Math.max(1, Math.round(x.value * bump * scale)) }));
  }, [activeParent, scale]);

  // top produtos (10)
  const topProducts = useMemo(
    () =>
      [
        { name: "Cápsulas Premium 10un", qty: 540, revenue: 16200 },
        { name: "Filtro Reutilizável", qty: 210, revenue: 6300 },
        { name: "Cafeteira Espresso X", qty: 120, revenue: 18400 },
        { name: "Caneca Térmica 500ml", qty: 95, revenue: 4750 },
        { name: "Moedor Elétrico", qty: 68, revenue: 9800 },
        { name: "Kit Degustação", qty: 62, revenue: 5580 },
        { name: "Café Especial 250g", qty: 58, revenue: 3480 },
        { name: "Chá Matcha 100g", qty: 44, revenue: 3960 },
        { name: "Balança Barista", qty: 31, revenue: 5270 },
        { name: "Porta-cápsulas", qty: 28, revenue: 2240 },
      ].map((p) => ({ ...p, qty: Math.max(1, Math.round(p.qty * scale)), revenue: Math.max(1, Math.round(p.revenue * scale)) })),
    [scale],
  );

  const [productSort, setProductSort] = useState<{ key: "qty" | "revenue"; dir: "asc" | "desc" }>({
    key: "revenue",
    dir: "desc",
  });

  const sortedTopProducts = useMemo(() => {
    const list = [...topProducts];
    const { key, dir } = productSort;
    list.sort((a, b) => {
      const av = a[key];
      const bv = b[key];
      if (av === bv) return String(a.name).localeCompare(String(b.name));
      return dir === "asc" ? av - bv : bv - av;
    });
    return list;
  }, [productSort, topProducts]);

  // pizza marketplaces (igual AoVivo) + highlight 20%
  const pieByMarketplace = useMemo(
    () => [
      { id: "Mercado Livre", label: "Mercado Livre", value: Math.round(38000 * scale) },
      { id: "Shopee", label: "Shopee", value: Math.round(22000 * scale) },
      { id: "Amazon", label: "Amazon", value: Math.round(16000 * scale) },
      { id: "Magalu", label: "Magalu", value: Math.round(12000 * scale) },
    ],
    [scale],
  );
  const marketplaceColorById = useMemo(() => {
    const map = new Map<string, string>();
    for (let i = 0; i < pieByMarketplace.length; i++) {
      map.set(String((pieByMarketplace as any)[i]?.id ?? ""), CHART_COLORS[i % CHART_COLORS.length]);
    }
    return map;
  }, [pieByMarketplace]);

  // marcas: bar chart
  const brands = useMemo(
    () => [
      { id: "Nespresso", value: Math.round(22000 * scale) },
      { id: "Três", value: Math.round(16000 * scale) },
      { id: "Dolce Gusto", value: Math.round(14000 * scale) },
      { id: "Melitta", value: Math.round(9800 * scale) },
      { id: "Philips", value: Math.round(8700 * scale) },
      { id: "Oster", value: Math.round(7600 * scale) },
      { id: "Bialetti", value: Math.round(6800 * scale) },
    ],
    [scale],
  );

  // mapa (igual AoVivo)
  const mapWrapRef = useRef<HTMLDivElement | null>(null);
  const [mapWidth, setMapWidth] = useState(0);
  const mapHeight = 360;
  const [mapHover, setMapHover] = useState<{ id: string; value: number | null; x: number; y: number } | null>(null);

  useEffect(() => {
    const el = mapWrapRef.current;
    if (!el) return;
    const measure = () => setMapWidth(el.clientWidth || 0);
    measure();
    if (typeof ResizeObserver === "undefined") {
      window.addEventListener("resize", measure);
      return () => window.removeEventListener("resize", measure);
    }
    const ro = new ResizeObserver(() => measure());
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const geoFeatures = useMemo(() => ((brStates as any)?.features || []) as any[], []);
  const mapProjection = useMemo(() => {
    if (!mapWidth || !mapHeight) return null;
    if (!Array.isArray(geoFeatures) || geoFeatures.length === 0) return null;
    const fc = { type: "FeatureCollection", features: geoFeatures } as any;
    const pad = 10;
    return geoMercator().fitExtent(
      [
        [pad, pad],
        [Math.max(pad + 1, mapWidth - pad), Math.max(pad + 1, mapHeight - pad)],
      ],
      fc,
    );
  }, [geoFeatures, mapWidth]);
  const mapPath = useMemo(() => (mapProjection ? geoPath(mapProjection) : null), [mapProjection]);

  const salesByUF = useMemo(() => {
    const base: Record<string, number> = {
      SP: 42000,
      RJ: 18000,
      MG: 22000,
      PR: 12000,
      RS: 14000,
      SC: 9000,
      BA: 8000,
      GO: 7000,
      DF: 6000,
      PE: 6500,
      CE: 5000,
      PA: 4500,
      AM: 3500,
      MT: 3200,
      MS: 2800,
      ES: 2600,
      RN: 2100,
      PB: 1900,
      AL: 1700,
      SE: 1600,
      PI: 1500,
      MA: 1400,
      TO: 1200,
      RO: 1100,
      AC: 800,
      AP: 700,
      RR: 650,
    };
    return Object.entries(base).map(([id, v]) => ({ id, value: Math.round(v * scale) }));
  }, [scale]);

  const salesByUFMap = useMemo(() => new Map(salesByUF.map((d) => [String(d.id), d.value])), [salesByUF]);
  const mapMax = useMemo(() => Math.max(1, ...salesByUF.map((d) => d.value)), [salesByUF]);
  const MAP_ORANGE_TONES = useMemo(
    () => ["#FFF3EA", "#FFE4D1", "#FFD2B0", "#FFB885", "#FF9A52", "#FF751A", "#E65F00", "#CC4F00"],
    [],
  );
  const mapScale = useMemo(() => scaleQuantize<string>().domain([0, mapMax]).range(MAP_ORANGE_TONES), [mapMax, MAP_ORANGE_TONES]);
  const mapUnknownColor = "#E2E8F0";

  // linha: faturamento dia a dia com linhas por categoria
  const daySeries = useMemo(() => {
    const start = dateRange.start ? new Date(dateRange.start + "T00:00:00") : new Date();
    const end = dateRange.end ? new Date(dateRange.end + "T00:00:00") : new Date();
    const days = Math.max(1, Math.min(31, Math.floor((end.getTime() - start.getTime()) / 86400000) + 1));
    const cats = ["Café", "Acessórios", "Máquinas", "Cápsulas"];
    const fmt = (d: Date) => `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}`;
    return cats.map((c, idx) => {
      let base = 10000 + idx * 4000;
      const data = Array.from({ length: days }, (_, i) => {
        const d = new Date(start);
        d.setDate(d.getDate() + i);
        const wave = 0.65 + 0.35 * Math.sin((i / Math.max(1, days - 1)) * Math.PI * 1.6 + idx);
        const v = Math.round(base * wave * scale);
        return { x: fmt(d), y: v };
      });
      return { id: c, data };
    });
  }, [dateRange.end, dateRange.start, scale]);

  const lineColorById = useMemo(() => {
    const map = new Map<string, string>();
    for (let i = 0; i < daySeries.length; i++) map.set(String((daySeries as any)[i]?.id ?? ""), CHART_COLORS[i % CHART_COLORS.length]);
    return map;
  }, [daySeries]);

  const treemapData = useMemo(() => {
    // dados fake determinísticos: categorias -> subcategorias
    const cats = [
      { id: "Café", subs: ["Premium", "Tradicional", "Orgânico", "Gourmet", "Descafeinado"] },
      { id: "Acessórios", subs: ["Filtros", "Canecas", "Porta-cápsulas", "Balanças", "Outros"] },
      { id: "Máquinas", subs: ["Espresso", "Cápsulas", "Filtro", "Moedores", "Peças"] },
      { id: "Chás", subs: ["Matcha", "Preto", "Verde", "Ervas", "Kits"] },
      { id: "Cápsulas", subs: ["10un", "20un", "40un", "Variedades", "Acessórios"] },
    ];

    const root: any = { name: "Categorias", children: [] as any[] };
    for (let ci = 0; ci < cats.length; ci++) {
      const c = cats[ci];
      const children = c.subs.map((s, si) => {
        const k = `${c.id}||${s}`;
        let h = 0;
        for (let i = 0; i < k.length; i++) h = (h * 31 + k.charCodeAt(i)) >>> 0;
        const base = 9000 + (ci * 4200) + (si * 1500);
        const wave = 0.7 + 0.3 * Math.sin((h % 20) / 3);
        const value = Math.max(500, Math.round(base * wave * scale));
        return { name: s, value };
      });
      root.children.push({ name: c.id, children });
    }
    return root;
  }, [scale]);

  return (
    <div className="w-full">
      <div className="flex items-center justify-between gap-3">
      <div className="text-sm text-slate-600">
        <Link to="/dashboard" className="font-semibold text-slate-700 hover:text-slate-900 hover:underline">
          Dashboard
        </Link>{" "}
        <span className="text-slate-400">/</span> Itens
      </div>
      </div>

      <div className="mt-1 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
      <h1 className="text-2xl font-extrabold text-slate-900">Detalhamento dos itens vendidos</h1>
        <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row sm:items-end">
          <div className="w-full sm:w-[360px]">
            <DateRangePicker value={dateRange} onChange={setDateRange} placeholder="Selecionar período..." />
          </div>
          <button
            type="button"
            onClick={() => setFiltersOpen(true)}
            className="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
          >
            <SlidersHorizontal className="h-4 w-4" />
            Filtros
          </button>
        </div>
      </div>

      {filtersLoading || filtersError || productLoading || productError ? (
        <div className="mt-2 space-y-1">
          {filtersLoading ? <div className="text-sm text-slate-700">Carregando filtros...</div> : null}
          {!filtersLoading && filtersError ? <div className="text-sm text-red-600">{filtersError}</div> : null}
          {productLoading ? <div className="text-xs text-slate-600">Buscando produtos...</div> : null}
          {!productLoading && productError ? <div className="text-xs text-red-600">{productError}</div> : null}
        </div>
      ) : null}

      {/* Faturamento dia a dia (linhas por categoria) */}
      <Card className="mt-4 w-full border-slate-200 bg-white p-5">
        <div className="text-lg font-extrabold text-slate-900">Faturamento dia a dia (por categoria)</div>
        <div className="mt-3" style={{ height: 380 }}>
          <ResponsiveLine
            data={daySeries as any}
            margin={{ top: 10, right: 24, bottom: 56, left: 92 }}
            xScale={{ type: "point" }}
            yScale={{ type: "linear", min: 0, max: "auto", stacked: false }}
            axisBottom={{ tickRotation: -35, legend: "Dia", legendOffset: 46, legendPosition: "middle" }}
            axisLeft={{ format: (v) => formatBRLCompact(Number(v)) }}
            enablePoints={false}
            useMesh={true}
            colors={(d) => lineColorById.get(String(d.id)) || CHART_COLORS[0]}
            legends={[]}
            theme={{
              axis: { ticks: { text: { fill: "#475569" } }, legend: { text: { fill: "#334155", fontWeight: 700 } } },
              grid: { line: { stroke: "#E2E8F0" } },
              tooltip: { container: { background: "#fff", color: "#0f172a", fontSize: 12, borderRadius: 12 } },
            }}
            tooltip={({ point }: any) => (
              <div className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs text-slate-900 shadow-xl">
                <div className="font-extrabold">{String(point?.serieId)}</div>
                <div className="text-slate-600">{String(point?.data?.xFormatted ?? point?.data?.x)}</div>
                <div>{formatBRLNoSpace(Number(point?.data?.yFormatted ?? point?.data?.y ?? 0))}</div>
              </div>
            )}
          />
        </div>
        <div className="mt-2 flex flex-wrap gap-x-6 gap-y-2 text-sm">
          {daySeries.map((s: any) => (
            <div key={String(s.id)} className="inline-flex items-center gap-2 text-slate-700">
              <span className="h-2.5 w-2.5 rounded-full" style={{ background: lineColorById.get(String(s.id)) || CHART_COLORS[0] }} />
              <span className="font-semibold">{String(s.id)}</span>
            </div>
          ))}
        </div>
      </Card>

      {/* TreeMap: categorias e subcategorias */}
      <Card className="mt-4 w-full border-slate-200 bg-white p-5">
        <div className="text-lg font-extrabold text-slate-900">Categorias e subcategorias</div>
        <div className="mt-1 text-sm text-slate-600">Área proporcional ao faturamento (fake) por subcategoria.</div>
        <div className="mt-3" style={{ height: 420 }}>
          <ResponsiveTreeMap
            data={treemapData as any}
            identity="name"
            value="value"
            margin={{ top: 8, right: 8, bottom: 8, left: 8 }}
            label={(node: any) => {
              // mostrar sempre o nome da CATEGORIA nas áreas (não o valor)
              // folhas (subcategorias) exibem o nome do pai (categoria)
              const depth = Number(node?.depth ?? 0);
              if (depth >= 2) return String(node?.parent?.data?.name ?? node?.parent?.id ?? "");
              return String(node?.data?.name ?? node?.id ?? "");
            }}
            labelSkipSize={14}
            labelTextColor="#0f172a"
            parentLabelTextColor="#0f172a"
            parentLabelSize={14}
            parentLabelPosition="top"
            innerPadding={4}
            outerPadding={4}
            colors={(node: any) => {
              const parent = String(node?.parent?.data?.name ?? "");
              const top = parent || String(node?.data?.name ?? "");
              const idx = ["Café", "Acessórios", "Máquinas", "Chás", "Cápsulas"].indexOf(top);
              const base = CHART_COLORS[(idx >= 0 ? idx : 1) % CHART_COLORS.length] || "#FF751A";
              // subcategorias ficam levemente transparentes para destacar o label do pai
              const depth = Number(node?.depth ?? 0);
              return depth >= 2 ? hexToRgba(base, 0.85) : base;
            }}
            borderColor="#ffffff"
            borderWidth={2}
            enableParentLabel={true}
            tooltip={({ node }: any) => {
              const name = String(node?.id ?? "");
              const parent = String(node?.parent?.id ?? "");
              const value = Number(node?.value ?? 0);
              return (
                <div className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs text-slate-900 shadow-xl">
                  <div className="font-extrabold">{parent ? `${parent} • ${name}` : name}</div>
                  <div className="mt-1">{formatBRLNoSpace(value)}</div>
                </div>
              );
            }}
            theme={{
              labels: { text: { fill: "#0f172a", fontWeight: 700 } },
              tooltip: { container: { background: "#fff", color: "#0f172a", fontSize: 12, borderRadius: 12 } },
            }}
          />
        </div>
      </Card>

      {/* Linha 1: categorias x subcategorias */}
      <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-12">
        <Card className="w-full border-slate-200 bg-white p-5 lg:col-span-6">
          <div className="text-lg font-extrabold text-slate-900">Categorias vendidas</div>
          <div className="mt-3" style={{ height: 320 }}>
            <ResponsiveBar
              data={categoryBars.map((d) => ({ categoria: d.id, faturamento: d.value })) as any}
              keys={["faturamento"]}
              indexBy="categoria"
              margin={{ top: 10, right: 16, bottom: 70, left: 92 }}
              padding={0.35}
              colors={({ indexValue }: any) => {
                const id = String(indexValue ?? "");
                const hasActive = parentCategory.length === 1;
                if (hasActive && parentCategory[0] !== id) return hexToRgba("#FF751A", 0.2);
                return "#FF751A";
              }}
              borderRadius={6}
              enableGridX={false}
              enableGridY={true}
              axisLeft={{ format: (v) => formatBRLCompact(Number(v)), legend: "" }}
              axisBottom={{ tickRotation: -25, tickPadding: 10 }}
              enableLabel={false}
              tooltip={({ indexValue, value }: any) => (
                <div className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs text-slate-900 shadow-xl">
                  <div className="font-extrabold">{String(indexValue)}</div>
                  <div>{formatBRLNoSpace(Number(value))}</div>
                </div>
              )}
              theme={{
                axis: { ticks: { text: { fill: "#475569" } }, legend: { text: { fill: "#334155", fontWeight: 700 } } },
                grid: { line: { stroke: "#E2E8F0" } },
                tooltip: { container: { background: "#fff", color: "#0f172a", fontSize: 12, borderRadius: 12 } },
              }}
              onClick={(bar: any) => toggleSingle(setParentCategory, parentCategory, String(bar?.indexValue ?? ""))}
            />
          </div>
          {activeParent ? (
            <div className="mt-2 text-xs text-slate-600">
              Categoria pai ativa: <span className="font-semibold text-slate-900">{activeParent}</span>
            </div>
          ) : null}
        </Card>

        <Card className="w-full border-slate-200 bg-white p-5 lg:col-span-6">
          <div className="text-lg font-extrabold text-slate-900">Subcategorias ({activeParent || "Selecione uma categoria"})</div>
          <div className="mt-3" style={{ height: 320 }}>
            <ResponsiveBar
              data={subcategoryBars.map((d) => ({ subcategoria: d.id, faturamento: d.value })) as any}
              keys={["faturamento"]}
              indexBy="subcategoria"
              margin={{ top: 10, right: 16, bottom: 70, left: 92 }}
              padding={0.35}
              colors="#FF751A"
              borderRadius={6}
              enableGridX={false}
              enableGridY={true}
              axisLeft={{ format: (v) => formatBRLCompact(Number(v)), legend: "" }}
              axisBottom={{ tickRotation: -25, tickPadding: 10 }}
              enableLabel={false}
              tooltip={({ indexValue, value }: any) => (
                <div className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs text-slate-900 shadow-xl">
                  <div className="font-extrabold">{String(indexValue)}</div>
                  <div>{formatBRLNoSpace(Number(value))}</div>
                </div>
              )}
              theme={{
                axis: { ticks: { text: { fill: "#475569" } }, legend: { text: { fill: "#334155", fontWeight: 700 } } },
                grid: { line: { stroke: "#E2E8F0" } },
                tooltip: { container: { background: "#fff", color: "#0f172a", fontSize: 12, borderRadius: 12 } },
              }}
            />
          </div>
        </Card>
      </div>

      {/* Linha 2: produtos mais vendidos + marketplaces */}
      <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-12">
        <Card className="w-full border-slate-200 bg-white p-5 lg:col-span-6">
          <div className="text-lg font-extrabold text-slate-900">Produtos mais vendidos</div>
          <div className="mt-3 overflow-hidden rounded-xl border border-slate-200">
            <table className="w-full text-left text-sm">
              <thead className="bg-slate-50">
                <tr className="text-xs font-extrabold text-slate-600">
                  <th className="px-4 py-3">Produto</th>
                  <th className="px-4 py-3 text-right">
                    <button
                      type="button"
                      onClick={() =>
                        setProductSort((cur) => ({
                          key: "qty",
                          dir: cur.key === "qty" ? (cur.dir === "asc" ? "desc" : "asc") : "desc",
                        }))
                      }
                      className="inline-flex items-center gap-2 hover:text-slate-900"
                    >
                      Quantidade
                      <span className="text-slate-400">{productSort.key === "qty" ? (productSort.dir === "asc" ? "▲" : "▼") : ""}</span>
                    </button>
                  </th>
                  <th className="px-4 py-3 text-right">
                    <button
                      type="button"
                      onClick={() =>
                        setProductSort((cur) => ({
                          key: "revenue",
                          dir: cur.key === "revenue" ? (cur.dir === "asc" ? "desc" : "asc") : "desc",
                        }))
                      }
                      className="inline-flex items-center gap-2 hover:text-slate-900"
                    >
                      Faturamento
                      <span className="text-slate-400">
                        {productSort.key === "revenue" ? (productSort.dir === "asc" ? "▲" : "▼") : ""}
                      </span>
                    </button>
                  </th>
                </tr>
              </thead>
              <tbody>
                {sortedTopProducts.map((p) => (
                  <tr key={p.name} className="border-t border-slate-200">
                    <td className="px-4 py-3">
                      <div className="min-w-0">
                        <div className="font-semibold text-slate-900 truncate">{p.name}</div>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-right font-extrabold text-slate-900 tabular-nums">{p.qty}</td>
                    <td className="px-4 py-3 text-right font-extrabold text-slate-900 tabular-nums">{formatBRLNoSpace(p.revenue)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>

        <div className="grid grid-cols-1 gap-4 lg:col-span-6">
          <Card className="w-full border-slate-200 bg-white p-5">
            <div className="text-lg font-extrabold text-slate-900">Faturamento por marketplace</div>
            <div className="mt-3" style={{ height: 280 }}>
              <ResponsivePie
                data={pieByMarketplace as any}
                margin={{ top: 10, right: 10, bottom: 10, left: 10 }}
                innerRadius={0.55}
                padAngle={0.8}
                cornerRadius={6}
                activeOuterRadiusOffset={8}
                colors={(d: any) => {
                  const id = String(d?.id ?? "");
                  const base = marketplaceColorById.get(id) || CHART_COLORS[0];
                  const hasActive = channels.length === 1;
                  if (hasActive && channels[0] !== id) return hexToRgba(base, 0.2);
                  return base;
                }}
                enableArcLinkLabels={false}
                arcLabelsSkipAngle={10}
                arcLabelsTextColor="#0f172a"
                onClick={(d: any) => toggleSingle(setChannels, channels, String(d.id))}
                valueFormat={(v: any) => formatBRLNoSpace(Number(v))}
                arcLabel={(d: any) => formatBRLNoSpace(Number(d.value))}
                tooltip={({ datum }: any) => (
                  <div className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs text-slate-900 shadow-xl">
                    <div className="font-extrabold">{datum.label}</div>
                    <div>{formatBRLNoSpace(datum.value)}</div>
                  </div>
                )}
              />
            </div>
            {channels.length ? (
              <div className="mt-2 text-xs text-slate-600">
                Marketplace ativo: <span className="font-semibold text-slate-900">{channels.join(", ")}</span>
              </div>
            ) : null}
          </Card>

          <Card className="w-full border-slate-200 bg-white p-5">
            <div className="text-lg font-extrabold text-slate-900">Faturamento por marca</div>
            <div className="mt-3" style={{ height: 280 }}>
              <ResponsiveBar
                data={brands.map((d) => ({ marca: d.id, faturamento: d.value })) as any}
                keys={["faturamento"]}
                indexBy="marca"
                margin={{ top: 10, right: 16, bottom: 70, left: 92 }}
                padding={0.35}
                colors="#FF751A"
                borderRadius={6}
                enableGridX={false}
                enableGridY={true}
                axisLeft={{ format: (v) => formatBRLCompact(Number(v)), legend: "" }}
                axisBottom={{ tickRotation: -25, tickPadding: 10 }}
                enableLabel={false}
                tooltip={({ indexValue, value }: any) => (
                  <div className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs text-slate-900 shadow-xl">
                    <div className="font-extrabold">{String(indexValue)}</div>
                    <div>{formatBRLNoSpace(Number(value))}</div>
                  </div>
                )}
                theme={{
                  axis: { ticks: { text: { fill: "#475569" } }, legend: { text: { fill: "#334155", fontWeight: 700 } } },
                  grid: { line: { stroke: "#E2E8F0" } },
                  tooltip: { container: { background: "#fff", color: "#0f172a", fontSize: 12, borderRadius: 12 } },
                }}
              />
            </div>
          </Card>

          <Card className="w-full border-slate-200 bg-white p-5">
            <div className="text-lg font-extrabold text-slate-900">Vendas por estado</div>
            <div className="mt-3 relative w-full" style={{ height: mapHeight }} ref={mapWrapRef}>
              {geoFeatures.length > 0 && mapWidth > 0 && mapPath ? (
                <>
                  <svg width={mapWidth} height={mapHeight} role="img" aria-label="Mapa do Brasil por estado">
                    {geoFeatures.map((f: any) => {
                      const id = String(f?.id || f?.properties?.id || "");
                      const v = salesByUFMap.get(id);
                      const selectedOne = states.length === 1;
                      const dim = selectedOne && states[0] !== id;
                      const active = selectedOne && states[0] === id;
                      const fill = v == null ? mapUnknownColor : mapScale(v);
                      const d = mapPath(f);
                      if (!d) return null;
                      return (
                        <path
                          key={id}
                          d={d}
                          fill={fill}
                          opacity={dim ? 0.2 : 1}
                          stroke={active ? "#0f172a" : "#CBD5E1"}
                          strokeWidth={active ? 1.25 : 0.6}
                          onClick={() => toggleSingle(setStates, states, id)}
                          onMouseLeave={() => setMapHover(null)}
                          onMouseMove={(e) => {
                            const rect = (e.currentTarget.ownerSVGElement as SVGSVGElement | null)?.getBoundingClientRect();
                            const x = rect ? e.clientX - rect.left : 0;
                            const y = rect ? e.clientY - rect.top : 0;
                            setMapHover({ id, value: v ?? null, x, y });
                          }}
                          style={{ cursor: "pointer" }}
                        />
                      );
                    })}
                  </svg>

                  {mapHover ? (
                    <div
                      className="pointer-events-none absolute z-10 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs text-slate-900 shadow-xl"
                      style={{
                        left: Math.min(mapWidth - 160, Math.max(8, mapHover.x + 12)),
                        top: Math.min(mapHeight - 48, Math.max(8, mapHover.y - 12)),
                        width: 160,
                      }}
                    >
                      <div className="font-extrabold">{mapHover.id}</div>
                      <div>{formatBRLNoSpace(mapHover.value ?? 0)}</div>
                    </div>
                  ) : null}
                </>
              ) : (
                <div className="flex h-full items-center justify-center text-sm text-slate-500">
                  {!geoFeatures.length ? "GeoJSON inválido (sem features)" : !mapWidth ? "Carregando largura do container..." : "Carregando mapa..."}
                </div>
              )}
            </div>
          </Card>
        </div>
      </div>

      {/* Drawer de filtros */}
      <SlideOver open={filtersOpen} title="Filtros" onClose={() => setFiltersOpen(false)}>
        {filtersLoading ? <div className="text-slate-700">Carregando filtros...</div> : null}
        {!filtersLoading && filtersError ? <div className="text-sm text-red-600">{filtersError}</div> : null}
        {!filtersLoading && !filtersError && filters ? (
          <div className="space-y-4">
            <MultiSelect label="Status" options={statusOptions} values={status} onChange={setStatus} placeholder="Todos" />
            <MultiSelect label="Loja" options={storeOptions} values={stores} onChange={setStores} placeholder="Todas" />
            <MultiSelect label="Canal" options={channelOptions} values={channels} onChange={setChannels} placeholder="Todos" />
            <MultiSelect label="Categoria" options={categoryOptions} values={categories} onChange={setCategories} placeholder="Todas" />
            <MultiSelect
              label="Produto"
              options={productSelectOptions}
              values={productValues}
              onChange={setProductValues}
              placeholder="Buscar por SKU ou nome"
              onSearchChange={setProductQuery}
              searchPlaceholder="Digite para buscar..."
            />
            <MultiSelect label="Estado" options={stateOptions} values={states} onChange={setStates} placeholder="Todos" />
            <MultiSelect label="Cidade" options={cityOptions} values={cities} onChange={setCities} placeholder="Todas" />
            {citiesLoading ? <div className="text-xs text-slate-600">Carregando cidades...</div> : null}
            {!citiesLoading && citiesError ? <div className="text-xs text-red-600">{citiesError}</div> : null}
            <div className="pt-2 text-xs text-slate-600">
              Placeholder: depois a gente liga isso nas queries reais (por enquanto só reescala números fakes para demonstrar a interação).
            </div>
          </div>
        ) : null}
      </SlideOver>
    </div>
  );
};

export default DashboardItens;


