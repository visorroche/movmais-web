import { useEffect, useState } from "react";
import { getMe, logout, type UserMe } from "@/lib/auth";
import { Button } from "@/components/ui/button";

const Dashboard = () => {
  const [me, setMe] = useState<UserMe | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const ac = new AbortController();
    getMe(ac.signal)
      .then((u) => setMe(u))
      .catch(() => setError("Não foi possível carregar o usuário"));
    return () => ac.abort();
  }, []);

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 p-6">
      <div className="mx-auto max-w-3xl">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-semibold">Dashboard</h1>
          <Button
            variant="destructive"
            onClick={() => {
              logout();
              window.location.href = "/login";
            }}
          >
            Sair
          </Button>
        </div>

        <div className="mt-6 rounded-xl border border-slate-800 bg-slate-900 p-4">
          {error ? <div className="text-red-400">{error}</div> : null}
          {me ? (
            <div className="space-y-1">
              <div>
                <span className="text-slate-300">Usuário:</span> {me.name || me.email}
              </div>
              <div>
                <span className="text-slate-300">Empresa:</span> {me.company?.name || "-"}
              </div>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
};

export default Dashboard;
