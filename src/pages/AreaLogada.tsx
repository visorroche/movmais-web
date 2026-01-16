import { useEffect, useMemo, useState } from "react";
import { NavLink, Navigate, Outlet, useLocation } from "react-router-dom";
import { fetchMyCompanies, getActiveCompanyId, getAuthHeaders, getMe, getStoredUser, getToken, logout, setActiveCompanyId, type CompanyAccess, type UserMe } from "@/lib/auth";
import logo from "@/assets/logo.png";
import { Button } from "@/components/ui/button";
import { LayoutDashboard, Users, ClipboardList, Settings, ChevronDown, ChevronRight, LogOut, PanelLeftClose, Plus, Package, ScrollText } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { buildApiUrl } from "@/lib/config";

export type AreaLogadaOutletContext = {
  me: UserMe | null;
  meError: string | null;
};

type Company = CompanyAccess;

function getInitials(input: string): string {
  const cleaned = String(input || "").trim();
  if (!cleaned) return "?";
  const parts = cleaned.split(/\s+/).filter(Boolean);
  const first = parts[0]?.[0] || "";
  const second = parts.length > 1 ? parts[1]?.[0] || "" : "";
  return (first + second).toUpperCase();
}

function sidebarItemBase(active: boolean): string {
  return (
    "group flex items-center gap-3 rounded-xl px-3 py-2 text-sm font-semibold transition-colors " +
    (active ? "bg-primary/10 text-primary" : "text-slate-700 hover:bg-slate-100 hover:text-slate-900")
  );
}

function SidebarLink({
  to,
  icon,
  label,
  collapsed,
}: {
  to: string;
  icon: React.ReactNode;
  label: string;
  collapsed: boolean;
}) {
  return (
    <NavLink
      to={to}
      className={({ isActive }) =>
        sidebarItemBase(isActive) + (collapsed ? " justify-center px-2" : "")
      }
      title={collapsed ? label : undefined}
    >
      <span className="shrink-0">{icon}</span>
      {collapsed ? null : <span className="truncate">{label}</span>}
    </NavLink>
  );
}

