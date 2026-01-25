import { useEffect, useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { buildApiUrl } from "@/lib/config";
import { getAuthHeaders, throwIfUnauthorized } from "@/lib/auth";
import { useToast } from "@/components/ui/use-toast";
import { Pencil, Trash2 } from "lucide-react";

type CompanyUserRow = {
  id: number;
  name: string;
  email: string;
  type: "admin" | "user";
  owner?: boolean;
};

const ConfigUsuarios = () => {
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [users, setUsers] = useState<CompanyUserRow[]>([]);

  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<CompanyUserRow | null>(null);
  const [saving, setSaving] = useState(false);
  const [modalError, setModalError] = useState<string | null>(null);

  const [form, setForm] = useState({
    name: "",
    email: "",
    type: "user" as "admin" | "user",
    password: "",
  });

  const load = async () => {
    setError(null);
    setLoading(true);
    try {
      const res = await fetch(buildApiUrl("/companies/me/users"), { headers: { ...getAuthHeaders() } });
      throwIfUnauthorized(res);
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error((data as any)?.message || "Erro ao carregar usuários");
      }
      const data = (await res.json()) as CompanyUserRow[];
      setUsers(Array.isArray(data) ? data : []);
    } catch (e: any) {
      setError(String(e?.message || "Erro ao carregar usuários"));
      setUsers([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const openCreate = () => {
    setModalError(null);
    setEditing(null);
    setForm({ name: "", email: "", type: "user", password: "" });
    setModalOpen(true);
  };

  const openEdit = (u: CompanyUserRow) => {
    setModalError(null);
    setEditing(u);
    setForm({ name: u.name, email: u.email, type: u.type, password: "" });
    setModalOpen(true);
  };

  const closeModal = () => {
    if (saving) return;
    setModalOpen(false);
  };

  const submit = async () => {
    setModalError(null);
    const name = form.name.trim();
    const email = form.email.trim().toLowerCase();
    if (!name) return setModalError("Nome é obrigatório.");
    if (!email) return setModalError("Email é obrigatório.");
    if (!editing && form.password.trim().length < 8) return setModalError("A senha deve ter no mínimo 8 caracteres.");
    if (editing && form.password.trim() && form.password.trim().length < 8) return setModalError("A senha deve ter no mínimo 8 caracteres.");

    try {
      setSaving(true);
      const url = editing ? buildApiUrl(`/companies/me/users/${editing.id}`) : buildApiUrl("/companies/me/users");
      const method = editing ? "PUT" : "POST";
      const body: any = { name, email, type: form.type };
      if (!editing) body.password = form.password;
      if (editing && form.password.trim()) body.password = form.password;

      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json", ...getAuthHeaders() },
        body: JSON.stringify(body),
      });
      throwIfUnauthorized(res);
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error((data as any)?.message || "Erro ao salvar usuário");
      }
      await res.json().catch(() => null);
      toast({ title: editing ? "Usuário atualizado" : "Usuário criado" });
      setModalOpen(false);
      await load();
    } catch (e: any) {
      setModalError(String(e?.message || "Erro ao salvar usuário"));
    } finally {
      setSaving(false);
    }
  };

  const removeUser = async (u: CompanyUserRow) => {
    if (u.owner) {
      toast({ title: "Ação não permitida", description: "O owner não pode ser removido da empresa.", variant: "destructive" });
      return;
    }
    const ok = window.confirm(`Remover o usuário "${u.name}" da empresa?`);
    if (!ok) return;
    try {
      const res = await fetch(buildApiUrl(`/companies/me/users/${u.id}`), {
        method: "DELETE",
        headers: { ...getAuthHeaders() },
      });
      throwIfUnauthorized(res);
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error((data as any)?.message || "Erro ao remover usuário");
      }
      toast({ title: "Usuário removido da empresa" });
      await load();
    } catch (e: any) {
      toast({ title: "Erro", description: String(e?.message || "Erro ao remover usuário"), variant: "destructive" });
    }
  };

  return (
    <div className="mx-auto max-w-5xl">
      <h1 className="text-2xl font-extrabold text-slate-900">Configurações • Usuários</h1>
      <Card className="mt-4 border-slate-200 bg-white p-6">
        <div className="flex items-center justify-between gap-4">
          <div />
          <Button type="button" variant="primary" onClick={openCreate}>
            Novo usuário
          </Button>
        </div>

        {loading ? <div className="mt-4 text-slate-700">Carregando...</div> : null}
        {!loading && error ? <div className="mt-4 text-sm text-red-600">{error}</div> : null}

        {!loading && !error ? (
          <div className="mt-4 overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="text-left text-slate-600">
                  <th className="py-2 pr-4">Nome</th>
                  <th className="py-2 pr-4">Email</th>
                  <th className="py-2 pr-4">Tipo</th>
                  <th className="py-2 pr-0 text-right">Ações</th>
                </tr>
              </thead>
              <tbody>
                {users.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="py-6 text-slate-600">
                      Nenhum usuário encontrado nesta empresa.
                    </td>
                  </tr>
                ) : (
                  users.map((u) => (
                    <tr key={u.id} className="border-t border-slate-200">
                      <td className="py-3 pr-4 font-semibold text-slate-900">
                        {u.name}{" "}
                        {u.owner ? (
                          <span className="ml-2 inline-flex items-center rounded-full bg-primary/10 px-2 py-0.5 text-xs font-extrabold text-primary">
                            owner
                          </span>
                        ) : null}
                      </td>
                      <td className="py-3 pr-4 text-slate-700">{u.email}</td>
                      <td className="py-3 pr-4 text-slate-700">{u.type}</td>
                      <td className="py-3 pr-0">
                        <div className="flex items-center justify-end gap-2">
                          <button
                            type="button"
                            onClick={() => openEdit(u)}
                            title="Editar"
                            className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-700 hover:bg-slate-50 hover:text-slate-900 transition-colors"
                          >
                            <Pencil className="h-4 w-4" />
                          </button>
                          <button
                            type="button"
                            onClick={() => removeUser(u)}
                            title={u.owner ? "Owner não pode ser removido" : "Excluir"}
                            disabled={!!u.owner}
                            className={
                              "inline-flex h-9 w-9 items-center justify-center rounded-lg border border-slate-200 bg-white transition-colors " +
                              (u.owner
                                ? "text-slate-300 cursor-not-allowed"
                                : "text-red-600 hover:bg-red-50 hover:text-red-700")
                            }
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        ) : null}
      </Card>

      {!modalOpen ? null : (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onMouseDown={closeModal}>
          <Card className="w-full max-w-lg border-slate-200 bg-white p-6" onMouseDown={(e) => e.stopPropagation()}>
            <div className="text-xl font-extrabold text-slate-900">{editing ? "Editar usuário" : "Novo usuário"}</div>
            {modalError ? <div className="mt-3 text-sm text-red-600">{modalError}</div> : null}

            <div className="mt-4 grid gap-3">
              <div>
                <label className="block mb-1 font-semibold text-slate-700">Nome</label>
                <Input
                  value={form.name}
                  onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                  className="border-slate-300 bg-white text-slate-900 placeholder:text-slate-400 focus:ring-primary/30"
                />
              </div>
              <div>
                <label className="block mb-1 font-semibold text-slate-700">Email</label>
                <Input
                  value={form.email}
                  onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
                  className="border-slate-300 bg-white text-slate-900 placeholder:text-slate-400 focus:ring-primary/30"
                />
              </div>
              <div>
                <label className="block mb-1 font-semibold text-slate-700">Tipo</label>
                <select
                  value={form.type}
                  onChange={(e) => setForm((f) => ({ ...f, type: e.target.value as any }))}
                  className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-900 outline-none focus:ring-2 focus:ring-primary/30"
                >
                  <option value="user">user</option>
                  <option value="admin">admin</option>
                </select>
              </div>
              <div>
                <label className="block mb-1 font-semibold text-slate-700">{editing ? "Nova senha (opcional)" : "Senha"}</label>
                <Input
                  type="password"
                  value={form.password}
                  onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))}
                  className="border-slate-300 bg-white text-slate-900 placeholder:text-slate-400 focus:ring-primary/30"
                />
                <div className="mt-1 text-xs text-slate-500">Mínimo de 8 caracteres.</div>
              </div>
            </div>

            <div className="mt-5 flex items-center justify-end gap-3">
              <Button type="button" variant="default" onClick={closeModal} disabled={saving}>
                Cancelar
              </Button>
              <Button type="button" variant="primary" onClick={submit} disabled={saving}>
                {saving ? "Salvando..." : "Salvar"}
              </Button>
            </div>
          </Card>
        </div>
      )}
    </div>
  );
};

export default ConfigUsuarios;


