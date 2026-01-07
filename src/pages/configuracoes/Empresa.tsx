import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { buildApiUrl } from "@/lib/config";
import { ensureDefaultCompanySelected, fetchMyCompanies, getActiveCompanyId, getAuthHeaders, type CompanyAccess } from "@/lib/auth";
import { useEffect, useState } from "react";
import { useToast } from "@/components/ui/use-toast";

type CompanyMe = {
  id: number;
  name: string;
  site: string;
  group_id?: number | null;
};

type Group = {
  id: number;
  name: string;
};

const ConfigEmpresa = () => {
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [company, setCompany] = useState<CompanyMe | null>(null);

  const [form, setForm] = useState({ name: "", site: "" });

  const [group, setGroup] = useState<Group | null>(null);
  const [groupUiOpen, setGroupUiOpen] = useState(false);
  const [groupCreating, setGroupCreating] = useState(false);
  const [groupSaving, setGroupSaving] = useState(false);
  const [groupNameDraft, setGroupNameDraft] = useState("");

  useEffect(() => {
    const ac = new AbortController();
    setLoading(true);
    setError(null);

    (async () => {
      try {
        // Garante que existe uma empresa ativa no localStorage (primeira do primeiro grupo por ordem do backend)
        await ensureDefaultCompanySelected(ac.signal);

        const companies = await fetchMyCompanies(ac.signal);
        const activeId = getActiveCompanyId();
        const selected =
          (activeId ? companies.find((c) => c.id === activeId) : null) || companies[0] || null;

        if (!selected) {
          setCompany(null);
          setGroup(null);
          setGroupNameDraft("");
          setError("Nenhuma empresa encontrada para este usuário.");
          return;
        }

        // Usa a empresa selecionada (localStorage) como fonte inicial do formulário
        const c: CompanyMe = {
          id: selected.id,
          name: selected.name,
          site: selected.site,
          group_id: (selected as CompanyAccess).group_id ?? null,
        };

        setCompany(c);
        setForm({ name: c.name ?? "", site: c.site ?? "" });

        if (c.group_id) {
          const resp = await fetch(buildApiUrl(`/groups/${c.group_id}`), {
            headers: { ...getAuthHeaders() },
            signal: ac.signal,
          });
          if (resp.ok) {
            const g = (await resp.json()) as Group;
            setGroup(g);
            setGroupNameDraft(g.name ?? "");
          } else {
            setGroup(null);
            setGroupNameDraft("");
          }
        } else {
          setGroup(null);
          setGroupNameDraft("");
        }
      } catch (e: any) {
        setError(String(e?.message || "Erro ao carregar empresa"));
      } finally {
        setLoading(false);
      }
    })();

    return () => ac.abort();
  }, []);

  const canSave = form.name.trim().length > 0 && form.site.trim().length > 0 && !saving;

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    const name = form.name.trim();
    const site = form.site.trim();

    if (!name) return setError("O nome da empresa é obrigatório.");
    if (!site) return setError("O site da empresa é obrigatório.");

    try {
      setSaving(true);
      const res = await fetch(buildApiUrl("/companies/me"), {
        method: "PUT",
        headers: { "Content-Type": "application/json", ...getAuthHeaders() },
        body: JSON.stringify({ name, site }),
      });
      if (res.status === 401) throw new Error("Não autenticado");
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error((data as any)?.message || "Erro ao salvar empresa");
      }
      const updated = (await res.json()) as CompanyMe;
      setCompany(updated);
      setForm({
        name: updated?.name ?? name,
        site: updated?.site ?? site,
      });
      toast({ title: "Empresa atualizada", description: "As informações foram salvas com sucesso." });
    } catch (e: any) {
      setError(String(e?.message || "Erro ao salvar empresa"));
    } finally {
      setSaving(false);
    }
  }

  async function handleCreateGroup() {
    setError(null);
    const name = groupNameDraft.trim();
    if (!name) return setError("O nome do grupo é obrigatório.");
    try {
      setGroupSaving(true);
      const res = await fetch(buildApiUrl("/groups"), {
        method: "POST",
        headers: { "Content-Type": "application/json", ...getAuthHeaders() },
        body: JSON.stringify({ name }),
      });
      if (res.status === 401) throw new Error("Não autenticado");
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error((data as any)?.message || "Erro ao criar grupo");
      }
      const created = (await res.json()) as Group;

      const link = await fetch(buildApiUrl("/companies/me"), {
        method: "PUT",
        headers: { "Content-Type": "application/json", ...getAuthHeaders() },
        body: JSON.stringify({ group_id: created.id }),
      });
      if (!link.ok) {
        const data = await link.json().catch(() => ({}));
        throw new Error((data as any)?.message || "Grupo criado, mas falhou ao vincular na empresa");
      }
      const updatedCompany = (await link.json()) as CompanyMe;

      setCompany(updatedCompany);
      setGroup(created);
      setGroupNameDraft(created.name ?? name);
      setGroupCreating(false);
      setGroupUiOpen(true);
      toast({ title: "Grupo criado", description: "Grupo criado e vinculado à empresa com sucesso." });

      // Atualiza menu lateral / dados sem recarregar a página inteira
      window.dispatchEvent(new Event("movmais:companies_changed"));
    } catch (e: any) {
      setError(String(e?.message || "Erro ao criar grupo"));
    } finally {
      setGroupSaving(false);
    }
  }

  async function handleSaveGroupName() {
    if (!group?.id) return;
    setError(null);
    const name = groupNameDraft.trim();
    if (!name) return setError("O nome do grupo é obrigatório.");
    try {
      setGroupSaving(true);
      const res = await fetch(buildApiUrl(`/groups/${group.id}`), {
        method: "PUT",
        headers: { "Content-Type": "application/json", ...getAuthHeaders() },
        body: JSON.stringify({ name }),
      });
      if (res.status === 401) throw new Error("Não autenticado");
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error((data as any)?.message || "Erro ao salvar grupo");
      }
      const updated = (await res.json()) as Group;
      setGroup(updated);
      toast({ title: "Grupo atualizado", description: "Nome do grupo salvo com sucesso." });
    } catch (e: any) {
      setError(String(e?.message || "Erro ao salvar grupo"));
    } finally {
      setGroupSaving(false);
    }
  }

  return (
    <div className="mx-auto max-w-5xl">
      <h1 className="text-2xl font-extrabold text-slate-900">Configurações • Empresa</h1>
      <Card className="mt-4 border-slate-200 bg-white p-6">
        {loading ? <div className="text-slate-700">Carregando...</div> : null}
        {!loading && error ? <div className="text-red-600 text-sm mb-4">{error}</div> : null}

        {!loading && company ? (
          <div className="grid grid-cols-1 gap-8">
            <form className="grid grid-cols-1 gap-4 max-w-xl" onSubmit={handleSave}>
            <div>
              <label htmlFor="name" className="block mb-1 font-semibold text-slate-700">
                Nome
              </label>
              <Input
                id="name"
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                placeholder="Nome da empresa"
                required
                className="border-slate-300 bg-white text-slate-900 placeholder:text-slate-400 focus:ring-primary/30"
              />
            </div>

            <div>
              <label htmlFor="site" className="block mb-1 font-semibold text-slate-700">
                Site
              </label>
              <Input
                id="site"
                value={form.site}
                onChange={(e) => setForm((f) => ({ ...f, site: e.target.value }))}
                placeholder="caputino.com.br"
                required
                className="border-slate-300 bg-white text-slate-900 placeholder:text-slate-400 focus:ring-primary/30"
              />
            </div>

            <div className="flex items-center gap-3 pt-2">
              <Button type="submit" variant="primary" disabled={!canSave}>
                {saving ? "Salvando..." : "Salvar"}
              </Button>
            </div>
            </form>

            <div className="max-w-xl">
              <div className="text-lg font-extrabold text-slate-900">Grupo</div>

              {!company.group_id ? (
                <div className="mt-4">
                  {!groupCreating ? (
                    <Button type="button" variant="primary" onClick={() => { setGroupCreating(true); setGroupNameDraft(""); }}>
                      Criar Grupo
                    </Button>
                  ) : (
                    <div className="mt-3 grid grid-cols-1 gap-3">
                      <Input
                        value={groupNameDraft}
                        onChange={(e) => setGroupNameDraft(e.target.value)}
                        placeholder="Nome do grupo"
                        className="border-slate-300 bg-white text-slate-900 placeholder:text-slate-400 focus:ring-primary/30"
                      />
                      <div className="flex items-center gap-3">
                        <Button type="button" variant="primary" disabled={groupSaving} onClick={handleCreateGroup}>
                          {groupSaving ? "Salvando..." : "Salvar"}
                        </Button>
                        <Button type="button" variant="default" onClick={() => setGroupCreating(false)}>
                          Cancelar
                        </Button>
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                <div className="mt-4">
                  <div className="text-sm font-semibold text-slate-700">
                    Nome do grupo: <span className="text-slate-900">{group?.name || groupNameDraft || `#${company.group_id}`}</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => setGroupUiOpen((v) => !v)}
                    className="text-sm font-semibold text-slate-700 hover:text-slate-900 underline underline-offset-2"
                  >
                    {groupUiOpen ? "Ocultar" : "Editar"} grupo
                  </button>

                  {!groupUiOpen ? null : (
                    <div className="mt-3 grid grid-cols-1 gap-3">
                      <Input
                        value={groupNameDraft}
                        onChange={(e) => setGroupNameDraft(e.target.value)}
                        placeholder="Nome do grupo"
                        className="border-slate-300 bg-white text-slate-900 placeholder:text-slate-400 focus:ring-primary/30"
                      />
                      <div className="flex items-center gap-3">
                        <Button type="button" variant="primary" disabled={groupSaving} onClick={handleSaveGroupName}>
                          {groupSaving ? "Salvando..." : "Salvar"}
                        </Button>
                        <div className="text-xs text-slate-500">ID do grupo: {company.group_id}</div>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        ) : null}
      </Card>
    </div>
  );
};

export default ConfigEmpresa;


