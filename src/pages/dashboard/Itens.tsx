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

type ProductOption = { id: number; sku: string; name: string | null; brand: string | null; model: string | null; category: string | null };

type ItemsOverviewResponse = {
  companyId: number;
  groupId: number | null;
  start: string;
  end: string;
  topFinalCategories: { final_category: string; revenue: string }[];
  dailyByFinalCategory: { date: string; final_category: string; revenue: string }[];
  categoryTotals: { category: string; revenue: string }[];
  finalCategoryTotals: { category: string; final_category: string; revenue: string }[];
  topProducts: { sku: string; name: string | null; qty: number; revenue: string }[];
  byChannel: { channel: string; revenue: string }[];
  byBrand: { brand: string; revenue: string }[];
  byState: { state: string; revenue: string }[];
  treemapRows: { category: string; subcategory: string; final_category: string; sku: string; name: string | null; revenue: string }[];
};

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

  const [overviewLoading, setOverviewLoading] = useState(false);
  const [overviewError, setOverviewError] = useState<string | null>(null);
  const [overview, setOverview] = useState<ItemsOverviewResponse | null>(null);

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

  // Overview (todos os gráficos) — dados reais
  useEffect(() => {
    const start = String(dateRange.start || "").trim();
    const end = String(dateRange.end || "").trim();
    if (!start || !end) return;
    const ac = new AbortController();

    const qs = new URLSearchParams();
    qs.set("start", start);
    qs.set("end", end);
    for (const id of stores) qs.append("company_id", id);
    for (const s of status) qs.append("status", s);
    for (const ch of channels) qs.append("channel", ch);
    for (const c of categories) qs.append("category", c);
    for (const st of states) qs.append("state", st);
    for (const city of cities) qs.append("city", city);
    for (const sku of productValues) qs.append("sku", sku);

    setOverviewLoading(true);
    setOverviewError(null);
    fetch(buildApiUrl(`/companies/me/dashboard/items/overview?${qs.toString()}`), { headers: { ...getAuthHeaders() }, signal: ac.signal })
      .then(async (res) => {
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          throw new Error((data as any)?.message || "Erro ao carregar itens (overview)");
        }
        return res.json() as Promise<ItemsOverviewResponse>;
      })
      .then((d) => setOverview(d))
      .catch((e: any) => {
        setOverview(null);
        setOverviewError(String(e?.message || "Erro ao carregar itens (overview)"));
      })
      .finally(() => setOverviewLoading(false));

    return () => ac.abort();
  }, [categories, channels, cities, dateRange.end, dateRange.start, productValues, status, states, stores]);

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

  // barras: categorias e subcategorias
  const categoryBars = useMemo(() => {
    const list = (overview?.categoryTotals || []).map((r) => ({ id: String(r.category), value: Number(r.revenue ?? 0) || 0 }));
    return list;
  }, [overview]);

  const [parentCategory, setParentCategory] = useState<string[]>([]);
  const activeParent = parentCategory.length === 1 ? parentCategory[0] : "";

  const subcategoryBars = useMemo(() => {
    const rows = (overview?.finalCategoryTotals || [])
      .filter((r) => (activeParent ? String(r.category) === activeParent : true))
      .map((r) => ({ id: String(r.final_category), value: Number(r.revenue ?? 0) || 0 }));
    return rows;
  }, [activeParent, overview]);

  const topProducts = useMemo(() => {
    return (overview?.topProducts || []).map((p) => ({
      name: String(p.name ?? p.sku),
      qty: Number(p.qty ?? 0) || 0,
      revenue: Number(p.revenue ?? 0) || 0,
    }));
  }, [overview]);

  const [productSort, setProductSort] = useState<{ key: "qty" | "revenue"; dir: "asc" | "desc" }>({
    key: "revenue",
    dir: "desc",
  });

  const [treemapLevel, setTreemapLevel] = useState<"category" | "subcategory" | "final_category" | "product">("final_category");

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

  const pieByMarketplace = useMemo(() => {
    return (overview?.byChannel || []).map((r) => ({
      id: String(r.channel),
      label: String(r.channel),
      value: Number(r.revenue ?? 0) || 0,
    }));
  }, [overview]);
  const marketplaceColorById = useMemo(() => {
    const map = new Map<string, string>();
    for (let i = 0; i < pieByMarketplace.length; i++) {
      map.set(String((pieByMarketplace as any)[i]?.id ?? ""), CHART_COLORS[i % CHART_COLORS.length]);
    }
    return map;
  }, [pieByMarketplace]);

  const brands = useMemo(() => {
    return (overview?.byBrand || []).map((r) => ({ id: String(r.brand), value: Number(r.revenue ?? 0) || 0 }));
  }, [overview]);

  // mapa por UF (faturamento)
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
    return (overview?.byState || []).map((r) => ({ id: String(r.state), value: Number(r.revenue ?? 0) || 0 }));
  }, [overview]);

  const salesByUFMap = useMemo(() => new Map(salesByUF.map((d) => [String(d.id), d.value])), [salesByUF]);
  const mapMax = useMemo(() => Math.max(1, ...salesByUF.map((d) => d.value)), [salesByUF]);
  const MAP_ORANGE_TONES = useMemo(
    () => ["#FFF3EA", "#FFE4D1", "#FFD2B0", "#FFB885", "#FF9A52", "#FF751A", "#E65F00", "#CC4F00"],
    [],
  );
  const mapScale = useMemo(() => scaleQuantize<string>().domain([0, mapMax]).range(MAP_ORANGE_TONES), [mapMax, MAP_ORANGE_TONES]);
  const mapUnknownColor = "#E2E8F0";

  // linha: faturamento dia a dia (por final_category - top 6)
  const daySeries = useMemo(() => {
    const rows = overview?.dailyByFinalCategory || [];
    const grouped = new Map<string, { x: string; y: number }[]>();
    for (const r of rows) {
      const cat = String((r as any).final_category ?? "");
      const x = String((r as any).date ?? "");
      const y = Number((r as any).revenue ?? 0) || 0;
      if (!grouped.has(cat)) grouped.set(cat, []);
      grouped.get(cat)!.push({ x, y });
    }
    return Array.from(grouped.entries()).map(([id, data]) => ({ id, data }));
  }, [overview]);

  const lineColorById = useMemo(() => {
    const map = new Map<string, string>();
    for (let i = 0; i < daySeries.length; i++) map.set(String((daySeries as any)[i]?.id ?? ""), CHART_COLORS[i % CHART_COLORS.length]);
    return map;
  }, [daySeries]);

  const treemapData = useMemo(() => {
    const root: any = { name: "Categorias", children: [] as any[] };
    type Row = { category: string; subcategory: string; final_category: string; sku: string; name: string | null; revenue: string };
    const rows: Row[] = (overview?.treemapRows || []) as any;
    const level = treemapLevel;

    const getLeafName = (r: Row) => {
      if (level === "product") return String(r.name ?? r.sku);
      if (level === "final_category") return String(r.final_category);
      if (level === "subcategory") return String(r.subcategory);
      return String(r.category);
    };

    const addChild = (parent: any, name: string, value: number) => {
      let child = (parent.children || []).find((c: any) => c.name === name);
      if (!child) {
        child = { name, children: [] as any[], value: 0 };
        parent.children = parent.children || [];
        parent.children.push(child);
      }
      child.value = (child.value || 0) + value;
      return child;
    };

    for (const r of rows) {
      const value = Number((r as any).revenue ?? 0) || 0;
      const category = String((r as any).category ?? "(sem categoria)");
      const subcategory = String((r as any).subcategory ?? "(sem sub-categoria)");
      const finalCat = String((r as any).final_category ?? "(sem categoria)");
      const product = String((r as any).name ?? (r as any).sku ?? "(sem sku)");

      if (level === "category") {
        addChild(root, category, value);
        continue;
      }

      const catNode = addChild(root, category, value);
      if (level === "subcategory") {
        addChild(catNode, subcategory, value);
        continue;
      }

      const subNode = addChild(catNode, subcategory, value);
      if (level === "final_category") {
        addChild(subNode, finalCat, value);
        continue;
      }

      const finNode = addChild(subNode, finalCat, value);
      addChild(finNode, product, value);
    }

    return root;
  }, [overview, treemapLevel]);

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

      {filtersLoading || filtersError || productLoading || productError || overviewLoading || overviewError ? (
        <div className="mt-2 space-y-1">
          {filtersLoading ? <div className="text-sm text-slate-700">Carregando filtros...</div> : null}
          {!filtersLoading && filtersError ? <div className="text-sm text-red-600">{filtersError}</div> : null}
          {productLoading ? <div className="text-xs text-slate-600">Buscando produtos...</div> : null}
          {!productLoading && productError ? <div className="text-xs text-red-600">{productError}</div> : null}
          {overviewLoading ? <div className="text-sm text-slate-700">Carregando dados de itens...</div> : null}
          {!overviewLoading && overviewError ? <div className="text-sm text-red-600">{overviewError}</div> : null}
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
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <div className="text-lg font-extrabold text-slate-900">Categorias e subcategorias</div>
            <div className="mt-1 text-sm text-slate-600">Hierarquia: Categoria → Sub-categoria → Categoria Final → Produto</div>
          </div>
          <div className="inline-flex overflow-hidden rounded-xl border border-slate-200 bg-white">
            <button
              type="button"
              onClick={() => setTreemapLevel("category")}
              className={[
                "px-3 py-1.5 text-sm font-semibold",
                treemapLevel === "category" ? "bg-slate-900 text-white" : "bg-white text-slate-700 hover:bg-slate-50",
              ].join(" ")}
            >
              Categoria
            </button>
            <button
              type="button"
              onClick={() => setTreemapLevel("subcategory")}
              className={[
                "px-3 py-1.5 text-sm font-semibold border-l border-slate-200",
                treemapLevel === "subcategory" ? "bg-slate-900 text-white" : "bg-white text-slate-700 hover:bg-slate-50",
              ].join(" ")}
            >
              Sub-cat.
            </button>
            <button
              type="button"
              onClick={() => setTreemapLevel("final_category")}
              className={[
                "px-3 py-1.5 text-sm font-semibold border-l border-slate-200",
                treemapLevel === "final_category" ? "bg-slate-900 text-white" : "bg-white text-slate-700 hover:bg-slate-50",
              ].join(" ")}
            >
              Cat. final
            </button>
            <button
              type="button"
              onClick={() => setTreemapLevel("product")}
              className={[
                "px-3 py-1.5 text-sm font-semibold border-l border-slate-200",
                treemapLevel === "product" ? "bg-slate-900 text-white" : "bg-white text-slate-700 hover:bg-slate-50",
              ].join(" ")}
            >
              Produto
            </button>
          </div>
        </div>
        <div className="mt-3" style={{ height: 420 }}>
          <ResponsiveTreeMap
            data={treemapData as any}
            identity="name"
            value="value"
            margin={{ top: 8, right: 8, bottom: 8, left: 8 }}
            label={(node: any) => {
              // Garante rótulo nas "últimas áreas" (folhas): sempre mostra o id do nó folha.
              const hasChildren = Array.isArray((node as any)?.children) && (node as any).children.length > 0;
              if (!hasChildren) {
                const full = String(node?.id ?? "");
                // Limita para 10 caracteres no label (incluindo "...")
                if (full.length > 10) return `${full.slice(0, 7)}...`;
                return full;
              }
              return "";
            }}
            labelSkipSize={treemapLevel === "product" ? 6 : treemapLevel === "final_category" ? 10 : 14}
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
                      Qtd.
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
                        <div className="font-semibold text-slate-900 truncate text-[11px]" title={String(p.name || "")}>
                          {String(p.name || "").length > 50 ? `${String(p.name).slice(0, 50)}...` : String(p.name)}
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-right text-slate-900 tabular-nums">{p.qty}</td>
                    <td className="px-4 py-3 text-right text-slate-900 tabular-nums">{formatBRLNoSpace(p.revenue)}</td>
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
            <div className="pt-2 text-xs text-slate-600">Os filtros desta tela afetam os gráficos usando orders + order_items + products.</div>
          </div>
        ) : null}
      </SlideOver>
    </div>
  );
};

export default DashboardItens;