const AreaLogada = () => {
  const token = getToken();
  if (!token) return <Navigate to="/login" replace />;

  const SIDEBAR_COLLAPSED_KEY = "movmais:sidebar_collapsed";
  const [collapsed, setCollapsed] = useState<boolean>(() => {
    try {
      const raw = localStorage.getItem(SIDEBAR_COLLAPSED_KEY);
      if (raw === "true") return true;
      if (raw === "false") return false;
    } catch {
      // ignore
    }
    return false;
  });
  const [configOpen, setConfigOpen] = useState(true);

  const [me, setMe] = useState<UserMe | null>(() => getStoredUser());
  const [meError, setMeError] = useState<string | null>(null);

  const [companyMe, setCompanyMe] = useState<Company | null>(null);
  const [myCompanies, setMyCompanies] = useState<Company[]>([]);
  const [activeCompanyId, setActiveCompanyIdState] = useState<number | null>(() => getActiveCompanyId());

  const [createCompanyOpen, setCreateCompanyOpen] = useState(false);
  const [createCompanyForm, setCreateCompanyForm] = useState({ name: "", site: "", grantAllUsers: true });
  const [createCompanySaving, setCreateCompanySaving] = useState(false);
  const [createCompanyError, setCreateCompanyError] = useState<string | null>(null);

  const location = useLocation();

  useEffect(() => {
    const ac = new AbortController();
    getMe(ac.signal)
      .then((u) => {
        setMe(u);
        setMeError(null);
      })
      .catch(() => setMeError("Não foi possível carregar o usuário"));
    return () => ac.abort();
  }, []);

  useEffect(() => {
    const ac = new AbortController();

    // Carrega todas as empresas do usuário (ordenadas no backend por grupo.nome, empresa.nome)
    const loadMyCompanies = async () => {
      try {
        const list = await fetchMyCompanies(ac.signal);
        setMyCompanies(list);
        const current = getActiveCompanyId();
        if (!current && list?.[0]?.id) {
          setActiveCompanyId(list[0].id);
          setActiveCompanyIdState(list[0].id);
        }
      } catch {
        setMyCompanies([]);
      }
    };

    loadMyCompanies();

    const onCompaniesChanged = () => {
      loadMyCompanies();
    };
    window.addEventListener("movmais:companies_changed", onCompaniesChanged);

    return () => {
      window.removeEventListener("movmais:companies_changed", onCompaniesChanged);
      ac.abort();
    };
  }, []);

  useEffect(() => {
    const ac = new AbortController();
    // Carrega dados da empresa ativa (respeitando X-Company-Id)
    fetch(buildApiUrl("/companies/me"), { headers: { ...getAuthHeaders() }, signal: ac.signal })
      .then(async (res) => {
        if (!res.ok) throw new Error("Erro ao carregar empresa");
        return res.json() as Promise<Company>;
      })
      .then((c) => setCompanyMe(c))
      .catch(() => setCompanyMe(null));
    return () => ac.abort();
  }, [activeCompanyId]);

  useEffect(() => {
    if (collapsed) setConfigOpen(false);
  }, [collapsed]);

  useEffect(() => {
    try {
      localStorage.setItem(SIDEBAR_COLLAPSED_KEY, collapsed ? "true" : "false");
    } catch {
      // ignore
    }
  }, [collapsed]);

  useEffect(() => {
    // Se navegar para dentro de /configuracoes, garante submenu aberto quando não estiver recolhido
    if (!collapsed && location.pathname.startsWith("/configuracoes")) setConfigOpen(true);
  }, [collapsed, location.pathname]);

  const displayName = useMemo(() => {
    const name = (me as any)?.name;
    if (name && String(name).trim()) return String(name).trim();
    return me?.email || "Usuário";
  }, [me]);

  const initials = useMemo(() => getInitials(displayName), [displayName]);

  const handleLogout = () => {
    logout();
    window.location.href = "/login";
  };

  const selectedCompany = useMemo(() => {
    const byId = activeCompanyId ? myCompanies.find((c) => c.id === activeCompanyId) : null;
    return byId || myCompanies[0] || null;
  }, [activeCompanyId, myCompanies]);

  const showCompanySwitcher = !collapsed && myCompanies.length > 0;

  const handleCompanyChange = (nextId: number) => {
    setActiveCompanyId(nextId);
    setActiveCompanyIdState(nextId);
    // Atualiza contexto e dados usando X-Company-Id
    window.location.reload();
  };

  const openCreateCompany = () => {
    setCreateCompanyError(null);
    setCreateCompanyForm({ name: "", site: "", grantAllUsers: true });
    setCreateCompanyOpen(true);
  };

  const closeCreateCompany = () => {
    if (createCompanySaving) return;
    setCreateCompanyOpen(false);
  };

  const submitCreateCompany = async () => {
    setCreateCompanyError(null);
    const name = createCompanyForm.name.trim();
    const site = createCompanyForm.site.trim();
    if (!name) return setCreateCompanyError("Nome é obrigatório.");
    if (!site) return setCreateCompanyError("Site é obrigatório.");
    try {
      setCreateCompanySaving(true);
      const res = await fetch(buildApiUrl("/companies"), {
        method: "POST",
        headers: { "Content-Type": "application/json", ...getAuthHeaders() },
        body: JSON.stringify({ name, site, grant_all_users: createCompanyForm.grantAllUsers }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error((data as any)?.message || "Erro ao criar empresa");
      }
      const created = (await res.json()) as Company;
      setActiveCompanyId(created.id);
      setActiveCompanyIdState(created.id);
      window.location.href = "/dashboard";
    } catch (e: any) {
      setCreateCompanyError(String(e?.message || "Erro ao criar empresa"));
    } finally {
      setCreateCompanySaving(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#fff8f2] flex">
      <aside
        className={
          "sticky top-0 h-screen border-r border-slate-200 bg-white shadow-sm transition-all duration-200 " +
          (collapsed ? "w-16" : "w-72")
        }
      >
        <div
          className={
            "flex items-center " +
            (collapsed ? "justify-center pl-1 pr-0" : "justify-between px-3")
          }
        >
          <button
            type="button"
            onClick={() => {
              if (collapsed) setCollapsed(false);
            }}
            title={collapsed ? "Expandir menu" : "Recolher menu"}
            className={
              "inline-flex items-center rounded-xl py-1 hover:bg-slate-100 transition-colors " +
              (collapsed ? "justify-center pl-1 pr-0" : "px-0")
            }
          >
            {/* No mobile: sem padding lateral e sem altura fixa (evita “achatar” quando a largura é limitada) */}
            <img
              src={logo}
              alt="MovMais"
              className={collapsed ? "w-14 h-auto" : "w-[100px] h-auto"}
            />
          </button>

          {/* Com o menu aberto, o ícone de recolher faz mais sentido aqui */}
          {collapsed ? null : (
            <button
              type="button"
              onClick={() => setCollapsed(true)}
              title="Recolher menu"
              className="inline-flex h-9 w-9 items-center justify-center rounded-lg text-slate-600 hover:bg-slate-100 hover:text-slate-900 transition-colors"
            >
              <PanelLeftClose className="h-5 w-5" />
            </button>
          )}
        </div>

        <nav className="px-2">
          <div className="space-y-1">
            {showCompanySwitcher ? (
              <div className="mb-2 rounded-xl border border-slate-200 bg-white p-2">
                <div className="flex items-center gap-2">
                  <select
                    className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-900 outline-none focus:ring-2 focus:ring-primary/30"
                    value={activeCompanyId ?? companyMe?.id ?? ""}
                    onChange={(e) => handleCompanyChange(Number(e.target.value))}
                  >
                    {(() => {
                      const ordered = myCompanies;
                      const groups: Array<{ label: string; items: Company[] }> = [];
                      const indexByLabel = new Map<string, number>();
                      for (const c of ordered) {
                        const label = c.group?.name ? c.group.name : "Sem grupo";
                        const idx = indexByLabel.get(label);
                        if (idx === undefined) {
                          indexByLabel.set(label, groups.length);
                          groups.push({ label, items: [c] });
                        } else {
                          groups[idx].items.push(c);
                        }
                      }
                      return groups.map((g) => (
                        <optgroup key={g.label} label={g.label.toUpperCase()}>
                          {g.items.map((c) => (
                            <option key={c.id} value={c.id}>
                              {c.name}
                            </option>
                          ))}
                        </optgroup>
                      ));
                    })()}
                  </select>
                  {selectedCompany?.group_id ? (
                    <button
                      type="button"
                      onClick={openCreateCompany}
                      title="Adicionar empresa"
                      className="inline-flex h-10 w-10 items-center justify-center rounded-lg bg-primary text-white hover:brightness-95 transition-colors"
                    >
                      <Plus className="h-5 w-5" />
                    </button>
                  ) : null}
                </div>
              </div>
            ) : null}

            <SidebarLink to="/dashboard" icon={<LayoutDashboard className="h-5 w-5" />} label="Dashboard" collapsed={collapsed} />
            <SidebarLink to="/clientes" icon={<Users className="h-5 w-5" />} label="Clientes" collapsed={collapsed} />
            <SidebarLink to="/pedidos" icon={<ClipboardList className="h-5 w-5" />} label="Pedidos" collapsed={collapsed} />
            <SidebarLink to="/produtos" icon={<Package className="h-5 w-5" />} label="Produtos" collapsed={collapsed} />
            <SidebarLink to="/logs-integracoes" icon={<ScrollText className="h-5 w-5" />} label="Log de Integrações" collapsed={collapsed} />

            {/* Configurações (submenu) */}
            {collapsed ? (
              <div className="relative group">
                <button
                  type="button"
                  className={sidebarItemBase(location.pathname.startsWith("/configuracoes")) + " justify-center px-2 w-full"}
                  title="Configurações"
                >
                  <span className="shrink-0">
                    <Settings className="h-5 w-5" />
                  </span>
                </button>

                {/* Popover no hover/focus quando menu está recolhido */}
                <div className="hidden group-hover:block group-focus-within:block absolute left-full top-0 ml-2 z-50">
                  <div className="w-52 rounded-2xl border border-slate-200 bg-white shadow-xl p-2">
                    <div className="px-2 py-1 text-xs font-extrabold text-slate-500">Configurações</div>
                    <div className="mt-1 space-y-1">
                      <NavLink
                        to="/configuracoes/usuarios"
                        className={({ isActive }) =>
                          "block rounded-xl px-3 py-2 text-sm font-semibold transition-colors " +
                          (isActive ? "bg-primary/10 text-primary" : "text-slate-700 hover:bg-slate-100 hover:text-slate-900")
                        }
                      >
                        Usuários
                      </NavLink>
                      <NavLink
                        to="/configuracoes/empresa"
                        className={({ isActive }) =>
                          "block rounded-xl px-3 py-2 text-sm font-semibold transition-colors " +
                          (isActive ? "bg-primary/10 text-primary" : "text-slate-700 hover:bg-slate-100 hover:text-slate-900")
                        }
                      >
                        Empresa
                      </NavLink>
                      <NavLink
                        to="/configuracoes/plataformas"
                        className={({ isActive }) =>
                          "block rounded-xl px-3 py-2 text-sm font-semibold transition-colors " +
                          (isActive ? "bg-primary/10 text-primary" : "text-slate-700 hover:bg-slate-100 hover:text-slate-900")
                        }
                      >
                        Plataformas
                      </NavLink>
                    </div>
                  </div>
                </div>
              </div>
            ) : (
              <>
                <button
                  type="button"
                  onClick={() => setConfigOpen((v) => !v)}
                  className={sidebarItemBase(location.pathname.startsWith("/configuracoes")) + " w-full"}
                >
                  <span className="shrink-0">
                    <Settings className="h-5 w-5" />
                  </span>
                  <span className="truncate">Configurações</span>
                  <span className="ml-auto text-slate-500">
                    {configOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                  </span>
                </button>

                {!configOpen ? null : (
                  <div className="ml-3 border-l border-slate-200 pl-3 space-y-1">
                    <NavLink
                      to="/configuracoes/usuarios"
                      className={({ isActive }) =>
                        "block rounded-lg px-3 py-2 text-sm font-semibold transition-colors " +
                        (isActive ? "bg-primary/10 text-primary" : "text-slate-700 hover:bg-slate-100 hover:text-slate-900")
                      }
                    >
                      Usuários
                    </NavLink>
                    <NavLink
                      to="/configuracoes/empresa"
                      className={({ isActive }) =>
                        "block rounded-lg px-3 py-2 text-sm font-semibold transition-colors " +
                        (isActive ? "bg-primary/10 text-primary" : "text-slate-700 hover:bg-slate-100 hover:text-slate-900")
                      }
                    >
                      Empresa
                    </NavLink>
                    <NavLink
                      to="/configuracoes/plataformas"
                      className={({ isActive }) =>
                        "block rounded-lg px-3 py-2 text-sm font-semibold transition-colors " +
                        (isActive ? "bg-primary/10 text-primary" : "text-slate-700 hover:bg-slate-100 hover:text-slate-900")
                      }
                    >
                      Plataformas
                    </NavLink>
                  </div>
                )}
              </>
            )}
          </div>
        </nav>

        <div className={"absolute bottom-0 left-0 right-0 border-t border-slate-200 p-3 " + (collapsed ? "px-2" : "")}>
          {collapsed ? (
            <Button type="button" variant="destructive" className="h-10 w-full px-0" onClick={handleLogout} title="Sair">
              <LogOut className="h-5 w-5" />
            </Button>
          ) : (
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-full bg-primary/10 text-primary flex items-center justify-center font-extrabold">
                {initials}
              </div>
              <div className="min-w-0 flex-1">
                <div className="text-sm font-bold text-slate-900 truncate">{displayName}</div>
                <div className="text-xs text-slate-600 truncate">{me?.email || "-"}</div>
                {meError ? <div className="text-xs text-red-600 mt-1">{meError}</div> : null}
              </div>
              <Button type="button" variant="destructive" className="h-10" onClick={handleLogout} title="Sair">
                Sair
              </Button>
            </div>
          )}
        </div>
      </aside>

      <main className="flex-1 p-6">
        <Outlet context={{ me, meError } satisfies AreaLogadaOutletContext} />
      </main>

      {/* Modal criar empresa */}
      {!createCompanyOpen ? null : (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onMouseDown={closeCreateCompany}>
          <Card
            className="w-full max-w-lg border-slate-200 bg-white p-6"
            onMouseDown={(e) => e.stopPropagation()}
          >
            <div className="text-xl font-extrabold text-slate-900">Nova empresa</div>
            {selectedCompany?.group_id ? (
              <div className="mt-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm">
                <div className="text-slate-600">
                  Criando no grupo:
                  <span className="ml-2 font-extrabold text-slate-900">
                    {selectedCompany.group?.name || `#${selectedCompany.group_id}`}
                  </span>
                </div>
              </div>
            ) : (
              <div className="mt-1 text-sm text-slate-700">Sua empresa atual não possui grupo.</div>
            )}

            {createCompanyError ? <div className="mt-3 text-sm text-red-600">{createCompanyError}</div> : null}

            <div className="mt-4 grid gap-3">
              <div>
                <label className="block mb-1 font-semibold text-slate-700">Nome</label>
                <Input
                  value={createCompanyForm.name}
                  onChange={(e) => setCreateCompanyForm((f) => ({ ...f, name: e.target.value }))}
                  placeholder="Nome da empresa"
                  className="border-slate-300 bg-white text-slate-900 placeholder:text-slate-400 focus:ring-primary/30"
                />
              </div>
              <div>
                <label className="block mb-1 font-semibold text-slate-700">Site</label>
                <Input
                  value={createCompanyForm.site}
                  onChange={(e) => setCreateCompanyForm((f) => ({ ...f, site: e.target.value }))}
                  placeholder="caputino.com.br"
                  className="border-slate-300 bg-white text-slate-900 placeholder:text-slate-400 focus:ring-primary/30"
                />
              </div>

              <label className="flex items-center gap-2 text-sm font-semibold text-slate-700">
                <input
                  type="checkbox"
                  checked={createCompanyForm.grantAllUsers}
                  onChange={(e) => setCreateCompanyForm((f) => ({ ...f, grantAllUsers: e.target.checked }))}
                />
                Dar acesso a todos os usuários da empresa{" "}
                <span className="font-extrabold text-slate-900">{selectedCompany?.name || "atual"}</span>
              </label>
            </div>

            <div className="mt-5 flex items-center justify-end gap-3">
              <Button type="button" variant="default" onClick={closeCreateCompany} disabled={createCompanySaving}>
                Cancelar
              </Button>
              <Button type="button" variant="primary" onClick={submitCreateCompany} disabled={createCompanySaving}>
                {createCompanySaving ? "Criando..." : "Salvar"}
              </Button>
            </div>
          </Card>
        </div>
      )}
    </div>
  );
};

export default AreaLogada;
