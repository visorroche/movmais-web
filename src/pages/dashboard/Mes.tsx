import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { ResponsiveLine } from "@nivo/line";
import { ResponsivePie } from "@nivo/pie";
import { ResponsiveBar } from "@nivo/bar";
import { line as d3Line } from "d3-shape";
import { geoMercator, geoPath } from "d3-geo";
import { scaleQuantize } from "d3-scale";
import { SlidersHorizontal, TrendingDown, TrendingUp } from "lucide-react";
import brStates from "@/assets/geo/br_states.json";
import { Card } from "@/components/ui/card";
import { SlideOver } from "@/components/ui/slideover";
import { MultiSelect, type MultiSelectOption } from "@/components/ui/multi-select";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { CHART_COLORS } from "@/lib/chartColors";
import { buildApiUrl } from "@/lib/config";
import { getAuthHeaders } from "@/lib/auth";
import { ProductThumb } from "@/components/products/ProductThumb";
import { ProductDetailSlideOver } from "@/components/products/ProductDetailSlideOver";
import { marketplaceColorOrFallback } from "@/lib/marketplaceColors";

type FiltersResponse = {
  stores: { id: number; name: string }[];
  channels: string[];
  categories: string[];
  states: string[];
  cities: string[];
};

type MonthKpis = {
  revenueSoFar: number;
  revenueMonth: number;
  orders: number;
  uniqueCustomers: number;
  itemsSold: number;
  skusCount: number;
  avgTicket: number;
  cartItemsAdded: number;
  conversionPct: number;
};

type MonthOverviewResponse = {
  month: string; // YYYY-MM
  isLiveMonth: boolean;
  currentDay: number; // 1..daysInMonth (se não live, último dia do mês)
  daysInMonth: number;
  projection: { projectedMonthTotal: number };
  kpis: { selected: MonthKpis; m1: MonthKpis; m2: MonthKpis; m6: MonthKpis; m12: MonthKpis };
  daily: { period: "selected" | "m1" | "m2" | "m6" | "m12"; day: number; revenue: number }[];
  topProducts: { productId: number | null; sku: string; name: string | null; photo?: string | null; url?: string | null; qty: number; revenue: number }[];
  byProductTable: { productId: number | null; sku: string; name: string | null; revenue: number; ordersCount: number; avgTicket: number }[];
  byProductTableM1: { productId: number | null; sku: string; name: string | null; revenue: number; ordersCount: number; avgTicket: number }[];
  byMarketplace: { id: string; value: number }[];
  byMarketplaceTableByPeriod: Record<"selected" | "m1" | "m2" | "m6" | "m12", { id: string; revenue: number; ordersCount: number; avgTicket: number }[]>;
  byCategory: { id: string; value: number }[];
  byCategoryTableByPeriod: Record<"selected" | "m1" | "m2" | "m6" | "m12", { id: string; revenue: number; ordersCount: number; avgTicket: number }[]>;
  byState: { id: string; value: number }[];
  byStateTableByPeriod: Record<"selected" | "m1" | "m2" | "m6" | "m12", { id: string; revenue: number; ordersCount: number; avgTicket: number }[]>;
};

type ComparePeriod = "M-1" | "M-2" | "M-6" | "M-12";

