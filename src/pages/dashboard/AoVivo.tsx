import { useEffect, useMemo, useRef, useState } from "react";
import { Card } from "@/components/ui/card";
import { Link, useSearchParams } from "react-router-dom";
import { ResponsiveLine } from "@nivo/line";
import { ResponsivePie } from "@nivo/pie";
import { ResponsiveBar } from "@nivo/bar";
import { line as d3Line } from "d3-shape";
import { geoMercator, geoPath } from "d3-geo";
import { scaleQuantize } from "d3-scale";
import { SlideOver } from "@/components/ui/slideover";
import { MultiSelect, type MultiSelectOption } from "@/components/ui/multi-select";
import { DatePicker, formatDateBR } from "@/components/ui/date-picker";
import { CHART_COLORS } from "@/lib/chartColors";
import { buildApiUrl } from "@/lib/config";
import { getAuthHeaders } from "@/lib/auth";
import { TrendingDown, TrendingUp, SlidersHorizontal } from "lucide-react";
import brStates from "@/assets/geo/br_states.json";
import { ProductThumb } from "@/components/products/ProductThumb";
import { ProductDetailSlideOver } from "@/components/products/ProductDetailSlideOver";
import { marketplaceColorOrFallback } from "@/lib/marketplaceColors";

const DashboardAoVivo = () => {
  const formatBRLNoSpace = (value: number): string =>
    new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(value).replace(/\u00A0/g, "");

  const formatInt = (value: number): string => new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 0 }).format(value);

  const formatBRLCompact = (value: number): string =>
    new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", notation: "compact", maximumFractionDigits: 1 })
      .format(value)
      .replace(/\u00A0/g, "");

  const formatPct1 = (value: number): string => `${value.toFixed(1).replace(".", ",")}%`;

  const truncate60 = (value: string): string => {
    const s = String(value ?? "");
    if (s.length <= 60) return s;
    return `${s.slice(0, 57)}...`;
  };

  const truncate50 = (value: string): string => {
    const s = String(value ?? "");
    if (s.length <= 50) return s;
    return `${s.slice(0, 47)}...`;
  };

  const hexToRgba = (hex: string, alpha: number): string => {
    const h = String(hex || "").replace("#", "").trim();
    if (h.length !== 6) return hex;
    const r = parseInt(h.slice(0, 2), 16);
    const g = parseInt(h.slice(2, 4), 16);
    const b = parseInt(h.slice(4, 6), 16);
    const a = Math.max(0, Math.min(1, alpha));
    return `rgba(${r}, ${g}, ${b}, ${a})`;
  };

  const DeltaBadge = ({
    current,
    previous,
    compareLabel,
    formatValue,
  }: {
    current: number;
    previous: number;
    compareLabel: string;
    formatValue: (n: number) => string;
  }) => {
    if (!Number.isFinite(current) || !Number.isFinite(previous) || previous <= 0) return null;
    const ratio = current / previous;
    const delta = ratio - 1;
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
              Hoje: <span className="font-extrabold text-slate-900">{formatValue(current)}</span>
            </div>
            <div className="mt-0.5 text-slate-600">
              {compareLabel}: <span className="font-extrabold text-slate-900">{formatValue(previous)}</span>
            </div>
          </div>
        </div>
      </span>
    );
  };

  const now = new Date();
  const currentHour = now.getHours();
  type HourlyRow = { day: string; hour: number; revenue: number };
  type LiveKpis = {
    revenueSoFar: number;
    revenueDay: number;
    orders: number;
    uniqueCustomers: number;
    itemsSold: number;
    skusCount: number;
    avgTicket: number;
    cartItemsAdded: number;
    conversionPct: number;
  };
  type LiveResponse = {
    today: string;
    currentHour: number;
    isLive?: boolean;
    projection: { projectedTodayTotal: number };
    kpis: {
      today: LiveKpis;
      yesterday: LiveKpis;
      d7: LiveKpis;
      d14: LiveKpis;
      d21: LiveKpis;
      d28: LiveKpis;
    };
    hourly: HourlyRow[];
    topProducts: { productId: number | null; sku: string; name: string | null; photo?: string | null; url?: string | null; qty: number; revenue: number }[];
    byMarketplace: { id: string; value: number }[];
    byMarketplaceTable?: { id: string; revenue: number; ordersCount: number; avgTicket: number }[];
    byMarketplaceTableByPeriod?: {
      today: { id: string; revenue: number; ordersCount: number; avgTicket: number }[];
      yesterday: { id: string; revenue: number; ordersCount: number; avgTicket: number }[];
      d7: { id: string; revenue: number; ordersCount: number; avgTicket: number }[];
      d14: { id: string; revenue: number; ordersCount: number; avgTicket: number }[];
      d21: { id: string; revenue: number; ordersCount: number; avgTicket: number }[];
      d28: { id: string; revenue: number; ordersCount: number; avgTicket: number }[];
    };
    byCategoryTable?: { id: string; revenue: number; ordersCount: number; avgTicket: number }[];
    byCategoryTableByPeriod?: {
      today: { id: string; revenue: number; ordersCount: number; avgTicket: number }[];
      yesterday: { id: string; revenue: number; ordersCount: number; avgTicket: number }[];
      d7: { id: string; revenue: number; ordersCount: number; avgTicket: number }[];
      d14: { id: string; revenue: number; ordersCount: number; avgTicket: number }[];
      d21: { id: string; revenue: number; ordersCount: number; avgTicket: number }[];
      d28: { id: string; revenue: number; ordersCount: number; avgTicket: number }[];
    };
    byStateTable?: { id: string; revenue: number; ordersCount: number; avgTicket: number }[];
    byStateTableByPeriod?: {
      today: { id: string; revenue: number; ordersCount: number; avgTicket: number }[];
      yesterday: { id: string; revenue: number; ordersCount: number; avgTicket: number }[];
      d7: { id: string; revenue: number; ordersCount: number; avgTicket: number }[];
      d14: { id: string; revenue: number; ordersCount: number; avgTicket: number }[];
      d21: { id: string; revenue: number; ordersCount: number; avgTicket: number }[];
      d28: { id: string; revenue: number; ordersCount: number; avgTicket: number }[];
    };
    byProductTable?: { productId: number | null; sku: string; name: string | null; revenue: number; ordersCount: number; avgTicket: number }[];
    byProductTableD1?: { productId: number | null; sku: string; name: string | null; revenue: number; ordersCount: number; avgTicket: number }[];
    byCategory: { id: string; value: number }[];
    byState: { id: string; value: number }[];
  };
  const [live, setLive] = useState<LiveResponse | null>(null);
  const [selectedProductId, setSelectedProductId] = useState<number | null>(null);
  const [liveLoading, setLiveLoading] = useState(false);
  const [liveError, setLiveError] = useState<string | null>(null);
  const d7Label = "D-7";
  const d14Label = "D-14";
  const d21Label = "D-21";
  const d28Label = "D-28";
  type ComparePeriod = "Ontem" | "D-7" | "D-14" | "D-21" | "D-28";
  const [comparePeriod, setComparePeriod] = useState<ComparePeriod>("D-7");

  type CategoryDrillLevel = "category" | "subcategory" | "final";
  const [categoryLevel, setCategoryLevel] = useState<CategoryDrillLevel>("category");
  const [drillCategory, setDrillCategory] = useState<string>("");
  const [drillSubcategory, setDrillSubcategory] = useState<string>("");

  const pad2 = (n: number) => String(n).padStart(2, "0");
  const toISO = (d: Date) => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
  const shiftIsoDay = (ymd: string, deltaDays: number): string => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(String(ymd || ""))) return "";
    const base = new Date(`${ymd}T00:00:00`);
    return new Date(base.getTime() + deltaDays * 86400000).toISOString().slice(0, 10);
  };
  const [searchParams, setSearchParams] = useSearchParams();
  const isIsoYmd = (v: string) => /^\d{4}-\d{2}-\d{2}$/.test(String(v || "").trim());
  const urlDay = String(searchParams.get("day") || "").trim();
  const [day, setDay] = useState<string>(() => (isIsoYmd(urlDay) ? urlDay : toISO(new Date())));

  // Se navegar via URL (ex.: Dashboard -> Ver dia), aplica o day na tela.
  useEffect(() => {
    const next = String(searchParams.get("day") || "").trim();
    if (!isIsoYmd(next)) return;
    setDay((cur) => (cur === next ? cur : next));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  // Mantém URL sincronizada (útil para compartilhar e para outros fluxos).
  useEffect(() => {
    if (!isIsoYmd(day)) return;
    setSearchParams(
      (prev) => {
        const p = new URLSearchParams(prev);
        p.set("day", day);
        return p;
      },
      { replace: true },
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [day]);

  const isLive = Boolean(live?.isLive);
  const projectedTodayTotal = live?.projection?.projectedTodayTotal ?? 0;
  const todaySoFar = live?.kpis?.today?.revenueSoFar ?? 0;

  // filtros (mesma base do dashboard, sem data)
  type FiltersResponse = {
    stores: { id: number; name: string }[];
    statuses: string[];
    channels: string[];
    categories: string[];
    states: string[];
    cities: string[];
  };
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

  // Mapa: evita o "ResponsiveWrapper" do Nivo (que pode medir width/height como 0 e renderizar em branco)
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
  }, [geoFeatures, mapWidth, mapHeight]);

  const mapPath = useMemo(() => (mapProjection ? geoPath(mapProjection) : null), [mapProjection]);
  const mapUnknownColor = "#E2E8F0";

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

  const todaySoFarF = todaySoFar;
  const projectedTodayTotalF = projectedTodayTotal;

  useEffect(() => {
    if (!filters) return;
    if (!initialStoresSet.current) return;

    const ac = new AbortController();
    setLiveLoading(true);
    setLiveError(null);

    const qs = new URLSearchParams();
    for (const s of stores) qs.append("company_id", s);
    for (const c of channels) qs.append("channel", c);
    for (const c of categories) qs.append("category", c);
    for (const st of states) qs.append("state", st);
    for (const city of cities) qs.append("city", city);
    if (day) qs.set("day", day);
    qs.set("category_level", categoryLevel);
    if (drillCategory) qs.set("drill_category", drillCategory);
    if (drillSubcategory) qs.set("drill_subcategory", drillSubcategory);

    fetch(buildApiUrl(`/companies/me/dashboard/live/overview?${qs.toString()}`), {
      headers: { ...getAuthHeaders() },
      signal: ac.signal,
    })
      .then(async (res) => {
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          throw new Error((data as any)?.message || "Erro ao carregar Ao Vivo");
        }
        return res.json() as Promise<LiveResponse>;
      })
      .then((d) => setLive(d))
      .catch((e: any) => {
        if (String(e?.name || "") === "AbortError") return;
        setLive(null);
        setLiveError(String(e?.message || "Erro ao carregar Ao Vivo"));
      })
      .finally(() => setLiveLoading(false));

    return () => ac.abort();
  }, [filters, stores, channels, categories, states, cities, day, categoryLevel, drillCategory, drillSubcategory]);

  const apiHour = live?.currentHour;
  const currentHourLabel = String(Number.isInteger(apiHour) ? apiHour : currentHour).padStart(2, "0");

  const buildHourly = (rows: HourlyRow[], day: string): { x: string; y: number }[] => {
    const map = new Map<number, number>();
    for (const r of rows) {
      if (r.day === day) map.set(Number(r.hour), Number(r.revenue) || 0);
    }
    const pts: { x: string; y: number }[] = [];
    for (let h = 0; h < 24; h++) {
      pts.push({ x: `${String(h).padStart(2, "0")}:00`, y: Number(map.get(h) ?? 0) || 0 });
    }
    return pts;
  };

  const compareLabelForPeriod = (p: ComparePeriod): string => (p === "Ontem" ? "D-1" : p);

  const lineData = useMemo(() => {
    const rows = live?.hourly || [];
    const today = live?.today || "";
    const y = today ? new Date(`${today}T00:00:00`) : new Date();
    const ymd = (d: Date) => d.toISOString().slice(0, 10);
    const yesterday = today ? ymd(new Date(y.getTime() - 1 * 86400000)) : "";
    const d7 = today ? ymd(new Date(y.getTime() - 7 * 86400000)) : "";
    const d14 = today ? ymd(new Date(y.getTime() - 14 * 86400000)) : "";
    const d21 = today ? ymd(new Date(y.getTime() - 21 * 86400000)) : "";
    const d28 = today ? ymd(new Date(y.getTime() - 28 * 86400000)) : "";
    const hNow = Number.isInteger(apiHour) ? (apiHour as number) : currentHour;

    const sumHourlyUntil = (rows: HourlyRow[], ymd: string, hourInclusive: number): number => {
      const limit = Math.max(0, Math.min(23, Number(hourInclusive ?? 23)));
      let sum = 0;
      for (const r of rows) {
        if (r.day !== ymd) continue;
        const h = Number(r.hour);
        if (!Number.isFinite(h) || h < 0 || h > limit) continue;
        sum += Number(r.revenue) || 0;
      }
      return sum;
    };

    const todayFull = today
      ? buildHourly(rows, today)
      : Array.from({ length: 24 }, (_, h) => ({ x: `${String(h).padStart(2, "0")}:00`, y: 0 }));
    const lastWeekSameDay = d7 ? buildHourly(rows, d7) : todayFull.map((p) => ({ ...p, y: 0 }));

    // Projeção por hora: usa a "distribuição" do D-7 e escala pelo total projetado do dia.
    const projTotal = projectedTodayTotalF;
    const d7Total = lastWeekSameDay.reduce((a, b) => a + (Number(b.y) || 0), 0);
    const projScaled =
      projTotal > 0 && d7Total > 0
        ? lastWeekSameDay.map((p) => ({ ...p, y: (Number(p.y) || 0) * (projTotal / d7Total) }))
        : lastWeekSameDay.map((p) => ({ ...p, y: 0 }));

    const todayActual = todayFull.map((p, idx) => ({ x: p.x, y: idx <= hNow ? p.y : null }));
    // Projeção deve "colar" no Hoje até a hora atual (mesmo valor inicial),
    // e seguir sozinha depois (usando a curva projetada).
    const todayProjection = projScaled.map((p, idx) => ({
      x: p.x,
      y: idx <= hNow ? (todayFull[idx]?.y ?? 0) : p.y,
    }));

    const compareDay =
      comparePeriod === "Ontem"
        ? yesterday
        : comparePeriod === "D-7"
          ? d7
          : comparePeriod === "D-14"
            ? d14
            : comparePeriod === "D-21"
              ? d21
              : d28;
    const compareSeriesId =
      comparePeriod === "Ontem" ? "D-1" : comparePeriod === "D-7" ? d7Label : comparePeriod === "D-14" ? d14Label : comparePeriod === "D-21" ? d21Label : d28Label;
    const compareSeriesData = compareDay ? buildHourly(rows, compareDay) : todayFull.map((p) => ({ ...p, y: 0 }));
    const compareSeriesDataCapped = isLive ? compareSeriesData.map((p, idx) => ({ x: p.x, y: idx <= hNow ? p.y : null })) : compareSeriesData;

    return [
      { id: "Hoje", data: todayActual },
      ...(isLive ? [{ id: "Hoje (projeção)", data: todayProjection }] : []),
      { id: compareSeriesId, data: compareSeriesDataCapped },
    ];
  }, [live, apiHour, currentHour, d7Label, d14Label, d21Label, d28Label, projectedTodayTotalF, todaySoFarF, comparePeriod, isLive]);

  const dashedProjectionLayer = (props: any) => {
    const serie = props.series?.find((s: any) => s.id === "Hoje (projeção)");
    if (!serie) return null;
    const pts = (serie.data || []).map((d: any) => d.position);
    const gen = d3Line<any>()
      .x((d) => d.x)
      .y((d) => d.y);
    const d = gen(pts);
    if (!d) return null;
    return (
      <path
        d={d}
        fill="none"
        stroke={CHART_COLORS[6]}
        strokeWidth={2.5}
        strokeDasharray="6 6"
        opacity={0.95}
      />
    );
  };

  const topProducts = useMemo(() => {
    const rows = live?.topProducts || [];
    return rows
      .map((r) => ({
        productId: Number((r as any)?.productId ?? 0) || null,
        name: String(r.name ?? r.sku ?? ""),
        photo: (r as any)?.photo ?? null,
        url: (r as any)?.url ?? null,
        qty: Number(r.qty ?? 0) || 0,
        revenue: Number(r.revenue ?? 0) || 0,
      }))
      .slice(0, 5);
  }, [live]);

  const kpis = useMemo(() => {
    const t = live?.kpis?.today;
    return {
      uniqueCustomers: Number(t?.uniqueCustomers ?? 0) || 0,
      cartItemsAdded: Number(t?.cartItemsAdded ?? 0) || 0,
      orders: Number(t?.orders ?? 0) || 0,
      conversionPct: Number(t?.conversionPct ?? 0) || 0,
      itemsSold: Number(t?.itemsSold ?? 0) || 0,
      skusCount: Number((t as any)?.skusCount ?? 0) || 0,
      avgTicket: Number(t?.avgTicket ?? 0) || 0,
    };
  }, [live]);

  const kpisPrev = useMemo(() => {
    const src =
      comparePeriod === "Ontem"
        ? live?.kpis?.yesterday
        : comparePeriod === "D-7"
          ? live?.kpis?.d7
          : comparePeriod === "D-14"
            ? live?.kpis?.d14
            : comparePeriod === "D-21"
              ? live?.kpis?.d21
              : live?.kpis?.d28;
    return {
      uniqueCustomers: Number(src?.uniqueCustomers ?? 0) || 0,
      cartItemsAdded: Number(src?.cartItemsAdded ?? 0) || 0,
      orders: Number(src?.orders ?? 0) || 0,
      conversionPct: Number(src?.conversionPct ?? 0) || 0,
      itemsSold: Number(src?.itemsSold ?? 0) || 0,
      skusCount: Number((src as any)?.skusCount ?? 0) || 0,
      avgTicket: Number(src?.avgTicket ?? 0) || 0,
    };
  }, [live, comparePeriod]);

  const formatPct = (v: number | null) => {
    if (v === null || !Number.isFinite(v)) return "—";
    return new Intl.NumberFormat("pt-BR", { style: "percent", minimumFractionDigits: 1, maximumFractionDigits: 1 }).format(v);
  };

  const growthBadgeClass = (v: number | null) => {
    if (v === null || !Number.isFinite(v)) return "border-slate-200 bg-slate-50 text-slate-700";
    if (v > 0) return "border-emerald-200 bg-emerald-50 text-emerald-700";
    if (v < 0) return "border-rose-200 bg-rose-50 text-rose-700";
    return "border-slate-200 bg-slate-50 text-slate-700";
  };

  const calcGrowth = (prev: number): number | null => {
    const cur = Number(live?.kpis?.today?.revenueSoFar ?? 0) || 0;
    const p = Number(prev ?? 0) || 0;
    if (p <= 0) return null;
    return (cur - p) / p;
  };

  const growthRows = useMemo(() => {
    const base = String(live?.today || day || "");
    const hNow = Number.isInteger(apiHour) ? (apiHour as number) : currentHour;
    const rows = live?.hourly || [];

    const sumHourlyUntil = (ymd: string, hourInclusive: number): number => {
      if (!ymd) return 0;
      const limit = Math.max(0, Math.min(23, Number(hourInclusive ?? 23)));
      let sum = 0;
      for (const r of rows) {
        if (r.day !== ymd) continue;
        const h = Number(r.hour);
        if (!Number.isFinite(h) || h < 0 || h > limit) continue;
        sum += Number(r.revenue) || 0;
      }
      return sum;
    };

    const revFor = (key: "yesterday" | "d7" | "d14" | "d21" | "d28", shiftDays: number): { day: string; revenue: number } => {
      const compareDay = base ? shiftIsoDay(base, shiftDays) : "";
      // Quando for HOJE (AO VIVO), o comparativo precisa ser até a hora atual.
      const capped = isLive ? sumHourlyUntil(compareDay, hNow) : Number((live?.kpis as any)?.[key]?.revenueSoFar ?? 0) || 0;
      return { day: compareDay, revenue: capped };
    };

    const y = revFor("yesterday", -1);
    const d7 = revFor("d7", -7);
    const d14 = revFor("d14", -14);
    const d21 = revFor("d21", -21);
    const d28 = revFor("d28", -28);
    return [
      { label: "D-1", period: "Ontem" as ComparePeriod, value: calcGrowth(y.revenue), compareRevenue: y.revenue, compareDay: y.day },
      { label: "D-7", period: "D-7" as ComparePeriod, value: calcGrowth(d7.revenue), compareRevenue: d7.revenue, compareDay: d7.day },
      { label: "D-14", period: "D-14" as ComparePeriod, value: calcGrowth(d14.revenue), compareRevenue: d14.revenue, compareDay: d14.day },
      { label: "D-21", period: "D-21" as ComparePeriod, value: calcGrowth(d21.revenue), compareRevenue: d21.revenue, compareDay: d21.day },
      { label: "D-28", period: "D-28" as ComparePeriod, value: calcGrowth(d28.revenue), compareRevenue: d28.revenue, compareDay: d28.day },
    ];
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    live?.today,
    day,
    live?.kpis?.today?.revenueSoFar,
    live?.kpis?.yesterday?.revenueSoFar,
    live?.kpis?.d7?.revenueSoFar,
    live?.kpis?.d14?.revenueSoFar,
    live?.kpis?.d21?.revenueSoFar,
    live?.kpis?.d28?.revenueSoFar,
    live?.hourly,
    apiHour,
    currentHour,
    isLive,
  ]);

  const pieByCategory = useMemo(() => (live?.byCategory || []).map((d) => ({ id: d.id, label: d.id, value: d.value })), [live]);

  const BAR_ORANGE = "#FF751A";

  const pieByMarketplace = useMemo(() => (live?.byMarketplace || []).map((d) => ({ id: d.id, label: d.id, value: d.value })), [live]);
  const marketplaceTable = useMemo(() => {
    const rows = (live as any)?.byMarketplaceTable;
    return Array.isArray(rows) ? rows : [];
  }, [live]);

  const marketplaceTableByPeriod = useMemo(() => {
    const obj = (live as any)?.byMarketplaceTableByPeriod;
    return obj && typeof obj === "object" ? obj : null;
  }, [live]);

  const categoryTable = useMemo(() => {
    const rows = (live as any)?.byCategoryTable;
    return Array.isArray(rows) ? rows : [];
  }, [live]);
  const categoryTableByPeriod = useMemo(() => {
    const obj = (live as any)?.byCategoryTableByPeriod;
    return obj && typeof obj === "object" ? obj : null;
  }, [live]);
  const stateTable = useMemo(() => {
    const rows = (live as any)?.byStateTable;
    return Array.isArray(rows) ? rows : [];
  }, [live]);
  const stateTableByPeriod = useMemo(() => {
    const obj = (live as any)?.byStateTableByPeriod;
    return obj && typeof obj === "object" ? obj : null;
  }, [live]);

  const productTable = useMemo(() => {
    const rows = (live as any)?.byProductTable;
    return Array.isArray(rows) ? rows : [];
  }, [live]);
  const productTableD1 = useMemo(() => {
    const rows = (live as any)?.byProductTableD1;
    return Array.isArray(rows) ? rows : [];
  }, [live]);

  const compareKey =
    comparePeriod === "Ontem"
      ? "yesterday"
      : comparePeriod === "D-7"
        ? "d7"
        : comparePeriod === "D-14"
          ? "d14"
          : comparePeriod === "D-21"
            ? "d21"
            : "d28";

  const compareLabelShort = compareLabelForPeriod(comparePeriod); // "D-1" | "D-7" | ...

  // precisa ser function (ou vir antes) para evitar TDZ quando usado nos builders de linhas
  function pctChange(cur: number, prev: number): number | null {
    const p = Number(prev || 0);
    if (p <= 0) return null;
    return (Number(cur || 0) - p) / p;
  }

  type SortDir = "asc" | "desc";
  type TableSortKey = "id" | "revenue" | "revenueDelta" | "prevRevenue" | "avgTicket" | "ticketDelta" | "prevAvgTicket";
  type TableSort = { key: TableSortKey; dir: SortDir };

  const sortIndicator = (sort: TableSort, key: TableSortKey) => (sort.key === key ? (sort.dir === "asc" ? "▲" : "▼") : "");

  const toggleSort = (set: (v: TableSort) => void, cur: TableSort, key: TableSortKey) => {
    if (cur.key === key) set({ key, dir: cur.dir === "asc" ? "desc" : "asc" });
    else set({ key, dir: "desc" });
  };

  const sortRows = <T extends { id: string }>(
    rows: T[],
    sort: TableSort,
    getNumber: (row: T, key: TableSortKey) => number | null,
  ): T[] => {
    const dirMul = sort.dir === "asc" ? 1 : -1;
    const out = [...rows];
    out.sort((a, b) => {
      if (sort.key === "id") return String(a.id).localeCompare(String(b.id), "pt-BR") * dirMul;
      const av = getNumber(a, sort.key);
      const bv = getNumber(b, sort.key);
      const aNull = av === null || !Number.isFinite(av);
      const bNull = bv === null || !Number.isFinite(bv);
      if (aNull && bNull) return 0;
      if (aNull) return 1; // null sempre por último
      if (bNull) return -1;
      return (Number(av) - Number(bv)) * dirMul;
    });
    return out;
  };

  const [marketplaceSort, setMarketplaceSort] = useState<TableSort>({ key: "revenue", dir: "desc" });
  const [stateSort, setStateSort] = useState<TableSort>({ key: "revenue", dir: "desc" });
  const [categorySort, setCategorySort] = useState<TableSort>({ key: "revenue", dir: "desc" });
  const [productSort, setProductSort] = useState<TableSort>({ key: "revenue", dir: "desc" });

  type TableRow = {
    id: string;
    revenue: number;
    prevRevenue: number;
    revenueDelta: number | null;
    avgTicket: number;
    prevAvgTicket: number;
    ticketDelta: number | null;
  };

  const buildRowsWithPrev = (list: any[], prevList: any[] | undefined): TableRow[] => {
    const prevMap = new Map<string, any>((prevList || []).map((p: any) => [String(p.id), p]));
    return (list || []).map((r: any) => {
      const prev = prevMap.get(String(r.id));
      const revenue = Number(r.revenue || 0) || 0;
      const prevRevenue = Number(prev?.revenue || 0) || 0;
      const avgTicket = Number(r.avgTicket || 0) || 0;
      const prevAvgTicket = Number(prev?.avgTicket || 0) || 0;
      return {
        id: String(r.id),
        revenue,
        prevRevenue,
        revenueDelta: pctChange(revenue, prevRevenue),
        avgTicket,
        prevAvgTicket,
        ticketDelta: pctChange(avgTicket, prevAvgTicket),
    };
    });
  };

  const marketplaceRows = useMemo(() => {
    const prevList = marketplaceTableByPeriod?.[compareKey] as any[] | undefined;
    return buildRowsWithPrev(marketplaceTable, prevList);
  }, [marketplaceTable, marketplaceTableByPeriod, compareKey]);

  const stateRows = useMemo(() => {
    const prevList = (stateTableByPeriod as any)?.[compareKey] as any[] | undefined;
    return buildRowsWithPrev(stateTable, prevList);
  }, [stateTable, stateTableByPeriod, compareKey]);

  const categoryRows = useMemo(() => {
    const prevList = (categoryTableByPeriod as any)?.[compareKey] as any[] | undefined;
    return buildRowsWithPrev(categoryTable, prevList);
  }, [categoryTable, categoryTableByPeriod, compareKey]);

  const marketplaceRowsSorted = useMemo(
    () =>
      sortRows(marketplaceRows, marketplaceSort, (row: TableRow, key) => {
        const r = row as any;
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
      sortRows(stateRows, stateSort, (row: TableRow, key) => {
        const r = row as any;
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
      sortRows(categoryRows, categorySort, (row: TableRow, key) => {
        const r = row as any;
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

  const productRows = useMemo(() => {
    const prevMap = new Map<string, any>(productTableD1.map((p: any) => [String(p.sku), p]));
    return productTable.map((r: any) => {
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
  }, [productTable, productTableD1]);

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

  const formatPctSigned1 = (ratio: number | null) => {
    if (ratio === null || !Number.isFinite(ratio)) return "—";
    const v = ratio * 100;
    const s = `${v >= 0 ? "+" : ""}${v.toFixed(1).replace(".", ",")}%`;
    return s;
  };

  const deltaClass = (ratio: number | null) => {
    if (ratio === null || !Number.isFinite(ratio)) return "text-slate-400";
    if (ratio > 0) return "text-emerald-700";
    if (ratio < 0) return "text-rose-700";
    return "text-slate-700";
  };

  const marketplaceColorById = useMemo(() => {
    const map = new Map<string, string>();
    for (let i = 0; i < pieByMarketplace.length; i++) {
      const id = String((pieByMarketplace as any)[i]?.id ?? "");
      map.set(id, marketplaceColorOrFallback(id));
    }
    return map;
  }, [pieByMarketplace]);

  const toggleSingle = (setter: (v: string[]) => void, current: string[], next: string) => {
    if (current.length === 1 && current[0] === next) setter([]);
    else setter([next]);
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

  const salesByUF = useMemo(() => (live?.byState || []).map((d) => ({ id: d.id, value: d.value })), [live]);

  const salesByUFMap = useMemo(() => new Map(salesByUF.map((d) => [String(d.id), d.value])), [salesByUF]);
  const mapMax = useMemo(() => Math.max(1, ...salesByUF.map((d) => d.value)), [salesByUF]);
  const MAP_ORANGE_TONES = useMemo(
    () => [
      "#FFF3EA",
      "#FFE4D1",
      "#FFD2B0",
      "#FFB885",
      "#FF9A52",
      "#FF751A",
      "#E65F00",
      "#CC4F00",
    ],
    [],
  );
  const mapScale = useMemo(() => scaleQuantize<string>().domain([0, mapMax]).range(MAP_ORANGE_TONES), [mapMax, MAP_ORANGE_TONES]);


  return (
    <div className="w-full">
      <div className="flex items-center justify-between gap-3">
        <div className="text-sm text-slate-600">
          <Link to="/dashboard" className="font-semibold text-slate-700 hover:text-slate-900 hover:underline">
            Dashboard
          </Link>{" "}
          <span className="text-slate-400">/</span> Vendas ao vivo
        </div>
        <div className="flex items-center gap-2">
          <div className="w-[180px]">
            <DatePicker
              value={day}
              onChange={(next) => {
                const s = String(next || "").trim();
                if (!s) return;
                // segurança simples no front: impede selecionar futuro
                const todayIso = toISO(new Date());
                setDay(s > todayIso ? todayIso : s);
              }}
              placeholder="Selecionar dia..."
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
      <h1 className="text-2xl font-extrabold text-slate-900">{isLive ? "Vendas ao vivo (Hoje)" : `Vendas (${formatDateBR(day)})`}</h1>
      {liveLoading ? <div className="mt-2 text-sm text-slate-600">Carregando dados ao vivo...</div> : null}
      {!liveLoading && liveError ? <div className="mt-2 text-sm text-red-600">{liveError}</div> : null}

      {/* Topo: totalizador */}
      <Card className="mt-3 w-full border-slate-200 bg-white p-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="flex items-center gap-3">
              <div className="text-sm font-semibold text-slate-600">Faturamento do dia</div>
              {isLive ? (
              <div className="inline-flex items-center gap-2 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-xs font-extrabold text-emerald-700">
                <span className="relative flex h-2.5 w-2.5">
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-500 opacity-60" />
                  <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-emerald-600" />
                </span>
                AO VIVO
              </div>
              ) : null}
            </div>
            <div className="mt-2 text-3xl font-extrabold text-slate-900">{formatBRLNoSpace(todaySoFarF)}</div>
            {isLive ? (
            <div className="mt-1 text-xs text-slate-600">
              Projeção de hoje: <span className="font-extrabold text-slate-900">{formatBRLNoSpace(projectedTodayTotalF)}</span>
            </div>
            ) : null}
          </div>

          <div className="w-full sm:w-[560px]">
            <div className="text-xs font-semibold text-slate-500">Crescimento (faturamento até agora)</div>
            <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-5">
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
                    <div className="mt-1 text-sm font-extrabold">{formatPct(g.value)}</div>
                  </button>

                  {/* Popover ao passar o mouse */}
                  <div className="absolute left-1/2 top-0 z-30 hidden -translate-x-1/2 -translate-y-[calc(100%+10px)] group-hover:block">
                    <div className="pointer-events-auto w-[230px] rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs text-slate-900 shadow-xl">
                      <div className="font-extrabold">{g.label}</div>
                      <div className="mt-0.5 text-slate-600">
                        Data: <span className="font-semibold text-slate-900">{g.compareDay ? formatDateBR(g.compareDay) : "—"}</span>
              </div>
                      <div className="mt-1 text-slate-600">
                        Faturamento: <span className="font-extrabold text-slate-900">{formatBRLNoSpace(Number(g.compareRevenue || 0))}</span>
            </div>
                      <div className="mt-2">
                        <button
                          type="button"
                          className="inline-flex items-center rounded-lg border border-slate-200 bg-white px-2 py-1 text-[11px] font-extrabold text-slate-800 hover:bg-slate-50"
                          onClick={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            if (!g.compareDay) return;
                            setDay(g.compareDay);
                          }}
                          title="Abrir esse dia em detalhes"
                        >
                          Ver dia
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

      {/* Linha: vendas por hora */}
      <Card className="mt-4 w-full border-slate-200 bg-white p-5">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="text-lg font-extrabold text-slate-900">Venda hora a hora</div>
          </div>
          <div className="text-xs text-slate-600">
            Hora atual: <span className="font-extrabold text-slate-900">{currentHourLabel}:00</span>
          </div>
        </div>

        {/* legenda (fora do gráfico) */}
        <div className="mt-3 flex flex-wrap items-center gap-x-6 gap-y-2 text-sm">
          <div className="inline-flex items-center gap-2 text-slate-700">
            <span className="h-2.5 w-2.5 rounded-full" style={{ background: CHART_COLORS[1] }} />
            <span className="font-semibold">Hoje</span>
          </div>
          <div className="inline-flex items-center gap-2 text-slate-700">
            <span
              className="h-2.5 w-2.5 rounded-full"
              style={{
                background:
                  comparePeriod === "Ontem"
                    ? CHART_COLORS[0]
                    : comparePeriod === "D-7"
                      ? CHART_COLORS[5]
                      : comparePeriod === "D-14"
                        ? CHART_COLORS[2]
                        : comparePeriod === "D-21"
                          ? CHART_COLORS[3]
                          : CHART_COLORS[4],
              }}
            />
            <span className="font-semibold">Comparativo: {compareLabelForPeriod(comparePeriod)}</span>
          </div>
          <div className="inline-flex items-center gap-2 text-slate-700">
            {isLive ? (
              <>
            <span className="h-2.5 w-2.5 rounded-full" style={{ background: CHART_COLORS[6] }} />
            <span className="font-semibold">Hoje (projeção)</span>
              </>
            ) : null}
          </div>
          <div className="text-xs text-slate-500">
            Dica: clique nos cards de crescimento para trocar o comparativo.
          </div>
        </div>

        <div className="mt-3" style={{ height: 360 }}>
          <ResponsiveLine
            data={lineData as any}
            margin={{ top: 10, right: 24, bottom: 48, left: 88 }}
            xScale={{ type: "point" }}
            yScale={{ type: "linear", min: 0, max: "auto", stacked: false }}
            axisBottom={{
              tickRotation: -45,
              legend: "Hora",
              legendOffset: 40,
              legendPosition: "middle",
            }}
            axisLeft={{
              format: (v) => formatBRLCompact(Number(v)),
            }}
            enablePoints={true}
            pointSize={6}
            pointBorderWidth={1}
            pointBorderColor={{ from: "color", modifiers: [["darker", 0.3]] }}
            useMesh={true}
            colors={(d) => {
              const id = String(d.id);
              if (id === "Hoje") return CHART_COLORS[1];
              if (id === "Hoje (projeção)") return "transparent"; // desenhado via layer pontilhada
              if (id === "D-1") return CHART_COLORS[0];
              if (id === d7Label) return CHART_COLORS[5];
              if (id === d14Label) return CHART_COLORS[2];
              if (id === d21Label) return CHART_COLORS[3];
              if (id === d28Label) return CHART_COLORS[4];
              return CHART_COLORS[5];
            }}
            legends={[]}
            tooltip={({ point }: any) => {
              const serieLabel =
                point?.serieId ??
                point?.serie?.id ??
                point?.data?.serieId ??
                point?.data?.id ??
                point?.id ??
                "";
              return (
                <div className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs text-slate-900 shadow-xl">
                  <div className="font-extrabold">{String(serieLabel || "-")}</div>
                  <div className="text-slate-700">{String(point?.data?.x ?? "")}</div>
                  <div className="mt-0.5">{formatBRLNoSpace(Number(point?.data?.y ?? 0))}</div>
                </div>
              );
            }}
            theme={{
              axis: { ticks: { text: { fill: "#475569" } }, legend: { text: { fill: "#334155", fontWeight: 700 } } },
              grid: { line: { stroke: "#E2E8F0" } },
              legends: { text: { fill: "#334155" } },
              tooltip: { container: { background: "#fff", color: "#0f172a", fontSize: 12, borderRadius: 12 } },
            }}
            layers={["grid", "markers", "areas", "lines", "points", dashedProjectionLayer, "slices", "mesh", "axes"]}
          />
        </div>
      </Card>

      {/* 2ª linha */}
      <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-12">
        {/* Lista produtos */}
        <Card className="w-full border-slate-200 bg-white p-5 lg:col-span-6">
          <div className="text-lg font-extrabold text-slate-900">Produtos mais vendidos</div>
          <div className="mt-3 space-y-3">
            {topProducts.length ? (
              topProducts.map((p, idx) => {
                const rank = idx + 1;
                const rankStyle =
                  rank === 1
                    ? "text-[#D4AF37]"
                    : rank === 2
                      ? "text-[#C0C0C0]"
                      : rank === 3
                        ? "text-[#CD7F32]"
                        : "text-slate-400";
                const rankSize = rank >= 4 ? "text-[18px]" : "text-[23px]";
                return (
              <div key={p.name} className="flex items-start justify-between gap-3 border-t border-slate-200 pt-3 first:border-t-0 first:pt-0">
                <div className="min-w-0 flex items-center gap-3">
                  <div
                    className={[
                      "w-8 shrink-0 flex items-center justify-center font-extrabold leading-none",
                      rankSize,
                      rankStyle,
                    ].join(" ")}
                    title={`#${rank}`}
                  >
                    {rank}
                  </div>
                  <ProductThumb
                    name={p.name}
                    photo={p.photo}
                    size={40}
                    onClick={() => (p.productId ? setSelectedProductId(p.productId) : undefined)}
                  />
                  <div className="min-w-0">
                      <button
                        type="button"
                        onClick={() => (p.productId ? setSelectedProductId(p.productId) : undefined)}
                        className="text-left text-[12px] font-semibold text-slate-900 truncate hover:underline"
                        title={p.name}
                      >
                        {truncate60(p.name)}
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
        {/* Pedidos x Frete */}
          <Card className="w-full border-slate-200 bg-white p-5">
          <div className="text-lg font-extrabold text-slate-900">Pedidos x Frete</div>
          <div className="mt-3 space-y-3 text-sm">
            <div>
              <div className="text-xs font-semibold text-slate-500">Itens no carrinho</div>
                <div className="mt-1 flex items-center justify-between gap-2">
              <div className="text-2xl font-extrabold text-slate-900">{kpis.cartItemsAdded}</div>
                  <span className="shrink-0">
                    <DeltaBadge
                      current={kpis.cartItemsAdded}
                      previous={kpisPrev.cartItemsAdded}
                      compareLabel={comparePeriod}
                      formatValue={(n) => formatInt(Number(n))}
                    />
                  </span>
                </div>
            </div>
            <div>
              <div className="text-xs font-semibold text-slate-500">Itens vendidos</div>
                <div className="mt-1 flex items-center justify-between gap-2">
              <div className="text-2xl font-extrabold text-slate-900">{kpis.itemsSold}</div>
                  <span className="shrink-0">
                    <DeltaBadge
                      current={kpis.itemsSold}
                      previous={kpisPrev.itemsSold}
                      compareLabel={comparePeriod}
                      formatValue={(n) => formatInt(Number(n))}
                    />
                  </span>
                </div>
            </div>
            <div>
              <div className="text-xs font-semibold text-slate-500">Conversão</div>
                <div className="mt-1 flex items-center justify-between gap-2">
              <div className="text-2xl font-extrabold text-slate-900">{String(kpis.conversionPct).replace(".", ",")}%</div>
                  <span className="shrink-0">
                    <DeltaBadge
                      current={kpis.conversionPct}
                      previous={kpisPrev.conversionPct}
                      compareLabel={comparePeriod}
                      formatValue={(n) => `${String(Number(n).toFixed(1)).replace(".", ",")}%`}
                    />
                  </span>
                </div>
            </div>
          </div>
        </Card>

        {/* Clientes / Pedidos / Ticket (no lugar do marketplace) */}
          <Card className="w-full border-slate-200 bg-white p-5">
            <div className="text-lg font-extrabold text-slate-900">Clientes, pedidos e ticket</div>
            <div className="mt-3 grid grid-cols-1 gap-2">
              <div className="rounded-xl border border-slate-200 bg-white px-3 py-2">
                <div className="text-xs font-semibold text-slate-500">Clientes únicos</div>
                <div className="mt-1 flex items-center justify-between gap-2">
                  <div className="text-lg font-extrabold text-slate-900">{kpis.uniqueCustomers}</div>
                  <span className="shrink-0">
                    <DeltaBadge
                      current={kpis.uniqueCustomers}
                      previous={kpisPrev.uniqueCustomers}
                      compareLabel={comparePeriod}
                      formatValue={(n) => formatInt(Number(n))}
                    />
                  </span>
                </div>
              </div>
              <div className="rounded-xl border border-slate-200 bg-white px-3 py-2">
                <div className="text-xs font-semibold text-slate-500">Pedidos</div>
                <div className="mt-1 flex items-center justify-between gap-2">
                  <div className="text-lg font-extrabold text-slate-900">{kpis.orders}</div>
                  <span className="shrink-0">
                    <DeltaBadge current={kpis.orders} previous={kpisPrev.orders} compareLabel={comparePeriod} formatValue={(n) => formatInt(Number(n))} />
                  </span>
                </div>
              </div>

              <div className="rounded-xl border border-slate-200 bg-white px-3 py-2">
                <div className="text-xs font-semibold text-slate-500">Quantidade de itens</div>
                <div className="mt-1 flex items-center justify-between gap-2">
                  <div className="text-lg font-extrabold text-slate-900">{kpis.itemsSold}</div>
                  <span className="shrink-0">
                    <DeltaBadge current={kpis.itemsSold} previous={kpisPrev.itemsSold} compareLabel={comparePeriod} formatValue={(n) => formatInt(Number(n))} />
                  </span>
                </div>
              </div>

              <div className="rounded-xl border border-slate-200 bg-white px-3 py-2">
                <div className="text-xs font-semibold text-slate-500">Ticket médio</div>
                <div className="mt-1 flex items-center justify-between gap-2">
                  <div className="text-lg font-extrabold text-slate-900">{formatBRLNoSpace(kpis.avgTicket)}</div>
                  <span className="shrink-0">
                    <DeltaBadge
                      current={kpis.avgTicket}
                      previous={kpisPrev.avgTicket}
                      compareLabel={comparePeriod}
                      formatValue={(n) => formatBRLNoSpace(Number(n))}
                    />
                  </span>
                </div>
              </div>
            </div>
          </Card>
        </div>
      </div>

      <ProductDetailSlideOver open={!!selectedProductId} productId={selectedProductId} onClose={() => setSelectedProductId(null)} />

      {/* Nova linha: marketplace + tabela */}
      <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-12">
        <Card className="w-full border-slate-200 bg-white p-5 lg:col-span-4">
          <div className="text-lg font-extrabold text-slate-900">Faturamento por marketplace</div>
          <div className="mt-3" style={{ height: 300 }}>
            {pieByMarketplace.length ? (
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
            ) : (
              <div className="flex h-full items-center justify-center text-sm text-slate-500">Sem dados.</div>
            )}
          </div>
          {channels.length ? (
            <div className="mt-2 text-xs text-slate-600">
              Marketplace ativo: <span className="font-semibold text-slate-900">{channels.join(", ")}</span>
            </div>
          ) : null}
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
                      Total {compareLabelShort} <span className="text-[10px]">{sortIndicator(marketplaceSort, "prevRevenue")}</span>
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
                      Ticket {compareLabelShort} <span className="text-[10px]">{sortIndicator(marketplaceSort, "prevAvgTicket")}</span>
                    </button>
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {marketplaceRowsSorted.length ? (
                  marketplaceRowsSorted.map((r: any) => {
                    const revDelta = r.revenueDelta as number | null;
                    const ticketDelta = r.ticketDelta as number | null;
                    return (
                    <tr
                      key={String(r.id)}
                      className="bg-white hover:bg-slate-50"
                      onClick={() => toggleSingle(setChannels, channels, String(r.id))}
                      style={{ cursor: "pointer" }}
                      title="Clique para filtrar por marketplace"
                    >
                      <td className="px-4 py-3 font-semibold text-slate-900">{String(r.id)}</td>
                      <td className="px-4 py-3 text-slate-700">{formatBRLNoSpace(Number(r.revenue || 0))}</td>
                      <td className={["px-4 py-3 text-xs font-extrabold", deltaClass(revDelta)].join(" ")}>
                        {formatPctSigned1(revDelta)}
                      </td>
                      <td className="px-4 py-3 text-slate-700">{formatBRLNoSpace(Number(r.prevRevenue || 0))}</td>
                      <td className="px-4 py-3 text-slate-700">{formatBRLNoSpace(Number(r.avgTicket || 0))}</td>
                      <td className={["px-4 py-3 text-xs font-extrabold", deltaClass(ticketDelta)].join(" ")}>
                        {formatPctSigned1(ticketDelta)}
                      </td>
                      <td className="px-4 py-3 text-slate-700">{formatBRLNoSpace(Number(r.prevAvgTicket || 0))}</td>
                    </tr>
                    );
                  })
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

      {/* 3ª linha: Estado (mapa + tabela) */}
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

        <Card className="w-full border-slate-200 bg-white p-5 lg:col-span-8">
          <div className="text-lg font-extrabold text-slate-900">Estados</div>
          <div className="mt-1 text-xs text-slate-500">
            Comparando com: <span className="font-semibold text-slate-700">{compareLabelForPeriod(comparePeriod)}</span>
          </div>
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
                      Faturamento {compareLabelShort} <span className="text-[10px]">{sortIndicator(stateSort, "prevRevenue")}</span>
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
                      Ticket {compareLabelShort} <span className="text-[10px]">{sortIndicator(stateSort, "prevAvgTicket")}</span>
                    </button>
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {stateRowsSorted.length ? (
                  stateRowsSorted.map((r: any) => {
                    const revDelta = r.revenueDelta as number | null;
                    const ticketDelta = r.ticketDelta as number | null;
                    return (
                      <tr
                        key={String(r.id)}
                        className="bg-white hover:bg-slate-50"
                        onClick={() => toggleSingle(setStates, states, String(r.id))}
                        style={{ cursor: "pointer" }}
                        title="Clique para filtrar por estado"
                      >
                        <td className="px-4 py-3 font-semibold text-slate-900">{String(r.id)}</td>
                        <td className="px-4 py-3 text-slate-700">{formatBRLNoSpace(Number(r.revenue || 0))}</td>
                        <td className={["px-4 py-3 text-xs font-extrabold", deltaClass(revDelta)].join(" ")}>{formatPctSigned1(revDelta)}</td>
                        <td className="px-4 py-3 text-slate-700">{formatBRLNoSpace(Number(r.prevRevenue || 0))}</td>
                        <td className="px-4 py-3 text-slate-700">{formatBRLNoSpace(Number(r.avgTicket || 0))}</td>
                        <td className={["px-4 py-3 text-xs font-extrabold", deltaClass(ticketDelta)].join(" ")}>{formatPctSigned1(ticketDelta)}</td>
                        <td className="px-4 py-3 text-slate-700">{formatBRLNoSpace(Number(r.prevAvgTicket || 0))}</td>
                      </tr>
                    );
                  })
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

      {/* 4ª linha: Categoria (gráfico + tabela) */}
      <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-12">
        <Card className="w-full border-slate-200 bg-white p-5 lg:col-span-4">
          <div className="text-lg font-extrabold text-slate-900">Faturamento por categoria</div>
          <CategoryBreadcrumb />
          <div className="mt-3" style={{ height: 320 }}>
            {pieByCategory.length ? (
              <ResponsiveBar
                data={pieByCategory.map((d) => ({ categoria: String(d.id), faturamento: Number(d.value) })) as any}
                keys={["faturamento"]}
                indexBy="categoria"
                layout="horizontal"
                margin={{ top: 10, right: 44, bottom: 40, left: 12 }}
                padding={0.35}
                colors={({ indexValue }: any) => {
                  const id = String(indexValue ?? "");
                  const hasActive = categories.length === 1;
                  if (hasActive && categories[0] !== id) return hexToRgba(BAR_ORANGE, 0.2);
                  return BAR_ORANGE;
                }}
                borderRadius={6}
                enableGridX={false}
                enableGridY={true}
                axisLeft={null}
                axisBottom={{
                  format: (v) => formatBRLCompact(Number(v)),
                  tickPadding: 8,
                  tickRotation: -20,
                }}
                enableLabel={true}
                label={(d: any) => String(d.indexValue ?? "")}
                labelSkipWidth={12}
                labelTextColor={{ from: "color", modifiers: [["darker", 6]] }}
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
                onClick={(bar: any) => drillDownCategory(String(bar?.indexValue ?? ""))}
              />
            ) : (
              <div className="flex h-full items-center justify-center text-sm text-slate-500">Sem dados.</div>
            )}
          </div>
          {categories.length ? (
            <div className="mt-2 text-xs text-slate-600">
              Categoria ativa: <span className="font-semibold text-slate-900">{categories.join(", ")}</span>
            </div>
          ) : null}
        </Card>

        <Card className="w-full border-slate-200 bg-white p-5 lg:col-span-8">
          <div className="text-lg font-extrabold text-slate-900">Categorias</div>
          <CategoryBreadcrumb />
          <div className="mt-1 text-xs text-slate-500">
            Comparando com: <span className="font-semibold text-slate-700">{compareLabelForPeriod(comparePeriod)}</span>
          </div>
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
                      Faturamento {compareLabelShort} <span className="text-[10px]">{sortIndicator(categorySort, "prevRevenue")}</span>
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
                      Ticket {compareLabelShort} <span className="text-[10px]">{sortIndicator(categorySort, "prevAvgTicket")}</span>
                    </button>
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {categoryRowsSorted.length ? (
                  categoryRowsSorted.map((r: any) => {
                    const revDelta = r.revenueDelta as number | null;
                    const ticketDelta = r.ticketDelta as number | null;
                    return (
                      <tr
                        key={String(r.id)}
                        className="bg-white hover:bg-slate-50"
                        onClick={() => drillDownCategory(String(r.id))}
                        style={{ cursor: "pointer" }}
                        title="Clique para ver o próximo nível"
                      >
                        <td className="px-4 py-3 font-semibold text-slate-900">{String(r.id)}</td>
                        <td className="px-4 py-3 text-slate-700">{formatBRLNoSpace(Number(r.revenue || 0))}</td>
                        <td className={["px-4 py-3 text-xs font-extrabold", deltaClass(revDelta)].join(" ")}>{formatPctSigned1(revDelta)}</td>
                        <td className="px-4 py-3 text-slate-700">{formatBRLNoSpace(Number(r.prevRevenue || 0))}</td>
                        <td className="px-4 py-3 text-slate-700">{formatBRLNoSpace(Number(r.avgTicket || 0))}</td>
                        <td className={["px-4 py-3 text-xs font-extrabold", deltaClass(ticketDelta)].join(" ")}>{formatPctSigned1(ticketDelta)}</td>
                        <td className="px-4 py-3 text-slate-700">{formatBRLNoSpace(Number(r.prevAvgTicket || 0))}</td>
                      </tr>
                    );
                  })
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

      {/* 5ª linha: Produtos (tabela D-1) */}
      <Card className="mt-4 w-full border-slate-200 bg-white p-5">
        <div className="text-lg font-extrabold text-slate-900">Produtos (D-1)</div>
        <div className="mt-1 text-xs text-slate-500">Comparação fixa: Hoje vs D-1</div>

        <div className="mt-3 overflow-hidden rounded-xl border border-slate-200">
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-50 text-xs font-extrabold text-slate-700">
              <tr>
                <th className="px-4 py-3">
                  <button type="button" className="inline-flex items-center gap-1" onClick={() => toggleSort(setProductSort, productSort, "id")}>
                    Sku <span className="text-[10px]">{sortIndicator(productSort, "id")}</span>
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
                    Faturamento d-1 <span className="text-[10px]">{sortIndicator(productSort, "prevRevenue")}</span>
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
                    Ticket médio d-1 <span className="text-[10px]">{sortIndicator(productSort, "prevAvgTicket")}</span>
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
                productRowsSorted.map((r: any) => {
                  const revDelta = r.revenueDelta as number | null;
                  const ticketDelta = r.ticketDelta as number | null;
                  return (
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
                      <td className={["px-4 py-3 text-xs font-extrabold", deltaClass(revDelta)].join(" ")}>{formatPctSigned1(revDelta)}</td>
                      <td className="px-4 py-3 text-slate-700">{formatBRLNoSpace(Number(r.avgTicket || 0))}</td>
                      <td className="px-4 py-3 text-slate-700">{formatBRLNoSpace(Number(r.prevAvgTicket || 0))}</td>
                      <td className={["px-4 py-3 text-xs font-extrabold", deltaClass(ticketDelta)].join(" ")}>{formatPctSigned1(ticketDelta)}</td>
                    </tr>
                  );
                })
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

      {/* Drawer de filtros (sem data) */}
      <SlideOver open={filtersOpen} title="Filtros (Ao vivo)" onClose={() => setFiltersOpen(false)}>
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

export default DashboardAoVivo;


