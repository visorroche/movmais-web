import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useOutletContext, useSearchParams } from "react-router-dom";
import { Card } from "@/components/ui/card";
import type { AreaLogadaOutletContext } from "@/pages/AreaLogada";
import { ResponsiveLine } from "@nivo/line";
import { ResponsiveBar } from "@nivo/bar";
import { buildApiUrl } from "@/lib/config";
import { getAuthHeaders } from "@/lib/auth";
import { MultiSelect, type MultiSelectOption } from "@/components/ui/multi-select";
import { DateRangePicker, type DateRangeValue } from "@/components/ui/date-range-picker";
import { SlideOver } from "@/components/ui/slideover";
import { CHART_COLORS } from "@/lib/chartColors";
import { SlidersHorizontal } from "lucide-react";
import { marketplaceColorOrFallback } from "@/lib/marketplaceColors";
import { ProductDetailSlideOver } from "@/components/products/ProductDetailSlideOver";

const Dashboard = () => {
  const { me, meError } = useOutletContext<AreaLogadaOutletContext>();
  const navigate = useNavigate();

  const formatBRLNoSpace = (value: number): string =>
    new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(value).replace(/\u00A0/g, "");

  const formatBRLCompact = (value: number): string =>
    new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", notation: "compact", maximumFractionDigits: 1 })
      .format(value)
      .replace(/\u00A0/g, "");

  const truncate50 = (value: string | null | undefined): string => {
    const s = String(value ?? "");
    if (s.length <= 50) return s;
    return `${s.slice(0, 47)}...`;
  };

  const formatPctSigned1 = (ratio: number | null) => {
    if (ratio === null || !Number.isFinite(ratio)) return "—";
    const v = ratio * 100;
    return `${v >= 0 ? "+" : ""}${v.toFixed(1).replace(".", ",")}%`;
  };
  const deltaTextClass = (ratio: number | null) => {
    if (ratio === null || !Number.isFinite(ratio)) return "text-slate-400";
    if (ratio > 0) return "text-emerald-700";
    if (ratio < 0) return "text-rose-700";
    return "text-slate-700";
  };
  const deltaBadgeClass = (ratio: number | null) => {
    if (ratio === null || !Number.isFinite(ratio)) return "border-slate-200 bg-slate-50 text-slate-700";
    if (ratio > 0) return "border-emerald-200 bg-emerald-50 text-emerald-700";
    if (ratio < 0) return "border-rose-200 bg-rose-50 text-rose-700";
    return "border-slate-200 bg-slate-50 text-slate-700";
  };
  const pctChange = (cur: number, prev: number): number | null => {
    const p = Number(prev || 0);
    if (p <= 0) return null;
    return (Number(cur || 0) - p) / p;
  };

  const DeltaPopover = ({
    title,
    currentLabel,
    previousLabel,
    current,
    previous,
    format,
  }: {
    title: string;
    currentLabel: string;
    previousLabel: string;
    current: number;
    previous: number;
    format: (n: number) => string;
  }) => {
    return (
      <div className="absolute left-1/2 top-0 z-30 hidden -translate-x-1/2 -translate-y-[calc(100%+10px)] group-hover:block">
        <div className="pointer-events-auto w-[240px] rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs text-slate-900 shadow-xl">
          <div className="font-extrabold">{title}</div>
          <div className="mt-1 text-slate-600">
            {currentLabel}: <span className="font-extrabold text-slate-900">{format(Number(current || 0))}</span>
          </div>
          <div className="mt-0.5 text-slate-600">
            {previousLabel}: <span className="font-extrabold text-slate-900">{format(Number(previous || 0))}</span>
          </div>
        </div>
      </div>
    );
  };

  const DeltaBadgeWithPopover = ({
    title,
    ratio,
    currentLabel,
    previousLabel,
    current,
    previous,
    format,
  }: {
    title: string;
    ratio: number | null;
    currentLabel: string;
    previousLabel: string;
    current: number;
    previous: number;
    format: (n: number) => string;
  }) => (
    <div className="group relative inline-flex">
      <span className={["inline-flex rounded-full border px-2 py-0.5 text-[11px] font-extrabold", deltaBadgeClass(ratio)].join(" ")}>
        {formatPctSigned1(ratio)}
      </span>
      <DeltaPopover title={title} currentLabel={currentLabel} previousLabel={previousLabel} current={current} previous={previous} format={format} />
    </div>
  );

  const pad2 = (n: number) => String(n).padStart(2, "0");
  const toISO = (d: Date) => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
  const fromISO = (ymd: string): Date | null => {
    const s = String(ymd || "").trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return null;
    const [y, m, d] = s.split("-").map(Number);
    const dt = new Date(y, (m || 1) - 1, d || 1);
    if (dt.getFullYear() !== y || dt.getMonth() !== (m || 1) - 1 || dt.getDate() !== d) return null;
    return dt;
  };
  const addDays = (ymd: string, days: number): string => {
    const dt = fromISO(ymd);
    if (!dt) return ymd;
    const x = new Date(dt);
    x.setDate(x.getDate() + days);
    return toISO(x);
  };
  const addMonthsClamped = (ymd: string, months: number): string => {
    const dt = fromISO(ymd);
    if (!dt) return ymd;
    const y = dt.getFullYear();
    const m = dt.getMonth();
    const d = dt.getDate();
    const targetFirst = new Date(y, m + months, 1);
    const lastDay = new Date(targetFirst.getFullYear(), targetFirst.getMonth() + 1, 0).getDate();
    const clamped = Math.min(d, lastDay);
    return toISO(new Date(targetFirst.getFullYear(), targetFirst.getMonth(), clamped));
  };
  const daysInclusive = (start: string, end: string): number => {
    const a = fromISO(start);
    const b = fromISO(end);
    if (!a || !b) return 0;
    const diff = Math.round((b.getTime() - a.getTime()) / 86400000);
    return diff >= 0 ? diff + 1 : 0;
  };
  const dayOffsetFrom = (start: string, ymd: string): number | null => {
    const a = fromISO(start);
    const b = fromISO(ymd);
    if (!a || !b) return null;
    return Math.round((b.getTime() - a.getTime()) / 86400000);
  };

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

  type RevenueResponse = {
    companyId: number;
    groupId: number | null;
    start: string;
    end: string;
    today: number;
    period: number;
    ordersCount: number;
    itemsSold?: number;
    quotesCount: number;
    conversionRate: number; // ordersCount / quotesCount (0..1)
    daily: { ymd?: string; date: string; total: number }[];
    byMarketplace?: { marketplace: string; revenue: number; ordersCount: number; avgTicket: number }[];
    byBrand?: { id: string; revenue: number }[];
    byCategory?: { id: string; revenue: number }[];
    byProductTable?: { productId: number | null; sku: string; name: string | null; revenue: number; ordersCount: number; avgTicket: number; qty: number }[];
  };

  type OperationSummaryResponse = {
    start: string;
    end: string;
    cancelled: number;
    returned: number;
    inProgress: number;
  };

  const [filtersLoading, setFiltersLoading] = useState(true);
  const [filtersError, setFiltersError] = useState<string | null>(null);
  const [filters, setFilters] = useState<FiltersResponse | null>(null);

  const [status, setStatus] = useState<string[]>([]);
  const [stores, setStores] = useState<string[]>([]);
  const [channels, setChannels] = useState<string[]>([]);
  const [categories, setCategories] = useState<string[]>([]);
  const [states, setStates] = useState<string[]>([]);
  const [cities, setCities] = useState<string[]>([]);
  const [dateRange, setDateRange] = useState<DateRangeValue>(() => {
    const now = new Date();
    const start = new Date(now.getFullYear(), now.getMonth(), 1);
    return { start: toISO(start), end: toISO(now) };
  });

  const [compareRange, setCompareRange] = useState<DateRangeValue>(() => {
    const now = new Date();
    const curStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const cur = { start: toISO(curStart), end: toISO(now) };
    const len = daysInclusive(cur.start, cur.end) || 1;
    const cmpStart = addMonthsClamped(cur.start, -1);
    return { start: cmpStart, end: addDays(cmpStart, len - 1) };
  });
  const compareTouched = useRef(false);

  // Mantém o comparativo com a mesma quantidade de dias do período principal.
  useEffect(() => {
    const start = String(dateRange.start || "").trim();
    const end = String(dateRange.end || "").trim();
    if (!start || !end) return;
    const len = daysInclusive(start, end);
    if (!len) return;

    setCompareRange((cur) => {
      const curStart = String(cur.start || "").trim();
      const nextStart = compareTouched.current && curStart ? curStart : addMonthsClamped(start, -1);
      const nextEnd = addDays(nextStart, len - 1);
      if (cur.start === nextStart && cur.end === nextEnd) return cur;
      return { start: nextStart, end: nextEnd };
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dateRange.start, dateRange.end]);

  const [productValues, setProductValues] = useState<string[]>([]);
  const [productOptions, setProductOptions] = useState<ProductOption[]>([]);
  const [productLoading, setProductLoading] = useState(false);
  const [productError, setProductError] = useState<string | null>(null);
  const [productQuery, setProductQuery] = useState("");

  const [filtersOpen, setFiltersOpen] = useState(false);
  const [citiesOverride, setCitiesOverride] = useState<string[] | null>(null);
  const [citiesLoading, setCitiesLoading] = useState(false);
  const [citiesError, setCitiesError] = useState<string | null>(null);

  const [searchParams] = useSearchParams();
  const initialFromUrl = useRef(false);
  const initialStoresFromUrl = useRef<string[] | null>(null);

  // Inicializa filtros a partir da URL (link compartilhável)
  useEffect(() => {
    const getAll = (key: string) => searchParams.getAll(key).map((v) => String(v)).filter(Boolean);
    const status = getAll("status");
    const stores = getAll("store");
    const channels = getAll("channel");
    const categories = getAll("category");
    const products = getAll("product");
    const states = getAll("state");
    const cities = getAll("city");
    const start = String(searchParams.get("start") || "");
    const end = String(searchParams.get("end") || "");

    if (
      status.length ||
      stores.length ||
      channels.length ||
      categories.length ||
      products.length ||
      states.length ||
      cities.length ||
      start ||
      end
    ) {
      initialFromUrl.current = true;
    }
    initialStoresFromUrl.current = stores.length ? stores : null;

    if (status.length) setStatus(status);
    if (stores.length) setStores(stores);
    if (channels.length) setChannels(channels);
    if (categories.length) setCategories(categories);
    if (products.length) setProductValues(products);
    if (states.length) setStates(states);
    if (cities.length) setCities(cities);
    if (start || end) setDateRange({ start, end });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const [revenueLoading, setRevenueLoading] = useState(false);
  const [revenueError, setRevenueError] = useState<string | null>(null);
  const [todayRevenue, setTodayRevenue] = useState<number>(0);
  const [periodRevenue, setPeriodRevenue] = useState<number>(0);
  const [comparePeriodRevenue, setComparePeriodRevenue] = useState<number>(0);
  const [dailyRevenue, setDailyRevenue] = useState<{ ymd: string; date: string; total: number }[]>([]);
  const [dailyCompareRevenue, setDailyCompareRevenue] = useState<{ ymd: string; date: string; total: number }[]>([]);
  const [ordersCount, setOrdersCount] = useState<number>(0);
  const [itemsSold, setItemsSold] = useState<number>(0);
  const [quotesCount, setQuotesCount] = useState<number>(0);
  const [conversionRate, setConversionRate] = useState<number>(0);
  const [compareItemsSold, setCompareItemsSold] = useState<number>(0);
  const [compareConversionRate, setCompareConversionRate] = useState<number>(0);

  const [operationLoading, setOperationLoading] = useState(false);
  const [operationError, setOperationError] = useState<string | null>(null);
  const [cancelledCount, setCancelledCount] = useState<number>(0);
  const [returnedCount, setReturnedCount] = useState<number>(0);
  const [inProgressCount, setInProgressCount] = useState<number>(0);
  const [cancelledPrevCount, setCancelledPrevCount] = useState<number>(0);
  const [returnedPrevCount, setReturnedPrevCount] = useState<number>(0);
  const [inProgressPrevCount, setInProgressPrevCount] = useState<number>(0);

  const [marketplaceRevenue, setMarketplaceRevenue] = useState<{ marketplace: string; revenue: number }[]>([]);
  const [marketplaceCompareRevenue, setMarketplaceCompareRevenue] = useState<{ marketplace: string; revenue: number }[]>([]);
  const [brandRevenue, setBrandRevenue] = useState<{ id: string; revenue: number }[]>([]);
  const [brandCompareRevenue, setBrandCompareRevenue] = useState<{ id: string; revenue: number }[]>([]);
  const [categoryRevenueAgg, setCategoryRevenueAgg] = useState<{ id: string; revenue: number }[]>([]);
  const [categoryCompareRevenueAgg, setCategoryCompareRevenueAgg] = useState<{ id: string; revenue: number }[]>([]);
  const [productTable, setProductTable] = useState<{ productId: number | null; sku: string; name: string | null; revenue: number; ordersCount: number; avgTicket: number; qty: number }[]>([]);
  const [productCompareTable, setProductCompareTable] = useState<{ productId: number | null; sku: string; name: string | null; revenue: number; ordersCount: number; avgTicket: number; qty: number }[]>([]);
  const [selectedProductId, setSelectedProductId] = useState<number | null>(null);

  type CategoryDrillLevel = "category" | "subcategory" | "final";
  const [categoryLevel, setCategoryLevel] = useState<CategoryDrillLevel>("category");
  const [drillCategory, setDrillCategory] = useState<string>("");
  const [drillSubcategory, setDrillSubcategory] = useState<string>("");

  useEffect(() => {
    const ac = new AbortController();
    const start = String(dateRange.start || "").trim();
    const end = String(dateRange.end || "").trim();
    const cStart = String(compareRange.start || "").trim();
    const cEnd = String(compareRange.end || "").trim();
    if (!start || !end) return;
    if (!cStart || !cEnd) return;

    setRevenueLoading(true);
    setRevenueError(null);

    setOperationLoading(true);
    setOperationError(null);

    const buildFiltersQs = () => {
      const qs = new URLSearchParams();
      const appendMany = (key: string, list: string[]) => {
        for (const v of list) {
          const s = String(v ?? "").trim();
          if (s) qs.append(key, s);
        }
      };
      appendMany("store", stores);
      appendMany("status", status);
      appendMany("channel", channels);
      appendMany("category", categories);
      appendMany("product", productValues);
      appendMany("state", states);
      appendMany("city", cities);
      // drilldown de categoria (somente afeta o gráfico/tabela de categoria)
      qs.set("category_level", categoryLevel);
      if (drillCategory) qs.set("drill_category", drillCategory);
      if (drillSubcategory) qs.set("drill_subcategory", drillSubcategory);
      return qs;
    };

    Promise.all([
      fetch(
        buildApiUrl(`/companies/me/dashboard/revenue?start=${encodeURIComponent(start)}&end=${encodeURIComponent(end)}&${buildFiltersQs().toString()}`),
        {
        headers: { ...getAuthHeaders() },
        signal: ac.signal,
        },
      ).then(async (res) => {
        if (res.status === 401) throw new Error("Não autenticado");
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          throw new Error((data as any)?.message || "Erro ao carregar faturamento");
        }
        return res.json() as Promise<RevenueResponse>;
      }),
      fetch(
        buildApiUrl(`/companies/me/dashboard/revenue?start=${encodeURIComponent(cStart)}&end=${encodeURIComponent(cEnd)}&${buildFiltersQs().toString()}`),
        {
        headers: { ...getAuthHeaders() },
        signal: ac.signal,
        },
      ).then(async (res) => {
        if (res.status === 401) throw new Error("Não autenticado");
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          throw new Error((data as any)?.message || "Erro ao carregar faturamento (comparativo)");
        }
        return res.json() as Promise<RevenueResponse>;
      }),
      (() => {
        // Operação: ignora o filtro de status selecionado pelo usuário (regras fixas do card)
        const qs = buildFiltersQs();
        qs.delete("status");
        const fetchOp = (s: string, e: string) =>
          fetch(buildApiUrl(`/companies/me/dashboard/operation/summary?start=${encodeURIComponent(s)}&end=${encodeURIComponent(e)}&${qs.toString()}`), {
            headers: { ...getAuthHeaders() },
            signal: ac.signal,
          }).then(async (res) => {
            if (res.status === 401) throw new Error("Não autenticado");
            if (!res.ok) {
              const data = await res.json().catch(() => ({}));
              throw new Error((data as any)?.message || "Erro ao carregar operação");
            }
            return res.json() as Promise<OperationSummaryResponse>;
          });
        return Promise.all([fetchOp(start, end), fetchOp(cStart, cEnd)]) as Promise<[OperationSummaryResponse, OperationSummaryResponse]>;
      })(),
    ])
      .then(([cur, prev, op]) => {
        setTodayRevenue(Number(cur.today || 0));
        setPeriodRevenue(Number(cur.period || 0));
        setComparePeriodRevenue(Number(prev.period || 0));
        setDailyRevenue(
          (Array.isArray(cur.daily) ? cur.daily : []).map((r: any) => ({
            ymd: String(r.ymd ?? ""),
            date: String(r.date ?? ""),
            total: Number(r.total ?? 0) || 0,
          })),
        );
        setDailyCompareRevenue(
          (Array.isArray(prev.daily) ? prev.daily : []).map((r: any) => ({
            ymd: String(r.ymd ?? ""),
            date: String(r.date ?? ""),
            total: Number(r.total ?? 0) || 0,
          })),
        );
        setOrdersCount(Number(cur.ordersCount || 0));
        setItemsSold(Number((cur as any).itemsSold || 0));
        setQuotesCount(Number(cur.quotesCount || 0));
        setConversionRate(Number(cur.conversionRate || 0));
        setCompareItemsSold(Number((prev as any).itemsSold || 0));
        setCompareConversionRate(Number(prev.conversionRate || 0));

        setMarketplaceRevenue(
          (Array.isArray((cur as any)?.byMarketplace) ? (cur as any).byMarketplace : []).map((r: any) => ({
            marketplace: String(r.marketplace ?? r.id ?? r.channel ?? r.name ?? ""),
            revenue: Number(r.revenue ?? r.value ?? 0) || 0,
          })),
        );
        setMarketplaceCompareRevenue(
          (Array.isArray((prev as any)?.byMarketplace) ? (prev as any).byMarketplace : []).map((r: any) => ({
            marketplace: String(r.marketplace ?? r.id ?? r.channel ?? r.name ?? ""),
            revenue: Number(r.revenue ?? r.value ?? 0) || 0,
          })),
        );
        setBrandRevenue((Array.isArray((cur as any)?.byBrand) ? (cur as any).byBrand : []).map((r: any) => ({ id: String(r.id ?? ""), revenue: Number(r.revenue ?? 0) || 0 })));
        setBrandCompareRevenue((Array.isArray((prev as any)?.byBrand) ? (prev as any).byBrand : []).map((r: any) => ({ id: String(r.id ?? ""), revenue: Number(r.revenue ?? 0) || 0 })));
        setCategoryRevenueAgg((Array.isArray((cur as any)?.byCategory) ? (cur as any).byCategory : []).map((r: any) => ({ id: String(r.id ?? ""), revenue: Number(r.revenue ?? 0) || 0 })));
        setCategoryCompareRevenueAgg((Array.isArray((prev as any)?.byCategory) ? (prev as any).byCategory : []).map((r: any) => ({ id: String(r.id ?? ""), revenue: Number(r.revenue ?? 0) || 0 })));
        setProductTable(
          (Array.isArray((cur as any)?.byProductTable) ? (cur as any).byProductTable : []).map((r: any) => ({
            productId: Number((r as any)?.productId ?? 0) || null,
            sku: String(r.sku ?? ""),
            name: r.name ?? null,
            revenue: Number(r.revenue ?? 0) || 0,
            ordersCount: Number(r.ordersCount ?? 0) || 0,
            avgTicket: Number(r.avgTicket ?? 0) || 0,
            qty: Number(r.qty ?? 0) || 0,
          })),
        );
        setProductCompareTable(
          (Array.isArray((prev as any)?.byProductTable) ? (prev as any).byProductTable : []).map((r: any) => ({
            productId: Number((r as any)?.productId ?? 0) || null,
            sku: String(r.sku ?? ""),
            name: r.name ?? null,
            revenue: Number(r.revenue ?? 0) || 0,
            ordersCount: Number(r.ordersCount ?? 0) || 0,
            avgTicket: Number(r.avgTicket ?? 0) || 0,
            qty: Number(r.qty ?? 0) || 0,
          })),
        );

        const [opCur, opPrev] = op as any as [OperationSummaryResponse, OperationSummaryResponse];
        setCancelledCount(Number(opCur?.cancelled || 0));
        setReturnedCount(Number(opCur?.returned || 0));
        setInProgressCount(Number(opCur?.inProgress || 0));
        setCancelledPrevCount(Number(opPrev?.cancelled || 0));
        setReturnedPrevCount(Number(opPrev?.returned || 0));
        setInProgressPrevCount(Number(opPrev?.inProgress || 0));
        setOperationError(null);
      })
      .catch((e: any) => {
        setTodayRevenue(0);
        setPeriodRevenue(0);
        setComparePeriodRevenue(0);
        setDailyRevenue([]);
        setDailyCompareRevenue([]);
        setOrdersCount(0);
        setItemsSold(0);
        setQuotesCount(0);
        setConversionRate(0);
        setCompareItemsSold(0);
        setCompareConversionRate(0);
        setRevenueError(String(e?.message || "Erro ao carregar faturamento"));

        setMarketplaceRevenue([]);
        setMarketplaceCompareRevenue([]);
        setBrandRevenue([]);
        setBrandCompareRevenue([]);
        setCategoryRevenueAgg([]);
        setCategoryCompareRevenueAgg([]);
        setProductTable([]);
        setProductCompareTable([]);

        setCancelledCount(0);
        setReturnedCount(0);
        setInProgressCount(0);
        setCancelledPrevCount(0);
        setReturnedPrevCount(0);
        setInProgressPrevCount(0);
        setOperationError(String(e?.message || "Erro ao carregar operação"));
      })
      .finally(() => {
        setRevenueLoading(false);
        setOperationLoading(false);
      });

    return () => ac.abort();
  }, [
    dateRange.start,
    dateRange.end,
    compareRange.start,
    compareRange.end,
    status,
    stores,
    channels,
    categories,
    productValues,
    states,
    cities,
    categoryLevel,
    drillCategory,
    drillSubcategory,
  ]);

  useEffect(() => {
    const ac = new AbortController();
    setFiltersLoading(true);
    setFiltersError(null);
    fetch(buildApiUrl("/companies/me/dashboard/filters"), { headers: { ...getAuthHeaders() }, signal: ac.signal })
      .then(async (res) => {
        if (res.status === 401) throw new Error("Não autenticado");
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          throw new Error((data as any)?.message || "Erro ao carregar filtros");
        }
        return res.json() as Promise<FiltersResponse>;
      })
      .then((d) => {
        setFilters(d);
        // Se não veio da URL, default: todas as lojas do grupo selecionadas.
        if (!initialStoresFromUrl.current) {
          setStores(d.stores?.map((s) => String(s.id)) || []);
        }
      })
      .catch((e: any) => {
        setFilters(null);
        setFiltersError(String(e?.message || "Erro ao carregar filtros"));
      })
      .finally(() => setFiltersLoading(false));

    return () => ac.abort();
  }, []);

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
    // inclui selecionados mesmo se não estiverem no resultado atual
    for (const v of productValues) {
      if (!map.has(v)) map.set(v, { value: v, label: v });
    }
    for (const p of productOptions) {
      const label = `${p.sku} — ${p.name || "Sem nome"}`;
      map.set(String(p.sku), { value: String(p.sku), label });
    }
    return Array.from(map.values());
  }, [productOptions, productValues]);

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
          if (res.status === 401) throw new Error("Não autenticado");
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

  // cidades dependem do(s) estado(s) selecionado(s)
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
        if (res.status === 401) throw new Error("Não autenticado");
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          throw new Error((data as any)?.message || "Erro ao carregar cidades");
        }
        return res.json() as Promise<string[]>;
      })
      .then((list) => {
        const next = Array.isArray(list) ? list : [];
        setCitiesOverride(next);
        // remove cidades selecionadas que não pertencem aos estados atuais
        setCities((cur) => cur.filter((c) => next.includes(c)));
      })
      .catch((e: any) => {
        setCitiesOverride([]);
        setCitiesError(String(e?.message || "Erro ao carregar cidades"));
      })
      .finally(() => setCitiesLoading(false));

    return () => ac.abort();
  }, [filters, states]);

  const applyFiltersToUrl = () => {
    const params = new URLSearchParams();
    const appendMany = (key: string, list: string[]) => {
      for (const v of list) {
        const s = String(v ?? "").trim();
        if (s) params.append(key, s);
      }
    };

    if (dateRange.start) params.set("start", dateRange.start);
    if (dateRange.end) params.set("end", dateRange.end);
    appendMany("status", status);
    appendMany("store", stores);
    appendMany("channel", channels);
    appendMany("category", categories);
    appendMany("product", productValues);
    appendMany("state", states);
    appendMany("city", cities);

    const qs = params.toString();
    // Hard reload para garantir URL compartilhável e estado limpo, como você pediu
    window.location.href = qs ? `/dashboard?${qs}` : `/dashboard`;
  };

  // Gráfico: mês atual vs último mês + projeção do mês atual
  const now = new Date();
  const todayDay = now.getDate(); // 1..31
  const curMonthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const curMonthDays = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
  const lastMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const lastMonthDays = new Date(now.getFullYear(), now.getMonth(), 0).getDate();

  const monthLineData = useMemo(() => {
    const start = String(dateRange.start || "").trim();
    const end = String(dateRange.end || "").trim();
    const cStart = String(compareRange.start || "").trim();
    if (!start || !end || !cStart) return [];
    const len = daysInclusive(start, end);
    if (!len) return [];

    const curMap = new Map<string, number>();
    for (const r of dailyRevenue) {
      const key = String(r.ymd || "").trim();
      if (key) curMap.set(key, Number(r.total || 0));
    }
    const prevMap = new Map<string, number>();
    for (const r of dailyCompareRevenue) {
      const key = String(r.ymd || "").trim();
      if (key) prevMap.set(key, Number(r.total || 0));
    }

    const curPts: { x: string; y: number }[] = [];
    const prevPts: { x: string; y: number }[] = [];
    for (let i = 0; i < len; i++) {
      const x = addDays(start, i); // eixo é sempre o período atual
      const curY = curMap.get(x) ?? 0;
      const prevYmd = addDays(cStart, i);
      const prevY = prevMap.get(prevYmd) ?? 0;
      curPts.push({ x, y: curY });
      prevPts.push({ x, y: prevY });
    }
    return [
      { id: "Período", data: curPts },
      { id: "Comparativo", data: prevPts },
    ];
  }, [addDays, compareRange.start, dailyCompareRevenue, dailyRevenue, dateRange.end, dateRange.start]);

  const revenueDelta = useMemo(() => pctChange(periodRevenue, comparePeriodRevenue), [comparePeriodRevenue, periodRevenue]);
  const itemsDelta = useMemo(() => pctChange(itemsSold, compareItemsSold), [compareItemsSold, itemsSold]);
  const conversionDelta = useMemo(() => pctChange(conversionRate, compareConversionRate), [compareConversionRate, conversionRate]);

  // Rótulo curto usado em cabeçalhos de tabelas (Período vs Comparativo)
  const compareLabelShort = "Comparativo";

  const marketplaceBarData = useMemo(() => {
    const curMap = new Map<string, number>();
    for (const r of marketplaceRevenue) curMap.set(String(r.marketplace || ""), Number(r.revenue || 0) || 0);
    const prevMap = new Map<string, number>();
    for (const r of marketplaceCompareRevenue) prevMap.set(String(r.marketplace || ""), Number(r.revenue || 0) || 0);

    const ids = Array.from(new Set([...curMap.keys(), ...prevMap.keys()])).filter(Boolean);
    const rows = ids.map((id) => ({
      marketplace: id,
      periodo: curMap.get(id) ?? 0,
      comparativo: prevMap.get(id) ?? 0,
    }));
    rows.sort((a, b) => (Number(b.periodo) || 0) - (Number(a.periodo) || 0));
    return rows;
  }, [marketplaceCompareRevenue, marketplaceRevenue]);

  const cancelledDelta = useMemo(() => pctChange(cancelledCount, cancelledPrevCount), [cancelledCount, cancelledPrevCount]);
  const returnedDelta = useMemo(() => pctChange(returnedCount, returnedPrevCount), [returnedCount, returnedPrevCount]);
  const inProgressDelta = useMemo(() => pctChange(inProgressCount, inProgressPrevCount), [inProgressCount, inProgressPrevCount]);

  const brandBarData = useMemo(() => {
    const curMap = new Map<string, number>();
    for (const r of brandRevenue) curMap.set(String(r.id || ""), Number(r.revenue || 0) || 0);
    const prevMap = new Map<string, number>();
    for (const r of brandCompareRevenue) prevMap.set(String(r.id || ""), Number(r.revenue || 0) || 0);
    const ids = Array.from(new Set([...curMap.keys(), ...prevMap.keys()])).filter(Boolean);
    const rows = ids.map((id) => ({ id, periodo: curMap.get(id) ?? 0, comparativo: prevMap.get(id) ?? 0 }));
    rows.sort((a, b) => (Number(b.periodo) || 0) - (Number(a.periodo) || 0));
    return rows;
  }, [brandCompareRevenue, brandRevenue]);

  const categoryBarData = useMemo(() => {
    const curMap = new Map<string, number>();
    for (const r of categoryRevenueAgg) curMap.set(String(r.id || ""), Number(r.revenue || 0) || 0);
    const prevMap = new Map<string, number>();
    for (const r of categoryCompareRevenueAgg) prevMap.set(String(r.id || ""), Number(r.revenue || 0) || 0);
    const ids = Array.from(new Set([...curMap.keys(), ...prevMap.keys()])).filter(Boolean);
    const rows = ids.map((id) => ({ id, periodo: curMap.get(id) ?? 0, comparativo: prevMap.get(id) ?? 0 }));
    rows.sort((a, b) => (Number(b.periodo) || 0) - (Number(a.periodo) || 0));
    return rows;
  }, [categoryCompareRevenueAgg, categoryRevenueAgg]);

  type SortDir = "asc" | "desc";
  type ProductSortKey = "sku" | "revenue" | "revenueDelta" | "prevRevenue" | "avgTicket" | "ticketDelta" | "prevAvgTicket";
  type ProductSort = { key: ProductSortKey; dir: SortDir };
  const [productSort, setProductSort] = useState<ProductSort>({ key: "revenue", dir: "desc" });
  const productSortIndicator = (sort: ProductSort, key: ProductSortKey) => (sort.key === key ? (sort.dir === "asc" ? "▲" : "▼") : "");
  const toggleProductSort = (key: ProductSortKey) => {
    setProductSort((cur) => (cur.key === key ? { key, dir: cur.dir === "asc" ? "desc" : "asc" } : { key, dir: "desc" }));
  };

  const productRows = useMemo(() => {
    const prevMap = new Map<string, any>((productCompareTable || []).map((p: any) => [String(p.sku), p]));
    return (productTable || []).map((r: any) => {
      const prev = prevMap.get(String(r.sku));
      const revenue = Number(r.revenue || 0) || 0;
      const prevRevenue = Number(prev?.revenue || 0) || 0;
      const avgTicket = Number(r.avgTicket || 0) || 0;
      const prevAvgTicket = Number(prev?.avgTicket || 0) || 0;
      return {
        productId: Number(r.productId ?? 0) || null,
        sku: String(r.sku ?? ""),
        name: r.name ?? null,
        revenue,
        prevRevenue,
        revenueDelta: pctChange(revenue, prevRevenue),
        avgTicket,
        prevAvgTicket,
        ticketDelta: pctChange(avgTicket, prevAvgTicket),
      };
    });
  }, [productCompareTable, productTable]);

  const productRowsSorted = useMemo(() => {
    const dirMul = productSort.dir === "asc" ? 1 : -1;
    const out = [...productRows];
    out.sort((a: any, b: any) => {
      const key = productSort.key;
      if (key === "sku") return String(a.sku).localeCompare(String(b.sku), "pt-BR") * dirMul;
      const get = (x: any) => {
        if (key === "revenue") return x.revenue;
        if (key === "prevRevenue") return x.prevRevenue;
        if (key === "revenueDelta") return x.revenueDelta;
        if (key === "avgTicket") return x.avgTicket;
        if (key === "prevAvgTicket") return x.prevAvgTicket;
        if (key === "ticketDelta") return x.ticketDelta;
        return null;
      };
      const av = get(a);
      const bv = get(b);
      const aNull = av === null || !Number.isFinite(av);
      const bNull = bv === null || !Number.isFinite(bv);
      if (aNull && bNull) return 0;
      if (aNull) return 1;
      if (bNull) return -1;
      return (Number(av) - Number(bv)) * dirMul;
    });
    return out;
  }, [productRows, productSort]);

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

  return (
    <div className="w-full">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
      <h1 className="text-2xl font-extrabold text-slate-900">Dashboard</h1>

        <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row sm:items-end">
          <div className="w-full sm:w-[360px]">
            <DateRangePicker
              label="Período"
              value={dateRange}
              onChange={(next) => {
                // ao alterar o período principal, ajusta comparativo se ainda não foi "tocado"
                setDateRange(next);
              }}
              placeholder="Selecionar período..."
            />
          </div>
          <div className="w-full sm:w-[360px]">
            <DateRangePicker
              label="Comparar com"
              value={compareRange}
              onChange={(next) => {
                compareTouched.current = true;
                const len = daysInclusive(dateRange.start, dateRange.end) || 1;
                const start = String(next.start || "").trim();
                if (!start) return;
                setCompareRange({ start, end: addDays(start, len - 1) });
              }}
              placeholder="Selecionar comparativo..."
            />
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

      {meError || filtersLoading || filtersError || productLoading || productError ? (
        <div className="mt-2 space-y-1">
          {meError ? <div className="text-sm text-red-600">{meError}</div> : null}
          {filtersLoading ? <div className="text-sm text-slate-700">Carregando filtros...</div> : null}
          {!filtersLoading && filtersError ? <div className="text-sm text-red-600">{filtersError}</div> : null}
          {revenueLoading ? <div className="text-sm text-slate-700">Carregando faturamento...</div> : null}
          {!revenueLoading && revenueError ? <div className="text-sm text-red-600">{revenueError}</div> : null}
          {productLoading ? <div className="text-xs text-slate-600">Buscando produtos...</div> : null}
          {!productLoading && productError ? <div className="text-xs text-red-600">{productError}</div> : null}
        </div>
        ) : null}

      <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-4">
        <Card className="w-full border-slate-200 bg-white p-5">
          <div className="flex items-center justify-between gap-3">
            <div className="text-sm font-semibold text-slate-600">Faturamento de hoje</div>
            <div className="inline-flex items-center gap-2 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-xs font-extrabold text-emerald-700">
              <span className="relative flex h-2.5 w-2.5">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-500 opacity-60" />
                <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-emerald-600" />
              </span>
              AO VIVO
            </div>
          </div>
          <div className="mt-2 text-3xl font-extrabold text-slate-900">{formatBRLNoSpace(todayRevenue)}</div>
          <button
            type="button"
            onClick={() => navigate("/dashboard/ao-vivo")}
            className="mt-4 w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm font-extrabold text-slate-800 hover:bg-slate-50"
          >
            Acompanhe suas vendas ao vivo
          </button>
        </Card>

        <Card className="w-full border-slate-200 bg-white p-5">
          <div className="flex items-center justify-between gap-3">
          <div className="text-sm font-semibold text-slate-600">Faturado do período</div>
            <DeltaBadgeWithPopover
              title="Faturado do período"
              ratio={revenueDelta}
              currentLabel="Período"
              previousLabel="Comparativo"
              current={periodRevenue}
              previous={comparePeriodRevenue}
              format={(n) => formatBRLNoSpace(Number(n))}
            />
          </div>
          <div className="mt-2 text-3xl font-extrabold text-slate-900">{formatBRLNoSpace(periodRevenue)}</div>
          <button
            type="button"
            onClick={() => navigate("/dashboard/mes")}
            className="mt-4 w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm font-extrabold text-slate-800 hover:bg-slate-50"
          >
            Acompanhe suas vendas do mês
          </button>
        </Card>

        <Card className="w-full border-slate-200 bg-white p-5">
          <div className="flex items-center justify-between gap-3">
            <div className="text-sm font-semibold text-slate-600">Total de itens vendidos</div>
            <DeltaBadgeWithPopover
              title="Total de itens vendidos"
              ratio={itemsDelta}
              currentLabel="Período"
              previousLabel="Comparativo"
              current={itemsSold}
              previous={compareItemsSold}
              format={(n) => new Intl.NumberFormat("pt-BR").format(Number(n) || 0)}
            />
          </div>
          <div className="mt-2 text-3xl font-extrabold text-slate-900">{new Intl.NumberFormat("pt-BR").format(itemsSold)}</div>
          <button
            type="button"
            onClick={() => navigate("/dashboard/itens")}
            className="mt-4 w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm font-extrabold text-slate-800 hover:bg-slate-50"
          >
            Ver detalhamento dos itens
          </button>
        </Card>

        <Card className="w-full border-slate-200 bg-white p-5">
          <div className="flex items-center justify-between gap-3">
          <div className="text-sm font-semibold text-slate-600">Taxa de conversão</div>
            <DeltaBadgeWithPopover
              title="Taxa de conversão"
              ratio={conversionDelta}
              currentLabel="Período"
              previousLabel="Comparativo"
              current={conversionRate}
              previous={compareConversionRate}
              format={(n) =>
                new Intl.NumberFormat("pt-BR", { style: "percent", minimumFractionDigits: 1, maximumFractionDigits: 1 }).format(
                  Number.isFinite(n) ? n : 0,
                )
              }
            />
          </div>
          <div className="mt-2 flex items-start justify-between gap-4">
            <div className="text-3xl font-extrabold text-slate-900">
              {new Intl.NumberFormat("pt-BR", { style: "percent", minimumFractionDigits: 1, maximumFractionDigits: 1 }).format(
                Number.isFinite(conversionRate) ? conversionRate : 0,
              )}
            </div>
            <div className="text-sm text-slate-700 text-left">
              <div>
                <span className="font-extrabold text-slate-900">{quotesCount}</span> simulações
              </div>
              <div>
                <span className="font-extrabold text-slate-900">{ordersCount}</span> pedidos
              </div>
            </div>
          </div>
          <button
            type="button"
            onClick={() => navigate("/dashboard/simulacoes")}
            className="mt-4 w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm font-extrabold text-slate-800 hover:bg-slate-50"
          >
            Ver simulações de frete
          </button>
        </Card>
      </div>

      {/* Linha do faturamento: dados reais do período */}
      <Card className="mt-4 w-full border-slate-200 bg-white p-5">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            <div className="text-lg font-extrabold text-slate-900">Faturamento dia a dia</div>
            <span className={["inline-flex rounded-full border px-2 py-0.5 text-[11px] font-extrabold", deltaBadgeClass(revenueDelta)].join(" ")}>
              {formatPctSigned1(revenueDelta)}
            </span>
          </div>
          <div className="text-xs text-slate-600">
            {/* Período:{" "}
            <span className="font-extrabold text-slate-900">
              {dateRange.start ? new Date(`${dateRange.start}T00:00:00`).toLocaleDateString("pt-BR") : "—"} –{" "}
              {dateRange.end ? new Date(`${dateRange.end}T00:00:00`).toLocaleDateString("pt-BR") : "—"}
            </span> */}
          </div>
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-x-6 gap-y-2 text-sm">
          <div className="inline-flex items-center gap-2 text-slate-700">
            <span className="h-2.5 w-2.5 rounded-full" style={{ background: CHART_COLORS[1] }} />
            <span className="font-semibold">Período</span>
          </div>
          <div className="inline-flex items-center gap-2 text-slate-700">
            <span className="h-2.5 w-2.5 rounded-full" style={{ background: CHART_COLORS[5] }} />
            <span className="font-semibold">Comparativo</span>
          </div>
        </div>

        <div className="mt-3" style={{ height: 380 }}>
          <ResponsiveLine
            data={monthLineData as any}
            margin={{ top: 10, right: 24, bottom: 56, left: 92 }}
            xScale={{ type: "point" }}
            yScale={{ type: "linear", min: 0, max: "auto", stacked: false }}
            axisBottom={{
              tickRotation: -45,
              legend: "",
              legendOffset: 46,
              legendPosition: "middle",
              format: (v) => {
                const s = String(v ?? "");
                const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
                if (!m) return s;
                return `${m[3]}/${m[2]}`; // DD/MM
              },
            }}
            axisLeft={{
              format: (v) => formatBRLCompact(Number(v)),
            }}
            enablePoints={true}
            pointSize={9}
            pointColor={{ from: "series.color" }}
            pointBorderWidth={2.5}
            pointBorderColor="#ffffff"
            useMesh={true}
            colors={(d) => {
              const id = String(d.id);
              if (id === "Período") return CHART_COLORS[1];
              if (id === "Comparativo") return CHART_COLORS[5];
              return CHART_COLORS[1];
            }}
            legends={[]}
            theme={{
              axis: { ticks: { text: { fill: "#475569" } }, legend: { text: { fill: "#334155", fontWeight: 700 } } },
              grid: { line: { stroke: "#E2E8F0" } },
              tooltip: { container: { background: "#fff", color: "#0f172a", fontSize: 12, borderRadius: 12 } },
            }}
            layers={["grid", "markers", "areas", "lines", "points", "slices", "mesh", "axes"]}
            onClick={(point: any) => {
              const ymd = String(point?.data?.x ?? "");
              if (!/^\d{4}-\d{2}-\d{2}$/.test(ymd)) return;
              const seriesId = String(point?.serieId ?? point?.seriesId ?? "");
              if (seriesId === "Comparativo") {
                const off = dayOffsetFrom(dateRange.start, ymd);
                if (off === null || off < 0) return;
                const real = addDays(compareRange.start, off);
                if (!/^\d{4}-\d{2}-\d{2}$/.test(real)) return;
                navigate(`/dashboard/ao-vivo?day=${encodeURIComponent(real)}`);
              } else {
                navigate(`/dashboard/ao-vivo?day=${encodeURIComponent(ymd)}`);
              }
            }}
            tooltip={({ point }: any) => {
              const ymd = String(point?.data?.x ?? "");
              const seriesId = String(point?.serieId ?? point?.seriesId ?? "");
              const displayYmd =
                seriesId === "Comparativo"
                  ? (() => {
                      const off = dayOffsetFrom(dateRange.start, ymd);
                      if (off === null || off < 0) return ymd;
                      return addDays(compareRange.start, off);
                    })()
                  : ymd;
              const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(displayYmd);
              const label = m ? `${m[3]}/${m[2]}/${m[1]}` : displayYmd;
              const value = Number(point?.data?.y ?? 0) || 0;
              const serie = seriesId;
              return (
              <div className="min-w-[200px] rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs text-slate-900 shadow-xl">
                  <div className="font-extrabold">{label || "-"}</div>
                  {serie ? <div className="mt-0.5 text-[11px] font-semibold text-slate-600">{serie}</div> : null}
                  <div className="mt-1 text-sm font-extrabold text-slate-900">{formatBRLNoSpace(value)}</div>
                  <div className="mt-1 text-[11px] font-semibold text-slate-600">Clique no ponto para ver o dia em detalhes.</div>
              </div>
              );
            }}
          />
        </div>

        {!dailyRevenue.length && !revenueLoading ? (
          <div className="mt-2 text-xs text-slate-600">Sem dados no período selecionado.</div>
        ) : null}
      </Card>

      <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-12">
        {/* Operação (1/3) */}
        <Card className="w-full border-slate-200 bg-white p-5 lg:col-span-4">
          <div className="flex flex-col gap-2">
            <div className="text-lg font-extrabold text-slate-900">Operação</div>
            {operationLoading ? <div className="text-xs text-slate-600">Carregando operação...</div> : null}
          </div>

          {!operationLoading && operationError ? <div className="mt-2 text-sm text-red-600">{operationError}</div> : null}

          <div className="mt-3 grid grid-cols-1 gap-3">
            <div className="rounded-xl border border-slate-200 bg-white px-4 py-3">
              <div className="flex items-center justify-between gap-2">
                <div className="text-xs font-semibold text-slate-500">Vendas canceladas</div>
                <DeltaBadgeWithPopover
                  title="Vendas canceladas"
                  ratio={cancelledDelta}
                  currentLabel="Período"
                  previousLabel="Comparativo"
                  current={cancelledCount}
                  previous={cancelledPrevCount}
                  format={(n) => new Intl.NumberFormat("pt-BR").format(Number(n) || 0)}
                />
              </div>
              <div className="mt-1 text-2xl font-extrabold text-slate-900">{new Intl.NumberFormat("pt-BR").format(cancelledCount)}</div>
            </div>
            <div className="rounded-xl border border-slate-200 bg-white px-4 py-3">
              <div className="flex items-center justify-between gap-2">
                <div className="text-xs font-semibold text-slate-500">Vendas devolvidas</div>
                <DeltaBadgeWithPopover
                  title="Vendas devolvidas"
                  ratio={returnedDelta}
                  currentLabel="Período"
                  previousLabel="Comparativo"
                  current={returnedCount}
                  previous={returnedPrevCount}
                  format={(n) => new Intl.NumberFormat("pt-BR").format(Number(n) || 0)}
                />
              </div>
              <div className="mt-1 text-2xl font-extrabold text-slate-900">{new Intl.NumberFormat("pt-BR").format(returnedCount)}</div>
            </div>
            <div className="rounded-xl border border-slate-200 bg-white px-4 py-3">
              <div className="flex items-center justify-between gap-2">
                <div className="text-xs font-semibold text-slate-500">Pedidos em andamento</div>
                <DeltaBadgeWithPopover
                  title="Pedidos em andamento"
                  ratio={inProgressDelta}
                  currentLabel="Período"
                  previousLabel="Comparativo"
                  current={inProgressCount}
                  previous={inProgressPrevCount}
                  format={(n) => new Intl.NumberFormat("pt-BR").format(Number(n) || 0)}
                />
              </div>
              <div className="mt-1 text-2xl font-extrabold text-slate-900">{new Intl.NumberFormat("pt-BR").format(inProgressCount)}</div>
            </div>
          </div>

          <button
            type="button"
            onClick={() => navigate(`/dashboard/operacao${window.location.search || ""}`)}
            className="mt-4 w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm font-extrabold text-slate-800 hover:bg-slate-50"
          >
            Ver detalhes da Operação
          </button>
        </Card>

        {/* Marketplaces (2/3) */}
        <Card className="w-full border-slate-200 bg-white p-5 lg:col-span-8">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div className="text-lg font-extrabold text-slate-900">Faturamento por marketplace</div>
            <div className="text-xs text-slate-600">
              <span className="font-semibold">Período</span> vs <span className="font-semibold">Comparativo</span>
            </div>
          </div>

          <div className="mt-3 flex flex-wrap items-center gap-x-6 gap-y-2 text-sm">
            <div className="inline-flex items-center gap-2 text-slate-700">
              <span className="h-2.5 w-2.5 rounded-full" style={{ background: CHART_COLORS[1] }} />
              <span className="font-semibold">Período</span>
            </div>
            <div className="inline-flex items-center gap-2 text-slate-700">
              <span className="h-2.5 w-2.5 rounded-full" style={{ background: CHART_COLORS[5] }} />
              <span className="font-semibold">Comparativo</span>
            </div>
          </div>

          <div className="mt-3" style={{ height: 320 }}>
            {marketplaceBarData.length ? (
              <ResponsiveBar
                data={marketplaceBarData as any}
                keys={["periodo", "comparativo"]}
                indexBy="marketplace"
                margin={{ top: 10, right: 16, bottom: 64, left: 64 }}
                padding={0.3}
                groupMode="grouped"
                colors={({ id }: any) => (String(id) === "comparativo" ? CHART_COLORS[5] : CHART_COLORS[1])}
                borderRadius={6}
                enableGridY={true}
                enableGridX={false}
                axisBottom={{ tickRotation: -35, tickPadding: 8 }}
                axisLeft={{ format: (v) => formatBRLCompact(Number(v)) }}
                valueFormat={(v: any) => formatBRLNoSpace(Number(v))}
                tooltip={({ indexValue, id, value }: any) => (
                  <div className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs text-slate-900 shadow-xl">
                    <div className="font-extrabold">{String(indexValue)}</div>
                    <div className="text-slate-600">{String(id) === "comparativo" ? "Comparativo" : "Período"}</div>
                    <div className="mt-1 font-extrabold text-slate-900">{formatBRLNoSpace(Number(value))}</div>
                  </div>
                )}
                theme={{
                  axis: { ticks: { text: { fill: "#475569" } }, legend: { text: { fill: "#334155", fontWeight: 700 } } },
                  grid: { line: { stroke: "#E2E8F0" } },
                  tooltip: { container: { background: "#fff", color: "#0f172a", fontSize: 12, borderRadius: 12 } },
                }}
              />
            ) : (
              <div className="flex h-full items-center justify-center text-sm text-slate-500">Sem dados.</div>
            )}
          </div>
        </Card>
      </div>

      <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-12">
        <Card className="w-full border-slate-200 bg-white p-5 lg:col-span-6">
          <div className="text-lg font-extrabold text-slate-900">Faturamento por marca</div>
          <div className="mt-3 flex flex-wrap items-center gap-x-6 gap-y-2 text-sm">
            <div className="inline-flex items-center gap-2 text-slate-700">
              <span className="h-2.5 w-2.5 rounded-full" style={{ background: CHART_COLORS[1] }} />
              <span className="font-semibold">Período</span>
            </div>
            <div className="inline-flex items-center gap-2 text-slate-700">
              <span className="h-2.5 w-2.5 rounded-full" style={{ background: CHART_COLORS[5] }} />
              <span className="font-semibold">Comparativo</span>
            </div>
          </div>
          <div className="mt-3" style={{ height: 320 }}>
            {brandBarData.length ? (
              <ResponsiveBar
                data={brandBarData as any}
                keys={["periodo", "comparativo"]}
                indexBy="id"
                margin={{ top: 10, right: 16, bottom: 64, left: 64 }}
                padding={0.3}
                groupMode="grouped"
                colors={({ id }: any) => (String(id) === "comparativo" ? CHART_COLORS[5] : CHART_COLORS[1])}
                borderRadius={6}
                enableGridY={true}
                enableGridX={false}
                axisBottom={{ tickRotation: -35, tickPadding: 8 }}
                axisLeft={{ format: (v) => formatBRLCompact(Number(v)) }}
                valueFormat={(v: any) => formatBRLNoSpace(Number(v))}
                tooltip={({ indexValue, id, value }: any) => (
                  <div className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs text-slate-900 shadow-xl">
                    <div className="flex items-center gap-2 font-extrabold">
                      <span className="h-2.5 w-2.5 rounded-full" style={{ background: marketplaceColorOrFallback(String(indexValue ?? ""), 0) }} />
                      {String(indexValue)}
                    </div>
                    <div className="text-slate-600">{String(id) === "comparativo" ? "Comparativo" : "Período"}</div>
                    <div className="mt-1 font-extrabold text-slate-900">{formatBRLNoSpace(Number(value))}</div>
                  </div>
                )}
                theme={{
                  axis: { ticks: { text: { fill: "#475569" } }, legend: { text: { fill: "#334155", fontWeight: 700 } } },
                  grid: { line: { stroke: "#E2E8F0" } },
                  tooltip: { container: { background: "#fff", color: "#0f172a", fontSize: 12, borderRadius: 12 } },
                }}
              />
            ) : (
              <div className="flex h-full items-center justify-center text-sm text-slate-500">Sem dados.</div>
            )}
          </div>
        </Card>

        <Card className="w-full border-slate-200 bg-white p-5 lg:col-span-6">
          <div className="text-lg font-extrabold text-slate-900">Faturamento por categoria</div>
          <CategoryBreadcrumb />
          <div className="mt-3 flex flex-wrap items-center gap-x-6 gap-y-2 text-sm">
            <div className="inline-flex items-center gap-2 text-slate-700">
              <span className="h-2.5 w-2.5 rounded-full" style={{ background: CHART_COLORS[1] }} />
              <span className="font-semibold">Período</span>
            </div>
            <div className="inline-flex items-center gap-2 text-slate-700">
              <span className="h-2.5 w-2.5 rounded-full" style={{ background: CHART_COLORS[5] }} />
              <span className="font-semibold">Comparativo</span>
            </div>
          </div>
          <div className="mt-3" style={{ height: 320 }}>
            {categoryBarData.length ? (
              <ResponsiveBar
                data={categoryBarData as any}
                keys={["periodo", "comparativo"]}
                indexBy="id"
                margin={{ top: 10, right: 16, bottom: 64, left: 64 }}
                padding={0.3}
                groupMode="grouped"
                colors={({ id }: any) => (String(id) === "comparativo" ? CHART_COLORS[5] : CHART_COLORS[1])}
                borderRadius={6}
                enableGridY={true}
                enableGridX={false}
                axisBottom={{ tickRotation: -35, tickPadding: 8 }}
                axisLeft={{ format: (v) => formatBRLCompact(Number(v)) }}
                valueFormat={(v: any) => formatBRLNoSpace(Number(v))}
                onClick={(bar: any) => drillDownCategory(String(bar?.indexValue ?? ""))}
                tooltip={({ indexValue, id, value }: any) => (
                  <div className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs text-slate-900 shadow-xl">
                    <div className="font-extrabold">{String(indexValue)}</div>
                    <div className="text-slate-600">{String(id) === "comparativo" ? "Comparativo" : "Período"}</div>
                    <div className="mt-1 font-extrabold text-slate-900">{formatBRLNoSpace(Number(value))}</div>
                  </div>
                )}
                theme={{
                  axis: { ticks: { text: { fill: "#475569" } }, legend: { text: { fill: "#334155", fontWeight: 700 } } },
                  grid: { line: { stroke: "#E2E8F0" } },
                  tooltip: { container: { background: "#fff", color: "#0f172a", fontSize: 12, borderRadius: 12 } },
                }}
              />
            ) : (
              <div className="flex h-full items-center justify-center text-sm text-slate-500">Sem dados.</div>
            )}
          </div>
        </Card>
      </div>

      <Card className="mt-4 w-full border-slate-200 bg-white p-5">
        <div className="text-lg font-extrabold text-slate-900">SKUs vendidos</div>
        <div className="mt-1 text-xs text-slate-500">
          Comparando com: <span className="font-semibold text-slate-700">{compareLabelShort}</span>
        </div>

        <div className="mt-3 overflow-hidden rounded-xl border border-slate-200">
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-50 text-xs font-extrabold text-slate-700">
              <tr>
                <th className="px-4 py-3">
                  <button type="button" className="inline-flex items-center gap-1" onClick={() => toggleProductSort("sku")}>
                    SKU <span className="text-[10px]">{productSortIndicator(productSort, "sku")}</span>
                  </button>
                </th>
                <th className="px-4 py-3">Nome</th>
                <th className="px-4 py-3">
                  <button type="button" className="inline-flex items-center gap-1" onClick={() => toggleProductSort("revenue")}>
                    Faturamento <span className="text-[10px]">{productSortIndicator(productSort, "revenue")}</span>
                  </button>
                </th>
                <th className="px-4 py-3">
                  <button type="button" className="inline-flex items-center gap-1" onClick={() => toggleProductSort("prevRevenue")}>
                    Faturamento {compareLabelShort} <span className="text-[10px]">{productSortIndicator(productSort, "prevRevenue")}</span>
                  </button>
                </th>
                <th className="px-4 py-3">
                  <button type="button" className="inline-flex items-center gap-1" onClick={() => toggleProductSort("revenueDelta")}>
                    Variação <span className="text-[10px]">{productSortIndicator(productSort, "revenueDelta")}</span>
                  </button>
                </th>
                <th className="px-4 py-3">
                  <button type="button" className="inline-flex items-center gap-1" onClick={() => toggleProductSort("avgTicket")}>
                    Ticket médio <span className="text-[10px]">{productSortIndicator(productSort, "avgTicket")}</span>
                  </button>
                </th>
                <th className="px-4 py-3">
                  <button type="button" className="inline-flex items-center gap-1" onClick={() => toggleProductSort("prevAvgTicket")}>
                    Ticket {compareLabelShort} <span className="text-[10px]">{productSortIndicator(productSort, "prevAvgTicket")}</span>
                  </button>
                </th>
                <th className="px-4 py-3">
                  <button type="button" className="inline-flex items-center gap-1" onClick={() => toggleProductSort("ticketDelta")}>
                    Variação <span className="text-[10px]">{productSortIndicator(productSort, "ticketDelta")}</span>
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
                      {truncate50(String(r.name || r.sku || "-"))}
                    </td>
                    <td className="px-4 py-3 text-slate-700">{formatBRLNoSpace(Number(r.revenue || 0))}</td>
                    <td className="px-4 py-3 text-slate-700">{formatBRLNoSpace(Number(r.prevRevenue || 0))}</td>
                    <td className={["px-4 py-3 text-xs font-extrabold", deltaTextClass(r.revenueDelta)].join(" ")}>
                      {formatPctSigned1(r.revenueDelta)}
                    </td>
                    <td className="px-4 py-3 text-slate-700">{formatBRLNoSpace(Number(r.avgTicket || 0))}</td>
                    <td className="px-4 py-3 text-slate-700">{formatBRLNoSpace(Number(r.prevAvgTicket || 0))}</td>
                    <td className={["px-4 py-3 text-xs font-extrabold", deltaTextClass(r.ticketDelta)].join(" ")}>
                      {formatPctSigned1(r.ticketDelta)}
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

      <SlideOver open={filtersOpen} title="Filtros" onClose={() => setFiltersOpen(false)}>
        {!filters ? <div className="text-slate-600">Carregando...</div> : null}
        {filters ? (
          <div className="flex h-full flex-col">
            <div className="flex-1 space-y-4">
              <MultiSelect
                label="Status"
                options={statusOptions}
                values={status}
                onChange={setStatus}
                placeholder="Todos"
                searchPlaceholder="Buscar status..."
              />
              <MultiSelect
                label="Loja"
                options={storeOptions}
                values={stores}
                onChange={setStores}
                placeholder="Todas"
                searchPlaceholder="Buscar loja..."
              />
              <MultiSelect
                label="Canal"
                options={channelOptions}
                values={channels}
                onChange={setChannels}
                placeholder="Todos"
                searchPlaceholder="Buscar canal..."
              />
              <MultiSelect
                label="Categoria"
                options={categoryOptions}
                values={categories}
                onChange={setCategories}
                placeholder="Todas"
                searchPlaceholder="Buscar categoria..."
              />
              <MultiSelect
                label="Produto"
                options={productSelectOptions}
                values={productValues}
                onChange={setProductValues}
                placeholder="Buscar por SKU ou nome"
                searchPlaceholder="Digite para buscar..."
                onSearchChange={setProductQuery}
              />
              <MultiSelect
                label="Estado"
                options={stateOptions}
                values={states}
                onChange={setStates}
                placeholder="Todos"
                searchPlaceholder="Buscar UF..."
              />
              <MultiSelect
                label="Cidade"
                options={cityOptions}
                values={cities}
                onChange={setCities}
                placeholder="Todas"
                searchPlaceholder="Buscar cidade..."
              />
              {citiesLoading ? <div className="text-xs text-slate-600">Carregando cidades...</div> : null}
              {!citiesLoading && citiesError ? <div className="text-xs text-red-600">{citiesError}</div> : null}
            </div>

            <div className="mt-6 border-t border-slate-200 pt-4">
              <button
                type="button"
                onClick={applyFiltersToUrl}
                className="w-full rounded-xl bg-primary px-4 py-3 text-sm font-extrabold text-white hover:brightness-95"
              >
                Aplicar filtros
              </button>
            </div>
          </div>
        ) : null}
      </SlideOver>
    </div>
  );
};

export default Dashboard;
