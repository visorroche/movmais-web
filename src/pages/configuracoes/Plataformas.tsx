import { useEffect, useMemo, useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { buildApiUrl } from "@/lib/config";
import { getAuthHeaders } from "@/lib/auth";
import { Input } from "@/components/ui/input";
import { Eye, EyeOff, Plus, Wrench } from "lucide-react";

const ConfigPlataformas = () => {
  type PlatformParameter = {
    name: string;
    label: string;
    required: boolean;
    description?: string;
    type?: "text" | "password" | "hidden";
  };

  type Platform = {
    id: number;
    type: string;
    slug: string;
    name: string;
    parameters: PlatformParameter[];
  };

  type CompanyPlatform = {
    id: number;
    platform_id: number;
    config: Record<string, any>;
    platform: Platform | null;
  };

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [platforms, setPlatforms] = useState<Platform[]>([]);
  const [companyPlatforms, setCompanyPlatforms] = useState<CompanyPlatform[]>([]);

  const [modalOpen, setModalOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [modalError, setModalError] = useState<string | null>(null);
  const [selectedPlatformId, setSelectedPlatformId] = useState<number | null>(null);
  const [values, setValues] = useState<Record<string, string>>({});
  const [showPassword, setShowPassword] = useState<Record<string, boolean>>({});
  const [mode, setMode] = useState<"add" | "edit">("add");

  const selectedPlatform = useMemo(
    () => platforms.find((p) => p.id === selectedPlatformId) || null,
    [platforms, selectedPlatformId],
  );

  const configuredPlatformIds = useMemo(() => new Set(companyPlatforms.map((cp) => cp.platform_id)), [companyPlatforms]);
  const availablePlatforms = useMemo(
    () => platforms.filter((p) => !configuredPlatformIds.has(p.id)),
    [platforms, configuredPlatformIds],
  );

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const [pRes, cpRes] = await Promise.all([
        fetch(buildApiUrl("/platforms"), { headers: { ...getAuthHeaders() } }),
        fetch(buildApiUrl("/companies/me/platforms"), { headers: { ...getAuthHeaders() } }),
      ]);

      if (!pRes.ok) throw new Error("Erro ao carregar plataformas");
      if (!cpRes.ok) throw new Error("Erro ao carregar integrações da empresa");

      const pData = (await pRes.json()) as Platform[];
      const cpData = (await cpRes.json()) as CompanyPlatform[];

      setPlatforms(Array.isArray(pData) ? pData : []);
      setCompanyPlatforms(Array.isArray(cpData) ? cpData : []);
    } catch (e: any) {
      setError(String(e?.message || "Erro ao carregar"));
      setPlatforms([]);
      setCompanyPlatforms([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const openAdd = () => {
    setModalError(null);
    setMode("add");
    setSelectedPlatformId(availablePlatforms[0]?.id ?? null);
    setValues({});
    setShowPassword({});
    setModalOpen(true);
  };

  const openEdit = (cp: CompanyPlatform) => {
    setModalError(null);
    setMode("edit");
    setSelectedPlatformId(cp.platform_id);
    const cfg = (cp.config || {}) as Record<string, any>;
    const initial: Record<string, string> = {};
    Object.entries(cfg).forEach(([k, v]) => (initial[k] = v == null ? "" : String(v)));
    setValues(initial);
    setShowPassword({});
    setModalOpen(true);
  };

  const closeModal = () => {
    if (saving) return;
    setModalOpen(false);
  };

  const submit = async () => {
    setModalError(null);
    if (!selectedPlatform) return setModalError("Selecione uma plataforma.");

    const params = Array.isArray(selectedPlatform.parameters) ? selectedPlatform.parameters : [];
    for (const p of params) {
      if (p.type === "hidden") continue;
      if (p.required && !String(values[p.name] ?? "").trim()) {
        return setModalError(`O campo "${p.label || p.name}" é obrigatório.`);
      }
    }

    const config: Record<string, any> = {};
    for (const p of params) {
      const v = String(values[p.name] ?? "").trim();
      if (v !== "") config[p.name] = v;
    }

    try {
      setSaving(true);
      const res = await fetch(buildApiUrl(`/companies/me/platforms/${selectedPlatform.id}`), {
        method: "PUT",
        headers: { "Content-Type": "application/json", ...getAuthHeaders() },
        body: JSON.stringify({ config }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error((data as any)?.message || "Erro ao salvar plataforma");
      }
      setModalOpen(false);
      await load();
    } catch (e: any) {
      setModalError(String(e?.message || "Erro ao salvar"));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="mx-auto max-w-5xl">
      <h1 className="text-2xl font-extrabold text-slate-900">Configurações • Plataformas</h1>
      <Card className="mt-4 border-slate-200 bg-white p-6">
        <div className="flex items-center justify-between gap-4">
          <div className="text-sm text-slate-700">Integrações da empresa selecionada.</div>
          <Button type="button" variant="primary" onClick={openAdd}>
            <span className="inline-flex items-center gap-2">
              <Plus className="h-4 w-4" /> Adicionar plataforma
            </span>
          </Button>
        </div>

        {loading ? <div className="mt-4 text-slate-700">Carregando...</div> : null}
        {!loading && error ? <div className="mt-4 text-sm text-red-600">{error}</div> : null}

        {!loading && !error ? (
          <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {companyPlatforms.length === 0 ? (
              <div className="text-slate-600">Nenhuma plataforma configurada ainda.</div>
            ) : (
              companyPlatforms.map((cp) => (
                <button
                  key={cp.id}
                  type="button"
                  onClick={() => openEdit(cp)}
                  className="text-left rounded-2xl border border-slate-200 bg-white p-4 hover:bg-slate-50 transition-colors"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="font-extrabold text-slate-900 truncate">{cp.platform?.name || `Plataforma #${cp.platform_id}`}</div>
                      <div className="text-xs text-slate-600 truncate">{cp.platform?.slug || ""}</div>
                    </div>
                    <Wrench className="h-5 w-5 text-slate-500 shrink-0" />
                  </div>
                  <div className="mt-3 text-sm text-slate-700">
                    Clique para editar a configuração
                  </div>
                </button>
              ))
            )}
          </div>
        ) : null}
      </Card>

      {!modalOpen ? null : (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onMouseDown={closeModal}>
          <Card className="w-full max-w-lg border-slate-200 bg-white p-6" onMouseDown={(e) => e.stopPropagation()}>
            <div className="text-xl font-extrabold text-slate-900">Configurar plataforma</div>
            {modalError ? <div className="mt-3 text-sm text-red-600">{modalError}</div> : null}

            <div className="mt-4 grid gap-3">
              <div>
                <label className="block mb-1 font-semibold text-slate-700">Plataforma</label>
                <select
                  value={selectedPlatformId ?? ""}
                  onChange={
                    mode === "edit"
                      ? undefined
                      : (e) => {
                          const id = Number(e.target.value);
                          setSelectedPlatformId(Number.isInteger(id) && id > 0 ? id : null);
                          setValues({});
                          setShowPassword({});
                        }
                  }
                  disabled={mode === "edit"}
                  className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-900 outline-none focus:ring-2 focus:ring-primary/30"
                >
                  <option value="">Selecione…</option>
                  {(mode === "edit" ? platforms : availablePlatforms).map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
                {mode === "add" && availablePlatforms.length === 0 ? (
                  <div className="mt-2 text-sm text-slate-600">
                    Todas as plataformas já estão configuradas para esta empresa.
                  </div>
                ) : null}
              </div>

              {selectedPlatform ? (
                <div className="grid gap-3">
                  {Array.isArray(selectedPlatform.parameters) && selectedPlatform.parameters.length > 0 ? (
                    selectedPlatform.parameters.map((param) => {
                      if (param.type === "hidden") return null;
                      return (
                      <div key={param.name} className={param.type === "password" ? "relative" : undefined}>
                        <div className="flex items-center gap-2">
                          <label className="block mb-1 font-semibold text-slate-700">
                            {param.label || param.name}
                            {param.required ? <span className="text-red-600"> *</span> : null}
                          </label>
                          {param.description ? (
                            <div className="relative group mb-1">
                              <span className="inline-flex h-5 w-5 items-center justify-center rounded-full border border-slate-300 text-xs font-extrabold text-slate-600">
                                ?
                              </span>
                              <div className="hidden group-hover:block absolute left-1/2 top-full mt-2 -translate-x-1/2 z-50">
                                <div className="w-64 rounded-xl border border-slate-200 bg-white shadow-xl p-3 text-xs text-slate-700">
                                  {param.description}
                                </div>
                              </div>
                            </div>
                          ) : null}
                        </div>
                        <Input
                          value={values[param.name] ?? ""}
                          onChange={(e) => setValues((v) => ({ ...v, [param.name]: e.target.value }))}
                          type={param.type === "password" ? (showPassword[param.name] ? "text" : "password") : "text"}
                          className={
                            "border-slate-300 bg-white text-slate-900 placeholder:text-slate-400 focus:ring-primary/30 " +
                            (param.type === "password" ? "pr-10" : "")
                          }
                        />
                        {param.type === "password" ? (
                          <button
                            type="button"
                            onClick={() => setShowPassword((s) => ({ ...s, [param.name]: !s[param.name] }))}
                            aria-label={showPassword[param.name] ? "Ocultar" : "Mostrar"}
                            className="absolute right-3 mt-[-34px] h-8 w-8 inline-flex items-center justify-center text-slate-500 hover:text-slate-900"
                          >
                            {showPassword[param.name] ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                          </button>
                        ) : null}
                      </div>
                      );
                    })
                  ) : (
                    <div className="text-sm text-slate-600">Esta plataforma não possui parâmetros configuráveis.</div>
                  )}
                </div>
              ) : null}
            </div>

            <div className="mt-5 flex items-center justify-end gap-3">
              <Button type="button" variant="default" onClick={closeModal} disabled={saving}>
                Cancelar
              </Button>
              <Button
                type="button"
                variant="primary"
                onClick={submit}
                disabled={saving || !selectedPlatform || (mode === "add" && availablePlatforms.length === 0)}
              >
                {saving ? "Salvando..." : "Salvar"}
              </Button>
            </div>
          </Card>
        </div>
      )}
    </div>
  );
};

export default ConfigPlataformas;