const DashboardMes = () => {
  const formatBRLNoSpace = (value: number): string =>
    new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(value).replace(/\u00A0/g, "");
  const formatBRLCompact = (value: number): string =>
    new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", notation: "compact", maximumFractionDigits: 1 })
      .format(value)
      .replace(/\u00A0/g, "");
  const formatPct1 = (value: number): string => `${value.toFixed(1).replace(".", ",")}%`;
  const formatInt = (value: number): string => new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 0 }).format(value);

  const pad2 = (n: number) => String(n).padStart(2, "0");
  const toIsoMonth = (d: Date) => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}`;
  const isIsoYm = (v: string) => /^\d{4}-\d{2}$/.test(String(v || "").trim());
  const shiftIsoMonth = (ym: string, deltaMonths: number): string => {
    if (!isIsoYm(ym)) return "";
    const [yStr, mStr] = ym.split("-");
    const y = Number(yStr);
    const m = Number(mStr);
    if (!Number.isInteger(y) || !Number.isInteger(m) || m < 1 || m > 12) return "";
    const d = new Date(y, m - 1 + deltaMonths, 1);
    return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}`;
  };
  const daysInIsoMonth = (ym: string): number => {
    if (!isIsoYm(ym)) return 30;
    const [yStr, mStr] = ym.split("-");
    const y = Number(yStr);
    const m = Number(mStr);
    if (!Number.isInteger(y) || !Number.isInteger(m) || m < 1 || m > 12) return 30;
    return new Date(y, m, 0).getDate(); // último dia do mês
  };
  const formatIsoMonthRangeBR = (ym: string, endDay: number): string => {
    if (!isIsoYm(ym)) return "—";
    const [yStr, mStr] = ym.split("-");
    const y = Number(yStr);
    const m = Number(mStr);
    if (!Number.isInteger(y) || !Number.isInteger(m) || m < 1 || m > 12) return "—";
    const last = daysInIsoMonth(ym);
    const end = Math.min(Math.max(1, Number(endDay || 1) || 1), last);
    return `01/${pad2(m)}/${yStr} a ${pad2(end)}/${pad2(m)}/${yStr}`;
  };

  const [month, setMonth] = useState<string>(() => toIsoMonth(new Date()));
  const [comparePeriod, setComparePeriod] = useState<ComparePeriod>("M-1");
  const [selectedProductId, setSelectedProductId] = useState<number | null>(null);

  type CategoryDrillLevel = "category" | "subcategory" | "final";
  const [categoryLevel, setCategoryLevel] = useState<CategoryDrillLevel>("category");
  const [drillCategory, setDrillCategory] = useState<string>("");
  const [drillSubcategory, setDrillSubcategory] = useState<string>("");

  // filtros (mesma base do AoVivo)
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [filtersLoading, setFiltersLoading] = useState(true);
  const [filtersError, setFiltersError] = useState<string | null>(null);
  const [filters, setFilters] = useState<FiltersResponse | null>(null);
  const [stores, setStores] = useState<string[]>([]);
  const [channels, setChannels] = useState<string[]>([]);
  const [categories, setCategories] = useState<string[]>([]);
  const [states, setStates] = useState<string[]>([]);
  const [cities, setCities] = useState<string[]>([]);
  const [citiesOverride, setCitiesOverride] = useState<string[] | null>(null);
  const [citiesLoading, setCitiesLoading] = useState(false);
  const [citiesError, setCitiesError] = useState<string | null>(null);
  const initialStoresSet = useRef(false);

  const [data, setData] = useState<MonthOverviewResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const ac = new AbortController();
    setFiltersLoading(true);
    setFiltersError(null);
    fetch(buildApiUrl("/companies/me/dashboard/filters"), { headers: { ...getAuthHeaders() }, signal: ac.signal })
      .then(async (res) => {
        if (!res.ok) {
          const d = await res.json().catch(() => ({}));
          throw new Error((d as any)?.message || "Erro ao carregar filtros");
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
    fetch(buildApiUrl(`/companies/me/dashboard/cities?${qs.toString()}`), { headers: { ...getAuthHeaders() }, signal: ac.signal })
      .then(async (res) => {
        if (!res.ok) {
          const d = await res.json().catch(() => ({}));
          throw new Error((d as any)?.message || "Erro ao carregar cidades");
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

  useEffect(() => {
    if (!filters) return;
    if (!initialStoresSet.current) return;
    const ac = new AbortController();
    setLoading(true);
    setError(null);
    const qs = new URLSearchParams();
    qs.set("month", month);
    for (const s of stores) qs.append("company_id", s);
    for (const c of channels) qs.append("channel", c);
    for (const c of categories) qs.append("category", c);
    for (const st of states) qs.append("state", st);
    for (const city of cities) qs.append("city", city);
    qs.set("category_level", categoryLevel);
    if (drillCategory) qs.set("drill_category", drillCategory);
    if (drillSubcategory) qs.set("drill_subcategory", drillSubcategory);
    fetch(buildApiUrl(`/companies/me/dashboard/month/overview?${qs.toString()}`), { headers: { ...getAuthHeaders() }, signal: ac.signal })
      .then(async (res) => {
        if (!res.ok) {
          const d = await res.json().catch(() => ({}));
          throw new Error((d as any)?.message || "Erro ao carregar mês");
        }
        return res.json() as Promise<MonthOverviewResponse>;
      })
      .then((d) => setData(d))
      .catch((e: any) => {
        if (String(e?.name || "") === "AbortError") return;
        setData(null);
        setError(String(e?.message || "Erro ao carregar mês"));
      })
      .finally(() => setLoading(false));
    return () => ac.abort();
  }, [filters, month, stores, channels, categories, states, cities, categoryLevel, drillCategory, drillSubcategory]);

  const storeOptions: MultiSelectOption[] = useMemo(
    () => (filters?.stores || []).map((s) => ({ value: String(s.id), label: s.name })),
    [filters],
  );
  const channelOptions: MultiSelectOption[] = useMemo(() => (filters?.channels || []).map((s) => ({ value: s, label: s })), [filters]);
  const categoryOptions: MultiSelectOption[] = useMemo(() => (filters?.categories || []).map((s) => ({ value: s, label: s })), [filters]);
  const stateOptions: MultiSelectOption[] = useMemo(() => (filters?.states || []).map((s) => ({ value: s, label: s })), [filters]);
  const cityOptions: MultiSelectOption[] = useMemo(
    () => ((citiesOverride ?? filters?.cities) || []).map((s) => ({ value: s, label: s })),
    [citiesOverride, filters],
  );

  const compareKey: "m1" | "m2" | "m6" | "m12" = comparePeriod === "M-1" ? "m1" : comparePeriod === "M-2" ? "m2" : comparePeriod === "M-6" ? "m6" : "m12";

  const pctChange = (cur: number, prev: number): number | null => {
    const p = Number(prev || 0);
    if (p <= 0) return null;
    return (Number(cur || 0) - p) / p;
  };
  const formatPctSigned1 = (ratio: number | null) => {
    if (ratio === null || !Number.isFinite(ratio)) return "—";
    const v = ratio * 100;
    return `${v >= 0 ? "+" : ""}${v.toFixed(1).replace(".", ",")}%`;
  };
  const deltaClass = (ratio: number | null) => {
    if (ratio === null || !Number.isFinite(ratio)) return "text-slate-400";
    if (ratio > 0) return "text-emerald-700";
    if (ratio < 0) return "text-rose-700";
    return "text-slate-700";
  };

  const selectedKpis = data?.kpis?.selected;
  const projectedMonthTotal = data?.projection?.projectedMonthTotal ?? 0;
  const monthSoFar = selectedKpis?.revenueSoFar ?? 0;
  const monthTotal = selectedKpis?.revenueMonth ?? 0;

  const growthRows = useMemo(() => {
    const cur = Number(data?.kpis?.selected?.revenueSoFar ?? 0) || 0;
    const m1 = Number(data?.kpis?.m1?.revenueSoFar ?? 0) || 0;
    const m2 = Number(data?.kpis?.m2?.revenueSoFar ?? 0) || 0;
    const m6 = Number(data?.kpis?.m6?.revenueSoFar ?? 0) || 0;
    const m12 = Number(data?.kpis?.m12?.revenueSoFar ?? 0) || 0;
    const baseMonth = String(data?.month || month || "").trim();
    return [
      { label: "M-1", period: "M-1" as ComparePeriod, value: pctChange(cur, m1), compareRevenue: m1, compareMonth: baseMonth ? shiftIsoMonth(baseMonth, -1) : "" },
      { label: "M-2", period: "M-2" as ComparePeriod, value: pctChange(cur, m2), compareRevenue: m2, compareMonth: baseMonth ? shiftIsoMonth(baseMonth, -2) : "" },
      { label: "M-6", period: "M-6" as ComparePeriod, value: pctChange(cur, m6), compareRevenue: m6, compareMonth: baseMonth ? shiftIsoMonth(baseMonth, -6) : "" },
      { label: "M-12", period: "M-12" as ComparePeriod, value: pctChange(cur, m12), compareRevenue: m12, compareMonth: baseMonth ? shiftIsoMonth(baseMonth, -12) : "" },
    ];
  }, [data, month]);

  const growthBadgeClass = (v: number | null) => {
    if (v === null || !Number.isFinite(v)) return "border-slate-200 bg-slate-50 text-slate-700";
    if (v > 0) return "border-emerald-200 bg-emerald-50 text-emerald-700";
    if (v < 0) return "border-rose-200 bg-rose-50 text-rose-700";
    return "border-slate-200 bg-slate-50 text-slate-700";
  };

  const dailyByPeriod = useMemo(() => {
    const map = new Map<string, Map<number, number>>();
    for (const r of data?.daily || []) {
      const p = String(r.period);
      if (!map.has(p)) map.set(p, new Map());
      map.get(p)!.set(Number(r.day), Number(r.revenue) || 0);
    }
    const days = Number(data?.daysInMonth ?? 30) || 30;
    const build = (key: string) => Array.from({ length: days }, (_, i) => ({ x: pad2(i + 1), y: Number(map.get(key)?.get(i + 1) ?? 0) || 0 }));
    return {
      selected: build("selected"),
      m1: build("m1"),
      m2: build("m2"),
      m6: build("m6"),
      m12: build("m12"),
    };
  }, [data]);

  const lineData = useMemo(() => {
    const isLive = Boolean(data?.isLiveMonth);
    const curDay = Number(data?.currentDay ?? 0) || 0;
    const selected = dailyByPeriod.selected;
    const compare = (dailyByPeriod as any)[compareKey] || dailyByPeriod.m1;

    const selectedActual = selected.map((p, idx) => ({ x: p.x, y: isLive && idx + 1 > curDay ? null : p.y }));

    // projeção simples: usa distribuição do M-1 e escala pelo projectedMonthTotal
    const dist = dailyByPeriod.m1;
    const distTotal = dist.reduce((a, b) => a + (Number(b.y) || 0), 0);
    const projTotal = Number(projectedMonthTotal || 0) || 0;
    const scaled = distTotal > 0 && projTotal > 0 ? dist.map((p) => ({ ...p, y: (Number(p.y) || 0) * (projTotal / distTotal) })) : dist.map((p) => ({ ...p, y: 0 }));
    const projection = scaled.map((p, idx) => ({ x: p.x, y: idx + 1 <= curDay ? (selected[idx]?.y ?? 0) : p.y }));

    return [
      { id: "Mês", data: selectedActual },
      ...(isLive ? [{ id: "Mês (projeção)", data: projection }] : []),
      { id: comparePeriod, data: compare },
    ];
  }, [compareKey, comparePeriod, dailyByPeriod, data?.currentDay, data?.isLiveMonth, projectedMonthTotal]);

  const dashedProjectionLayer = (props: any) => {
    const serie = props.series?.find((s: any) => s.id === "Mês (projeção)");
    if (!serie) return null;
    const pts = (serie.data || []).map((d: any) => d.position);
    const gen = d3Line<any>()
      .x((d) => d.x)
      .y((d) => d.y);
    const d = gen(pts);
    if (!d) return null;
    return (
      <path d={d} fill="none" stroke={CHART_COLORS[6]} strokeWidth={2.5} strokeDasharray="6 6" opacity={0.95} />
    );
  };

  const topProducts = useMemo(() => (data?.topProducts || []).slice(0, 5), [data]);

  // --- tabelas (reuse do padrão do AoVivo)
  type SortDir = "asc" | "desc";
  type TableSortKey = "id" | "revenue" | "revenueDelta" | "prevRevenue" | "avgTicket" | "ticketDelta" | "prevAvgTicket";
  type TableSort = { key: TableSortKey; dir: SortDir };
  const sortIndicator = (sort: TableSort, key: TableSortKey) => (sort.key === key ? (sort.dir === "asc" ? "▲" : "▼") : "");
  const toggleSort = (set: (v: TableSort) => void, cur: TableSort, key: TableSortKey) => {
    if (cur.key === key) set({ key, dir: cur.dir === "asc" ? "desc" : "asc" });
    else set({ key, dir: "desc" });
  };
  const sortRows = <T extends { id: string }>(rows: T[], sort: TableSort, getNumber: (row: T, key: TableSortKey) => number | null): T[] => {
    const dirMul = sort.dir === "asc" ? 1 : -1;
    const out = [...rows];
    out.sort((a, b) => {
      if (sort.key === "id") return String(a.id).localeCompare(String(b.id), "pt-BR") * dirMul;
      const av = getNumber(a, sort.key);
      const bv = getNumber(b, sort.key);
      const aNull = av === null || !Number.isFinite(av);
      const bNull = bv === null || !Number.isFinite(bv);
      if (aNull && bNull) return 0;
      if (aNull) return 1;
      if (bNull) return -1;
      return (Number(av) - Number(bv)) * dirMul;
    });
    return out;
  };

  type TableRow = { id: string; revenue: number; prevRevenue: number; revenueDelta: number | null; avgTicket: number; prevAvgTicket: number; ticketDelta: number | null };
  const buildRowsWithPrev = (list: any[], prevList: any[]): TableRow[] => {
    const prevMap = new Map<string, any>((prevList || []).map((p: any) => [String(p.id), p]));
    return (list || []).map((r: any) => {
      const prev = prevMap.get(String(r.id));
      const revenue = Number(r.revenue || 0) || 0;
      const prevRevenue = Number(prev?.revenue || 0) || 0;
      const avgTicket = Number(r.avgTicket || 0) || 0;
      const prevAvgTicket = Number(prev?.avgTicket || 0) || 0;
      return { id: String(r.id), revenue, prevRevenue, revenueDelta: pctChange(revenue, prevRevenue), avgTicket, prevAvgTicket, ticketDelta: pctChange(avgTicket, prevAvgTicket) };
    });
  };

  const [marketplaceSort, setMarketplaceSort] = useState<TableSort>({ key: "revenue", dir: "desc" });
  const [stateSort, setStateSort] = useState<TableSort>({ key: "revenue", dir: "desc" });
  const [categorySort, setCategorySort] = useState<TableSort>({ key: "revenue", dir: "desc" });

  const marketplaceRows = useMemo(() => {
    const cur = (data?.byMarketplaceTableByPeriod?.selected || []) as any[];
    const prev = (data?.byMarketplaceTableByPeriod?.[compareKey] || []) as any[];
    return buildRowsWithPrev(cur, prev);
  }, [compareKey, data]);
  const stateRows = useMemo(() => {
    const cur = (data?.byStateTableByPeriod?.selected || []) as any[];
    const prev = (data?.byStateTableByPeriod?.[compareKey] || []) as any[];
    return buildRowsWithPrev(cur, prev);
  }, [compareKey, data]);
  const categoryRows = useMemo(() => {
    const cur = (data?.byCategoryTableByPeriod?.selected || []) as any[];
    const prev = (data?.byCategoryTableByPeriod?.[compareKey] || []) as any[];
    return buildRowsWithPrev(cur, prev);
  }, [compareKey, data]);

  const marketplaceRowsSorted = useMemo(
    () =>
      sortRows(marketplaceRows, marketplaceSort, (row, key) => {
        const r: any = row;
        if (key === "revenue") return r.revenue;
        if (key === "prevRevenue") return r.prevRevenue;
        if (key === "revenueDelta") return r.revenueDelta;
        if (key === "avgTicket") return r.avgTicket;
        if (key === "prevAvgTicket") return r.prevAvgTicket;
        if (key === "ticketDelta") return r.ticketDelta;
        return null;
      }),
    [marketplaceRows, marketplaceSort],
  );
  const stateRowsSorted = useMemo(
    () =>
      sortRows(stateRows, stateSort, (row, key) => {
        const r: any = row;
        if (key === "revenue") return r.revenue;
        if (key === "prevRevenue") return r.prevRevenue;
        if (key === "revenueDelta") return r.revenueDelta;
        if (key === "avgTicket") return r.avgTicket;
        if (key === "prevAvgTicket") return r.prevAvgTicket;
        if (key === "ticketDelta") return r.ticketDelta;
        return null;
      }),
    [stateRows, stateSort],
  );
  const categoryRowsSorted = useMemo(
    () =>
      sortRows(categoryRows, categorySort, (row, key) => {
        const r: any = row;
        if (key === "revenue") return r.revenue;
        if (key === "prevRevenue") return r.prevRevenue;
        if (key === "revenueDelta") return r.revenueDelta;
        if (key === "avgTicket") return r.avgTicket;
        if (key === "prevAvgTicket") return r.prevAvgTicket;
        if (key === "ticketDelta") return r.ticketDelta;
        return null;
      }),
    [categoryRows, categorySort],
  );

  // Mapa
  const mapWrapRef = useRef<HTMLDivElement | null>(null);
  const [mapWidth, setMapWidth] = useState(0);
  const mapHeight = 320;
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
    const fc = { type: "FeatureCollection", features: geoFeatures } as any;
    const pad = 10;
    return geoMercator().fitExtent(
      [
        [pad, pad],
        [Math.max(pad + 1, mapWidth - pad), Math.max(pad + 1, mapHeight - pad)],
      ],
      fc,
    );
  }, [geoFeatures, mapHeight, mapWidth]);
  const mapPath = useMemo(() => (mapProjection ? geoPath(mapProjection) : null), [mapProjection]);
  const salesByUF = useMemo(() => (data?.byState || []).map((d) => ({ id: d.id, value: d.value })), [data]);
  const salesByUFMap = useMemo(() => new Map(salesByUF.map((d) => [String(d.id), d.value])), [salesByUF]);
  const mapMax = useMemo(() => Math.max(1, ...salesByUF.map((d) => d.value)), [salesByUF]);
  const MAP_ORANGE_TONES = useMemo(() => ["#FFF3EA", "#FFE4D1", "#FFD2B0", "#FFB885", "#FF9A52", "#FF751A", "#E65F00", "#CC4F00"], []);
  const mapScale = useMemo(() => scaleQuantize<string>().domain([0, mapMax]).range(MAP_ORANGE_TONES), [mapMax, MAP_ORANGE_TONES]);
  const mapUnknownColor = "#E2E8F0";

  const byMarketplacePie = useMemo(() => (data?.byMarketplace || []).map((d) => ({ id: d.id, label: d.id, value: d.value })), [data]);
  const byCategoryBar = useMemo(() => (data?.byCategory || []).map((d) => ({ categoria: String(d.id), faturamento: Number(d.value) })), [data]);

  const truncate50 = (value: string): string => {
    const s = String(value ?? "");
    if (s.length <= 50) return s;
    return `${s.slice(0, 47)}...`;
  };

  const DeltaBadge = ({ current, previous }: { current: number; previous: number }) => {
    if (!Number.isFinite(current) || !Number.isFinite(previous) || previous <= 0) return null;
    const delta = current / previous - 1;
    const pct = Math.abs(delta) * 100;
    const up = delta >= 0;
    return (
      <span className="group relative inline-flex">
        <span
          className={[
            "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-extrabold",
            up ? "border-emerald-200 bg-emerald-50 text-emerald-700" : "border-red-200 bg-red-50 text-red-700",
          ].join(" ")}
        >
          {up ? <TrendingUp className="h-3.5 w-3.5" /> : <TrendingDown className="h-3.5 w-3.5" />}
          {formatPct1(pct)}
        </span>

        {/* Popover ao passar o mouse */}
        <div className="absolute left-1/2 top-0 z-30 hidden -translate-x-1/2 -translate-y-[calc(100%+10px)] group-hover:block">
          <div className="pointer-events-auto w-[230px] rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs text-slate-900 shadow-xl">
            <div className="font-extrabold">Comparativo</div>
            <div className="mt-0.5 text-slate-600">
              Atual: <span className="font-extrabold text-slate-900">{formatInt(Number(current || 0))}</span>
            </div>
            <div className="mt-0.5 text-slate-600">
              Comparativo: <span className="font-extrabold text-slate-900">{formatInt(Number(previous || 0))}</span>
            </div>
          </div>
        </div>
      </span>
    );
  };

  const resetCategoryDrill = () => {
    setCategoryLevel("category");
    setDrillCategory("");
    setDrillSubcategory("");
  };
  const drillDownCategory = (id: string) => {
    const next = String(id ?? "").trim();
    if (!next) return;
    if (categoryLevel === "category") {
      setCategoryLevel("subcategory");
      setDrillCategory(next);
      setDrillSubcategory("");
      return;
    }
    if (categoryLevel === "subcategory") {
      setCategoryLevel("final");
      setDrillSubcategory(next);
      return;
    }
  };
  const CategoryBreadcrumb = () => (
    <div className="mt-1 text-xs text-slate-500">
      <button type="button" className="font-semibold text-slate-700 hover:underline" onClick={resetCategoryDrill}>
        Todas as Categorias
      </button>
      {categoryLevel !== "category" && drillCategory ? (
        <>
          <span className="mx-1 text-slate-400">&gt;</span>
          <button
            type="button"
            className="font-semibold text-slate-700 hover:underline"
            onClick={() => {
              setCategoryLevel("subcategory");
              setDrillSubcategory("");
            }}
          >
            {drillCategory}
          </button>
        </>
      ) : null}
      {categoryLevel === "final" && drillSubcategory ? (
        <>
          <span className="mx-1 text-slate-400">&gt;</span>
          <span className="font-semibold text-slate-700">{drillSubcategory}</span>
        </>
      ) : null}
    </div>
  );

  // Produtos (tabela fixa: Selected vs M-1)
  type ProductTableRow = {
    productId: number | null;
    sku: string;
    name: string;
    revenue: number;
    prevRevenue: number;
    revenueDelta: number | null;
    avgTicket: number;
    prevAvgTicket: number;
    ticketDelta: number | null;
  };
  const [productSort, setProductSort] = useState<TableSort>({ key: "revenue", dir: "desc" });

  const productRows = useMemo(() => {
    const cur = (data?.byProductTable || []) as any[];
    const prevList = (data?.byProductTableM1 || []) as any[];
    const prevMap = new Map<string, any>(prevList.map((p: any) => [String(p.sku), p]));
    return cur.map((r: any) => {
      const prev = prevMap.get(String(r.sku));
      const revenue = Number(r.revenue || 0) || 0;
      const prevRevenue = Number(prev?.revenue || 0) || 0;
      const avgTicket = Number(r.avgTicket || 0) || 0;
      const prevAvgTicket = Number(prev?.avgTicket || 0) || 0;
      return {
        productId: Number(r.productId ?? 0) || null,
        sku: String(r.sku ?? ""),
        name: String(r.name ?? r.sku ?? ""),
        revenue,
        prevRevenue,
        revenueDelta: pctChange(revenue, prevRevenue),
        avgTicket,
        prevAvgTicket,
        ticketDelta: pctChange(avgTicket, prevAvgTicket),
      } as ProductTableRow;
    });
  }, [data]);

  const productRowsSorted = useMemo(
    () =>
      sortRows(
        productRows.map((r) => ({ ...r, id: r.sku } as any)),
        productSort,
        (row: any, key) => {
          if (key === "revenue") return row.revenue;
          if (key === "prevRevenue") return row.prevRevenue;
          if (key === "revenueDelta") return row.revenueDelta;
          if (key === "avgTicket") return row.avgTicket;
          if (key === "prevAvgTicket") return row.prevAvgTicket;
          if (key === "ticketDelta") return row.ticketDelta;
          return null;
        },
      ) as any[],
    [productRows, productSort],
  );

  return (
    <div className="w-full">
      <div className="flex items-center justify-between gap-3">
        <div className="text-sm text-slate-600">
          <Link to="/dashboard" className="font-semibold text-slate-700 hover:text-slate-900 hover:underline">
            Dashboard
          </Link>{" "}
          <span className="text-slate-400">/</span> Vendas do mês
        </div>
        <div className="flex items-center gap-2">
          <div className="w-[160px]">
            <Input
              type="month"
              value={month}
              onChange={(e) => {
                const v = String(e.target.value || "").trim();
                if (!v) return;
                setMonth(v);
              }}
            />
          </div>
          <button
            type="button"
            onClick={() => setFiltersOpen(true)}
            className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
          >
            <SlidersHorizontal className="h-4 w-4" />
            Filtros
          </button>
        </div>
      </div>

      <h1 className="mt-2 text-2xl font-extrabold text-slate-900">Acompanhe suas vendas do mês</h1>
      {loading ? <div className="mt-2 text-sm text-slate-600">Carregando...</div> : null}
      {!loading && error ? <div className="mt-2 text-sm text-red-600">{error}</div> : null}

      <Card className="mt-3 w-full border-slate-200 bg-white p-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="text-sm font-semibold text-slate-600">Faturamento do mês</div>
            <div className="mt-2 text-3xl font-extrabold text-slate-900">{formatBRLNoSpace(monthSoFar)}</div>
            {data?.isLiveMonth ? (
              <div className="mt-1 text-xs text-slate-600">
                Projeção do mês: <span className="font-extrabold text-slate-900">{formatBRLNoSpace(projectedMonthTotal)}</span>
              </div>
            ) : (
              <div className="mt-1 text-xs text-slate-600">
                Total do mês: <span className="font-extrabold text-slate-900">{formatBRLNoSpace(monthTotal)}</span>
              </div>
            )}
          </div>

          <div className="w-full sm:w-[560px]">
            <div className="text-xs font-semibold text-slate-500">Crescimento (até agora)</div>
            <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-4">
              {growthRows.map((g) => (
                <div key={g.label} className="group relative">
                  <button
                    type="button"
                    onClick={() => setComparePeriod(g.period)}
                    className={[
                      "w-full rounded-xl border px-3 py-2 text-left transition-colors hover:brightness-[0.98]",
                      growthBadgeClass(g.value),
                      comparePeriod === g.period ? "ring-2 ring-slate-900/15" : "",
                    ].join(" ")}
                    title={`Clique para comparar o gráfico com ${g.label}`}
                  >
                    <div className="text-[11px] font-extrabold">{g.label}</div>
                    <div className="mt-1 text-sm font-extrabold">
                      {g.value === null ? "—" : new Intl.NumberFormat("pt-BR", { style: "percent", minimumFractionDigits: 1, maximumFractionDigits: 1 }).format(g.value)}
                    </div>
                  </button>

                  {/* Popover ao passar o mouse (mesmo padrão do AoVivo) */}
                  <div className="absolute left-1/2 top-0 z-30 hidden -translate-x-1/2 -translate-y-[calc(100%+10px)] group-hover:block">
                    <div className="pointer-events-auto w-[230px] rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs text-slate-900 shadow-xl">
                      <div className="font-extrabold">{g.label}</div>
                      <div className="mt-0.5 text-slate-600">
                        <span className="font-semibold text-slate-900">
                          {g.compareMonth ? formatIsoMonthRangeBR(String(g.compareMonth), Number(data?.currentDay ?? 1) || 1) : "—"}
                        </span>
                      </div>
                      <div className="mt-1 text-slate-600">
                        Faturamento: <span className="font-extrabold text-slate-900">{formatBRLNoSpace(Number((g as any).compareRevenue || 0))}</span>
                      </div>
                      <div className="mt-2">
                        <button
                          type="button"
                          className="inline-flex items-center rounded-lg border border-slate-200 bg-white px-2 py-1 text-[11px] font-extrabold text-slate-800 hover:bg-slate-50"
                          onClick={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            const nextMonth = String((g as any).compareMonth || "").trim();
                            if (!isIsoYm(nextMonth)) return;
                            setMonth(nextMonth);
                          }}
                          title="Abrir esse mês em detalhes"
                        >
                          Ver mês
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </Card>

      <Card className="mt-4 w-full border-slate-200 bg-white p-5">
        <div className="flex items-center justify-between gap-3">
          <div className="text-lg font-extrabold text-slate-900">Faturamento dia a dia (mês)</div>
          <div className="text-xs text-slate-600">Comparativo: {comparePeriod}</div>
        </div>

        {/* legenda (fora do gráfico) - mesmo padrão do AoVivo */}
        <div className="mt-3 flex flex-wrap items-center gap-x-6 gap-y-2 text-sm">
          <div className="inline-flex items-center gap-2 text-slate-700">
            <span className="h-2.5 w-2.5 rounded-full" style={{ background: CHART_COLORS[1] }} />
            <span className="font-semibold">Mês</span>
          </div>
          <div className="inline-flex items-center gap-2 text-slate-700">
            <span
              className="h-2.5 w-2.5 rounded-full"
              style={{
                background:
                  comparePeriod === "M-1"
                    ? CHART_COLORS[0]
                    : comparePeriod === "M-2"
                      ? CHART_COLORS[2]
                      : comparePeriod === "M-6"
                        ? CHART_COLORS[3]
                        : CHART_COLORS[4],
              }}
            />
            <span className="font-semibold">Comparativo: {comparePeriod}</span>
          </div>
          {data?.isLiveMonth ? (
            <div className="inline-flex items-center gap-2 text-slate-700">
              <span className="h-2.5 w-2.5 rounded-full" style={{ background: CHART_COLORS[6] }} />
              <span className="font-semibold">Mês (projeção)</span>
            </div>
          ) : null}
          <div className="text-xs text-slate-500">Dica: clique nos cards de crescimento para trocar o comparativo.</div>
        </div>

        <div className="mt-3" style={{ height: 360 }}>
          <ResponsiveLine
            data={lineData as any}
            margin={{ top: 10, right: 24, bottom: 48, left: 88 }}
            xScale={{ type: "point" }}
            yScale={{ type: "linear", min: 0, max: "auto", stacked: false }}
            axisBottom={{ tickRotation: -45, legend: "Dia", legendOffset: 40, legendPosition: "middle" }}
            axisLeft={{ format: (v) => formatBRLCompact(Number(v)) }}
            enablePoints={true}
            pointSize={6}
            pointBorderWidth={1}
            pointBorderColor={{ from: "color", modifiers: [["darker", 0.3]] }}
            useMesh={true}
            colors={(d) => {
              const id = String(d.id);
              if (id === "Mês") return CHART_COLORS[1];
              if (id === "Mês (projeção)") return "transparent"; // desenhado via layer pontilhada
              if (id === "M-1") return CHART_COLORS[0];
              if (id === "M-2") return CHART_COLORS[2];
              if (id === "M-6") return CHART_COLORS[3];
              if (id === "M-12") return CHART_COLORS[4];
              return CHART_COLORS[5];
            }}
            legends={[]}
            tooltip={({ point }: any) => (
              <div className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs text-slate-900 shadow-xl">
                <div className="font-extrabold">{String(point?.serieId)}</div>
                <div className="text-slate-600">Dia {String(point?.data?.x ?? "")}</div>
                <div>{formatBRLNoSpace(Number(point?.data?.y ?? 0))}</div>
              </div>
            )}
            theme={{
              axis: { ticks: { text: { fill: "#475569" } }, legend: { text: { fill: "#334155", fontWeight: 700 } } },
              grid: { line: { stroke: "#E2E8F0" } },
              tooltip: { container: { background: "#fff", color: "#0f172a", fontSize: 12, borderRadius: 12 } },
            }}
            layers={["grid", "markers", "areas", "lines", "points", dashedProjectionLayer, "slices", "mesh", "axes"]}
          />
        </div>
      </Card>

      <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-12">
        <Card className="w-full border-slate-200 bg-white p-5 lg:col-span-6">
          <div className="text-lg font-extrabold text-slate-900">Produtos mais vendidos</div>
          <div className="mt-3 space-y-3">
            {topProducts.length ? (
              topProducts.map((p, idx) => {
                const rank = idx + 1;
                const rankStyle = rank === 1 ? "text-[#D4AF37]" : rank === 2 ? "text-[#C0C0C0]" : rank === 3 ? "text-[#CD7F32]" : "text-slate-400";
                const rankSize = rank >= 4 ? "text-[18px]" : "text-[23px]";
                return (
                  <div key={p.sku} className="flex items-start justify-between gap-3 border-t border-slate-200 pt-3 first:border-t-0 first:pt-0">
                    <div className="min-w-0 flex items-center gap-3">
                      <div className={["w-8 shrink-0 flex items-center justify-center font-extrabold leading-none", rankSize, rankStyle].join(" ")} title={`#${rank}`}>
                        {rank}
                      </div>
                      <ProductThumb name={p.name || p.sku} photo={p.photo ?? null} size={40} onClick={() => (p.productId ? setSelectedProductId(p.productId) : undefined)} />
                      <div className="min-w-0">
                        <button
                          type="button"
                          onClick={() => (p.productId ? setSelectedProductId(p.productId) : undefined)}
                          className="text-left text-[12px] font-semibold text-slate-900 truncate hover:underline"
                          title={String(p.name ?? "")}
                        >
                          {String(p.name ?? p.sku).length > 60 ? `${String(p.name ?? p.sku).slice(0, 57)}...` : String(p.name ?? p.sku)}
                        </button>
                        <div className="text-xs text-slate-600">{p.qty} vendidos</div>
                      </div>
                    </div>
                    <div className="shrink-0 text-right">
                      <div className="text-xs text-slate-500">Faturamento</div>
                      <div className="font-extrabold text-slate-900">{formatBRLNoSpace(p.revenue)}</div>
                    </div>
                  </div>
                );
              })
            ) : (
              <div className="text-sm text-slate-500">Sem dados.</div>
            )}
          </div>
        </Card>

        <div className="grid grid-cols-1 gap-4 lg:col-span-6 lg:grid-cols-2">
          {/* Pedidos x Frete (mesmo layout do AoVivo) */}
          <Card className="w-full border-slate-200 bg-white p-5">
            <div className="text-lg font-extrabold text-slate-900">Pedidos x Frete</div>
            <div className="mt-3 space-y-3 text-sm">
              <div>
                <div className="text-xs font-semibold text-slate-500">Itens no carrinho</div>
                <div className="mt-1 flex items-center justify-between gap-2">
                  <div className="text-2xl font-extrabold text-slate-900">{formatInt(selectedKpis?.cartItemsAdded ?? 0)}</div>
                  <span className="shrink-0">
                    <DeltaBadge current={selectedKpis?.cartItemsAdded ?? 0} previous={(data?.kpis as any)?.[compareKey]?.cartItemsAdded ?? 0} />
                  </span>
                </div>
              </div>
              <div>
                <div className="text-xs font-semibold text-slate-500">Itens vendidos</div>
                <div className="mt-1 flex items-center justify-between gap-2">
                  <div className="text-2xl font-extrabold text-slate-900">{formatInt(selectedKpis?.itemsSold ?? 0)}</div>
                  <span className="shrink-0">
                    <DeltaBadge current={selectedKpis?.itemsSold ?? 0} previous={(data?.kpis as any)?.[compareKey]?.itemsSold ?? 0} />
                  </span>
                </div>
              </div>
              <div>
                <div className="text-xs font-semibold text-slate-500">Conversão</div>
                <div className="mt-1 flex items-center justify-between gap-2">
                  <div className="text-2xl font-extrabold text-slate-900">{String(Number(selectedKpis?.conversionPct ?? 0) || 0).replace(".", ",")}%</div>
                  <span className="shrink-0">
                    <DeltaBadge current={selectedKpis?.conversionPct ?? 0} previous={(data?.kpis as any)?.[compareKey]?.conversionPct ?? 0} />
                  </span>
                </div>
              </div>
            </div>
          </Card>

          {/* KPIs do mês */}
          <Card className="w-full border-slate-200 bg-white p-5">
            <div className="text-lg font-extrabold text-slate-900">KPIs do mês</div>
            <div className="mt-3 space-y-2">
              <div className="rounded-xl border border-slate-200 bg-white px-3 py-2">
                <div className="text-xs font-semibold text-slate-500">Pedidos</div>
                <div className="mt-1 flex items-center justify-between gap-2">
                  <div className="text-lg font-extrabold text-slate-900">{selectedKpis?.orders ?? 0}</div>
                  <DeltaBadge current={selectedKpis?.orders ?? 0} previous={(data?.kpis as any)?.[compareKey]?.orders ?? 0} />
                </div>
              </div>
              <div className="rounded-xl border border-slate-200 bg-white px-3 py-2">
                <div className="text-xs font-semibold text-slate-500">Clientes únicos</div>
                <div className="mt-1 flex items-center justify-between gap-2">
                  <div className="text-lg font-extrabold text-slate-900">{selectedKpis?.uniqueCustomers ?? 0}</div>
                  <DeltaBadge current={selectedKpis?.uniqueCustomers ?? 0} previous={(data?.kpis as any)?.[compareKey]?.uniqueCustomers ?? 0} />
                </div>
              </div>
              <div className="rounded-xl border border-slate-200 bg-white px-3 py-2">
                <div className="text-xs font-semibold text-slate-500">Skus</div>
                <div className="mt-1 flex items-center justify-between gap-2">
                  <div className="text-lg font-extrabold text-slate-900">{selectedKpis?.skusCount ?? 0}</div>
                  <DeltaBadge current={selectedKpis?.skusCount ?? 0} previous={(data?.kpis as any)?.[compareKey]?.skusCount ?? 0} />
                </div>
              </div>
              <div className="rounded-xl border border-slate-200 bg-white px-3 py-2">
                <div className="text-xs font-semibold text-slate-500">Ticket médio</div>
                <div className="mt-1 flex items-center justify-between gap-2">
                  <div className="text-lg font-extrabold text-slate-900">{formatBRLNoSpace(selectedKpis?.avgTicket ?? 0)}</div>
                  <DeltaBadge current={selectedKpis?.avgTicket ?? 0} previous={(data?.kpis as any)?.[compareKey]?.avgTicket ?? 0} />
                </div>
              </div>
            </div>
          </Card>
        </div>
      </div>

      {/* Marketplace */}
      <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-12">
        <Card className="w-full border-slate-200 bg-white p-5 lg:col-span-4">
          <div className="text-lg font-extrabold text-slate-900">Faturamento por marketplace</div>
          <div className="mt-3" style={{ height: 280 }}>
            {byMarketplacePie.length ? (
              <ResponsivePie
                data={byMarketplacePie as any}
                margin={{ top: 10, right: 10, bottom: 10, left: 10 }}
                innerRadius={0.55}
                padAngle={0.8}
                cornerRadius={6}
                activeOuterRadiusOffset={8}
                enableArcLinkLabels={false}
                arcLabelsSkipAngle={10}
                arcLabelsTextColor="#0f172a"
                colors={(d: any) => marketplaceColorOrFallback(String(d?.id ?? ""), 0)}
                valueFormat={(v: any) => formatBRLNoSpace(Number(v))}
                arcLabel={(d: any) => formatBRLNoSpace(Number(d.value))}
                theme={{ tooltip: { container: { background: "#fff", color: "#0f172a", fontSize: 12, borderRadius: 12 } } }}
              />
            ) : (
              <div className="flex h-full items-center justify-center text-sm text-slate-500">Sem dados.</div>
            )}
          </div>
        </Card>
        <Card className="w-full border-slate-200 bg-white p-5 lg:col-span-8">
          <div className="text-lg font-extrabold text-slate-900">Marketplaces</div>
          <div className="mt-3 overflow-hidden rounded-xl border border-slate-200">
            <table className="w-full text-left text-sm">
              <thead className="bg-slate-50 text-xs font-extrabold text-slate-700">
                <tr>
                  <th className="px-4 py-3">
                    <button type="button" className="inline-flex items-center gap-1" onClick={() => toggleSort(setMarketplaceSort, marketplaceSort, "id")}>
                      Marketplace <span className="text-[10px]">{sortIndicator(marketplaceSort, "id")}</span>
                    </button>
                  </th>
                  <th className="px-4 py-3">
                    <button type="button" className="inline-flex items-center gap-1" onClick={() => toggleSort(setMarketplaceSort, marketplaceSort, "revenue")}>
                      Total <span className="text-[10px]">{sortIndicator(marketplaceSort, "revenue")}</span>
                    </button>
                  </th>
                  <th className="px-4 py-3">
                    <button type="button" className="inline-flex items-center gap-1" onClick={() => toggleSort(setMarketplaceSort, marketplaceSort, "revenueDelta")}>
                      Var. <span className="text-[10px]">{sortIndicator(marketplaceSort, "revenueDelta")}</span>
                    </button>
                  </th>
                  <th className="px-4 py-3">
                    <button type="button" className="inline-flex items-center gap-1" onClick={() => toggleSort(setMarketplaceSort, marketplaceSort, "prevRevenue")}>
                      Total {comparePeriod} <span className="text-[10px]">{sortIndicator(marketplaceSort, "prevRevenue")}</span>
                    </button>
                  </th>
                  <th className="px-4 py-3">
                    <button type="button" className="inline-flex items-center gap-1" onClick={() => toggleSort(setMarketplaceSort, marketplaceSort, "avgTicket")}>
                      Ticket médio <span className="text-[10px]">{sortIndicator(marketplaceSort, "avgTicket")}</span>
                    </button>
                  </th>
                  <th className="px-4 py-3">
                    <button type="button" className="inline-flex items-center gap-1" onClick={() => toggleSort(setMarketplaceSort, marketplaceSort, "ticketDelta")}>
                      Var. <span className="text-[10px]">{sortIndicator(marketplaceSort, "ticketDelta")}</span>
                    </button>
                  </th>
                  <th className="px-4 py-3">
                    <button type="button" className="inline-flex items-center gap-1" onClick={() => toggleSort(setMarketplaceSort, marketplaceSort, "prevAvgTicket")}>
                      Ticket {comparePeriod} <span className="text-[10px]">{sortIndicator(marketplaceSort, "prevAvgTicket")}</span>
                    </button>
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {marketplaceRowsSorted.length ? (
                  marketplaceRowsSorted.map((r: any) => (
                    <tr key={r.id} className="bg-white hover:bg-slate-50">
                      <td className="px-4 py-3 font-semibold text-slate-900">{String(r.id)}</td>
                      <td className="px-4 py-3 text-slate-700">{formatBRLNoSpace(r.revenue)}</td>
                      <td className={["px-4 py-3 text-xs font-extrabold", deltaClass(r.revenueDelta)].join(" ")}>{formatPctSigned1(r.revenueDelta)}</td>
                      <td className="px-4 py-3 text-slate-700">{formatBRLNoSpace(r.prevRevenue)}</td>
                      <td className="px-4 py-3 text-slate-700">{formatBRLNoSpace(r.avgTicket)}</td>
                      <td className={["px-4 py-3 text-xs font-extrabold", deltaClass(r.ticketDelta)].join(" ")}>{formatPctSigned1(r.ticketDelta)}</td>
                      <td className="px-4 py-3 text-slate-700">{formatBRLNoSpace(r.prevAvgTicket)}</td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td className="px-4 py-3 text-slate-600" colSpan={7}>
                      Sem dados.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </Card>
      </div>

      {/* Estado + Categoria */}
      <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-12">
        <Card className="w-full border-slate-200 bg-white p-5 lg:col-span-4">
          <div className="text-lg font-extrabold text-slate-900">Vendas por estado</div>
          <div className="mt-3 relative w-full" style={{ height: mapHeight }} ref={mapWrapRef}>
            {geoFeatures.length > 0 && mapWidth > 0 && mapPath ? (
              <>
                <svg width={mapWidth} height={mapHeight} role="img" aria-label="Mapa do Brasil por estado">
                  {geoFeatures.map((f: any) => {
                    const id = String(f?.id || f?.properties?.id || "");
                    const v = salesByUFMap.get(id);
                    const fill = v == null ? mapUnknownColor : mapScale(v);
                    const d = mapPath(f);
                    if (!d) return null;
                    return (
                      <path
                        key={id}
                        d={d}
                        fill={fill}
                        stroke="#CBD5E1"
                        strokeWidth={0.6}
                        onMouseLeave={() => setMapHover(null)}
                        onMouseMove={(e) => {
                          const rect = (e.currentTarget.ownerSVGElement as SVGSVGElement | null)?.getBoundingClientRect();
                          const x = rect ? e.clientX - rect.left : 0;
                          const y = rect ? e.clientY - rect.top : 0;
                          setMapHover({ id, value: v ?? null, x, y });
                        }}
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
              <div className="flex h-full items-center justify-center text-sm text-slate-500">Carregando mapa...</div>
            )}
          </div>
        </Card>
        <Card className="w-full border-slate-200 bg-white p-5 lg:col-span-8">
          <div className="text-lg font-extrabold text-slate-900">Estados</div>
          <div className="mt-3 overflow-hidden rounded-xl border border-slate-200">
            <table className="w-full text-left text-sm">
              <thead className="bg-slate-50 text-xs font-extrabold text-slate-700">
                <tr>
                  <th className="px-4 py-3">
                    <button type="button" className="inline-flex items-center gap-1" onClick={() => toggleSort(setStateSort, stateSort, "id")}>
                      Estado <span className="text-[10px]">{sortIndicator(stateSort, "id")}</span>
                    </button>
                  </th>
                  <th className="px-4 py-3">
                    <button type="button" className="inline-flex items-center gap-1" onClick={() => toggleSort(setStateSort, stateSort, "revenue")}>
                      Faturamento <span className="text-[10px]">{sortIndicator(stateSort, "revenue")}</span>
                    </button>
                  </th>
                  <th className="px-4 py-3">
                    <button type="button" className="inline-flex items-center gap-1" onClick={() => toggleSort(setStateSort, stateSort, "revenueDelta")}>
                      Variação <span className="text-[10px]">{sortIndicator(stateSort, "revenueDelta")}</span>
                    </button>
                  </th>
                  <th className="px-4 py-3">
                    <button type="button" className="inline-flex items-center gap-1" onClick={() => toggleSort(setStateSort, stateSort, "prevRevenue")}>
                      Faturamento {comparePeriod} <span className="text-[10px]">{sortIndicator(stateSort, "prevRevenue")}</span>
                    </button>
                  </th>
                  <th className="px-4 py-3">
                    <button type="button" className="inline-flex items-center gap-1" onClick={() => toggleSort(setStateSort, stateSort, "avgTicket")}>
                      Ticket médio <span className="text-[10px]">{sortIndicator(stateSort, "avgTicket")}</span>
                    </button>
                  </th>
                  <th className="px-4 py-3">
                    <button type="button" className="inline-flex items-center gap-1" onClick={() => toggleSort(setStateSort, stateSort, "ticketDelta")}>
                      Variação <span className="text-[10px]">{sortIndicator(stateSort, "ticketDelta")}</span>
                    </button>
                  </th>
                  <th className="px-4 py-3">
                    <button type="button" className="inline-flex items-center gap-1" onClick={() => toggleSort(setStateSort, stateSort, "prevAvgTicket")}>
                      Ticket {comparePeriod} <span className="text-[10px]">{sortIndicator(stateSort, "prevAvgTicket")}</span>
                    </button>
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {stateRowsSorted.length ? (
                  stateRowsSorted.map((r: any) => (
                    <tr key={r.id} className="bg-white hover:bg-slate-50">
                      <td className="px-4 py-3 font-semibold text-slate-900">{String(r.id)}</td>
                      <td className="px-4 py-3 text-slate-700">{formatBRLNoSpace(r.revenue)}</td>
                      <td className={["px-4 py-3 text-xs font-extrabold", deltaClass(r.revenueDelta)].join(" ")}>{formatPctSigned1(r.revenueDelta)}</td>
                      <td className="px-4 py-3 text-slate-700">{formatBRLNoSpace(r.prevRevenue)}</td>
                      <td className="px-4 py-3 text-slate-700">{formatBRLNoSpace(r.avgTicket)}</td>
                      <td className={["px-4 py-3 text-xs font-extrabold", deltaClass(r.ticketDelta)].join(" ")}>{formatPctSigned1(r.ticketDelta)}</td>
                      <td className="px-4 py-3 text-slate-700">{formatBRLNoSpace(r.prevAvgTicket)}</td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td className="px-4 py-3 text-slate-600" colSpan={7}>
                      Sem dados.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </Card>
      </div>

      <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-12">
        <Card className="w-full border-slate-200 bg-white p-5 lg:col-span-4">
          <div className="text-lg font-extrabold text-slate-900">Faturamento por categoria</div>
          <CategoryBreadcrumb />
          <div className="mt-3" style={{ height: 320 }}>
            {byCategoryBar.length ? (
              <ResponsiveBar
                data={byCategoryBar as any}
                keys={["faturamento"]}
                indexBy="categoria"
                layout="horizontal"
                margin={{ top: 10, right: 44, bottom: 40, left: 12 }}
                padding={0.35}
                colors="#FF751A"
                borderRadius={6}
                axisLeft={null}
                axisBottom={{ format: (v) => formatBRLCompact(Number(v)), tickPadding: 8, tickRotation: -20 }}
                enableLabel={true}
                label={(d: any) => String(d.indexValue ?? "")}
                labelSkipWidth={12}
                theme={{ grid: { line: { stroke: "#E2E8F0" } }, tooltip: { container: { background: "#fff", color: "#0f172a", fontSize: 12, borderRadius: 12 } } }}
                onClick={(bar: any) => drillDownCategory(String(bar?.indexValue ?? ""))}
              />
            ) : (
              <div className="flex h-full items-center justify-center text-sm text-slate-500">Sem dados.</div>
            )}
          </div>
        </Card>
        <Card className="w-full border-slate-200 bg-white p-5 lg:col-span-8">
          <div className="text-lg font-extrabold text-slate-900">Categorias</div>
          <CategoryBreadcrumb />
          <div className="mt-3 overflow-hidden rounded-xl border border-slate-200">
            <table className="w-full text-left text-sm">
              <thead className="bg-slate-50 text-xs font-extrabold text-slate-700">
                <tr>
                  <th className="px-4 py-3">
                    <button type="button" className="inline-flex items-center gap-1" onClick={() => toggleSort(setCategorySort, categorySort, "id")}>
                      Categoria <span className="text-[10px]">{sortIndicator(categorySort, "id")}</span>
                    </button>
                  </th>
                  <th className="px-4 py-3">
                    <button type="button" className="inline-flex items-center gap-1" onClick={() => toggleSort(setCategorySort, categorySort, "revenue")}>
                      Faturamento <span className="text-[10px]">{sortIndicator(categorySort, "revenue")}</span>
                    </button>
                  </th>
                  <th className="px-4 py-3">
                    <button type="button" className="inline-flex items-center gap-1" onClick={() => toggleSort(setCategorySort, categorySort, "revenueDelta")}>
                      Var. <span className="text-[10px]">{sortIndicator(categorySort, "revenueDelta")}</span>
                    </button>
                  </th>
                  <th className="px-4 py-3">
                    <button type="button" className="inline-flex items-center gap-1" onClick={() => toggleSort(setCategorySort, categorySort, "prevRevenue")}>
                      Faturamento {comparePeriod} <span className="text-[10px]">{sortIndicator(categorySort, "prevRevenue")}</span>
                    </button>
                  </th>
                  <th className="px-4 py-3">
                    <button type="button" className="inline-flex items-center gap-1" onClick={() => toggleSort(setCategorySort, categorySort, "avgTicket")}>
                      Ticket médio <span className="text-[10px]">{sortIndicator(categorySort, "avgTicket")}</span>
                    </button>
                  </th>
                  <th className="px-4 py-3">
                    <button type="button" className="inline-flex items-center gap-1" onClick={() => toggleSort(setCategorySort, categorySort, "ticketDelta")}>
                      Var. <span className="text-[10px]">{sortIndicator(categorySort, "ticketDelta")}</span>
                    </button>
                  </th>
                  <th className="px-4 py-3">
                    <button type="button" className="inline-flex items-center gap-1" onClick={() => toggleSort(setCategorySort, categorySort, "prevAvgTicket")}>
                      Ticket {comparePeriod} <span className="text-[10px]">{sortIndicator(categorySort, "prevAvgTicket")}</span>
                    </button>
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {categoryRowsSorted.length ? (
                  categoryRowsSorted.map((r: any) => (
                    <tr
                      key={r.id}
                      className="bg-white hover:bg-slate-50"
                      onClick={() => drillDownCategory(String(r.id))}
                      style={{ cursor: "pointer" }}
                      title="Clique para ver o próximo nível"
                    >
                      <td className="px-4 py-3 font-semibold text-slate-900">{String(r.id)}</td>
                      <td className="px-4 py-3 text-slate-700">{formatBRLNoSpace(r.revenue)}</td>
                      <td className={["px-4 py-3 text-xs font-extrabold", deltaClass(r.revenueDelta)].join(" ")}>{formatPctSigned1(r.revenueDelta)}</td>
                      <td className="px-4 py-3 text-slate-700">{formatBRLNoSpace(r.prevRevenue)}</td>
                      <td className="px-4 py-3 text-slate-700">{formatBRLNoSpace(r.avgTicket)}</td>
                      <td className={["px-4 py-3 text-xs font-extrabold", deltaClass(r.ticketDelta)].join(" ")}>{formatPctSigned1(r.ticketDelta)}</td>
                      <td className="px-4 py-3 text-slate-700">{formatBRLNoSpace(r.prevAvgTicket)}</td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td className="px-4 py-3 text-slate-600" colSpan={7}>
                      Sem dados.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </Card>
      </div>

      {/* Tabela final de SKUs (mesmo padrão do AoVivo) */}
      <Card className="mt-4 w-full border-slate-200 bg-white p-5">
        <div className="text-lg font-extrabold text-slate-900">Produtos (M-1)</div>
        <div className="mt-1 text-xs text-slate-500">
          Comparação fixa: Mês selecionado {data?.isLiveMonth ? "(até agora)" : ""} vs M-1{" "}
          {data?.isLiveMonth ? `(01 a ${pad2(Number(data?.currentDay ?? 1) || 1)})` : ""}
        </div>

        <div className="mt-3 overflow-hidden rounded-xl border border-slate-200">
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-50 text-xs font-extrabold text-slate-700">
              <tr>
                <th className="px-4 py-3">
                  <button type="button" className="inline-flex items-center gap-1" onClick={() => toggleSort(setProductSort, productSort, "id")}>
                    SKU <span className="text-[10px]">{sortIndicator(productSort, "id")}</span>
                  </button>
                </th>
                <th className="px-4 py-3">Nome</th>
                <th className="px-4 py-3">
                  <button type="button" className="inline-flex items-center gap-1" onClick={() => toggleSort(setProductSort, productSort, "revenue")}>
                    Faturamento <span className="text-[10px]">{sortIndicator(productSort, "revenue")}</span>
                  </button>
                </th>
                <th className="px-4 py-3">
                  <button type="button" className="inline-flex items-center gap-1" onClick={() => toggleSort(setProductSort, productSort, "prevRevenue")}>
                    Faturamento M-1 <span className="text-[10px]">{sortIndicator(productSort, "prevRevenue")}</span>
                  </button>
                </th>
                <th className="px-4 py-3">
                  <button type="button" className="inline-flex items-center gap-1" onClick={() => toggleSort(setProductSort, productSort, "revenueDelta")}>
                    Variação <span className="text-[10px]">{sortIndicator(productSort, "revenueDelta")}</span>
                  </button>
                </th>
                <th className="px-4 py-3">
                  <button type="button" className="inline-flex items-center gap-1" onClick={() => toggleSort(setProductSort, productSort, "avgTicket")}>
                    Ticket médio <span className="text-[10px]">{sortIndicator(productSort, "avgTicket")}</span>
                  </button>
                </th>
                <th className="px-4 py-3">
                  <button type="button" className="inline-flex items-center gap-1" onClick={() => toggleSort(setProductSort, productSort, "prevAvgTicket")}>
                    Ticket M-1 <span className="text-[10px]">{sortIndicator(productSort, "prevAvgTicket")}</span>
                  </button>
                </th>
                <th className="px-4 py-3">
                  <button type="button" className="inline-flex items-center gap-1" onClick={() => toggleSort(setProductSort, productSort, "ticketDelta")}>
                    Variação <span className="text-[10px]">{sortIndicator(productSort, "ticketDelta")}</span>
                  </button>
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {productRowsSorted.length ? (
                productRowsSorted.map((r: any) => (
                  <tr
                    key={String(r.sku)}
                    className="bg-white hover:bg-slate-50"
                    onClick={() => (r.productId ? setSelectedProductId(Number(r.productId)) : undefined)}
                    style={{ cursor: r.productId ? "pointer" : "default" }}
                    title={r.productId ? "Clique para ver detalhes do produto" : undefined}
                  >
                    <td className="px-4 py-3 font-semibold text-slate-900">{String(r.sku)}</td>
                    <td className="px-4 py-3 text-slate-700 truncate" title={String(r.name || "")}>
                      {truncate50(String(r.name || "-"))}
                    </td>
                    <td className="px-4 py-3 text-slate-700">{formatBRLNoSpace(Number(r.revenue || 0))}</td>
                    <td className="px-4 py-3 text-slate-700">{formatBRLNoSpace(Number(r.prevRevenue || 0))}</td>
                    <td className={["px-4 py-3 text-xs font-extrabold", deltaClass(r.revenueDelta as number | null)].join(" ")}>
                      {formatPctSigned1(r.revenueDelta as number | null)}
                    </td>
                    <td className="px-4 py-3 text-slate-700">{formatBRLNoSpace(Number(r.avgTicket || 0))}</td>
                    <td className="px-4 py-3 text-slate-700">{formatBRLNoSpace(Number(r.prevAvgTicket || 0))}</td>
                    <td className={["px-4 py-3 text-xs font-extrabold", deltaClass(r.ticketDelta as number | null)].join(" ")}>
                      {formatPctSigned1(r.ticketDelta as number | null)}
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td className="px-4 py-6 text-slate-600" colSpan={8}>
                    Sem dados.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>

      <ProductDetailSlideOver open={!!selectedProductId} productId={selectedProductId} onClose={() => setSelectedProductId(null)} />

      <SlideOver open={filtersOpen} title="Filtros (Mês)" onClose={() => setFiltersOpen(false)}>
        {filtersLoading ? <div className="text-slate-700">Carregando filtros...</div> : null}
        {!filtersLoading && filtersError ? <div className="text-sm text-red-600">{filtersError}</div> : null}
        {!filtersLoading && !filtersError && filters ? (
          <div className="space-y-4">
            <MultiSelect label="Loja" options={storeOptions} values={stores} onChange={setStores} placeholder="Todas" />
            <MultiSelect label="Marketplace" options={channelOptions} values={channels} onChange={setChannels} placeholder="Todos" />
            <MultiSelect label="Categoria" options={categoryOptions} values={categories} onChange={setCategories} placeholder="Todas" />
            <MultiSelect label="Estado" options={stateOptions} values={states} onChange={setStates} placeholder="Todos" />
            <MultiSelect label="Cidade" options={cityOptions} values={cities} onChange={setCities} placeholder="Todas" />
            {citiesLoading ? <div className="text-xs text-slate-600">Carregando cidades...</div> : null}
            {!citiesLoading && citiesError ? <div className="text-xs text-red-600">{citiesError}</div> : null}
          </div>
        ) : null}
      </SlideOver>
    </div>
  );
};

export default DashboardMes;

