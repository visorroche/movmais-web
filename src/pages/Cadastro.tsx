import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Link, useNavigate } from "react-router-dom";
import { useState } from "react";
import { login } from "@/lib/auth";
import { buildApiUrl } from "@/lib/config";
import { Eye, EyeOff } from "lucide-react";
import logo from "@/assets/logo.svg";

const Cadastro = () => {
  const navigate = useNavigate();
  const [form, setForm] = useState({ empresa: "", nome: "", email: "", celular: "", senha: "" });
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  const formatCelular = (value: string) => {
    const digits = value.replace(/\D/g, "").slice(0, 11);
    if (digits.length === 0) return "";
    if (digits.length <= 2) return `(${digits}`;
    if (digits.length <= 7) return `(${digits.slice(0, 2)}) ${digits.slice(2)}`;
    return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`;
  };

  const handleCelularChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const raw = e.target.value;
    const digits = raw.replace(/\D/g, "").slice(0, 11);
    setForm((f) => ({ ...f, celular: formatCelular(digits) }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const empresa = form.empresa.trim();
    const email = form.email.trim().toLowerCase();
    const senha = form.senha;
    const celularDigits = form.celular.replace(/\D/g, "");

    if (!empresa) {
      setError("O nome da empresa é obrigatório.");
      return;
    }
    if (senha.length < 8) {
      setError("A senha deve ter no mínimo 8 caracteres.");
      return;
    }
    if (celularDigits.length !== 11) {
      setError("O celular deve ter 11 dígitos (incluindo DDD).");
      return;
    }

    try {
      setLoading(true);
      const resp = await fetch(buildApiUrl("/users/register"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email,
          password: senha,
          name: form.nome,
          phone: celularDigits,
          company_name: empresa,
        }),
      });

      if (resp.status === 409) {
        setError("Este email já está cadastrado.");
        return;
      }

      if (!resp.ok) {
        const data = await resp.json().catch(() => ({}));
        setError((data as any)?.message || "Erro ao cadastrar. Tente novamente.");
        return;
      }

      try {
        await login(email, senha);
      } catch {
        setError("Cadastro realizado, mas houve erro ao fazer login. Faça login manualmente.");
        return;
      }

      navigate("/dashboard");
    } catch {
      setError("Falha de conexão. Tente novamente.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen w-full flex items-center justify-center bg-gradient-to-b from-slate-900 to-secondary p-6">
      <div className="w-full max-w-md">
        <div className="mb-6 flex justify-center">
          <img src={logo} alt="MovMais" className="h-12 w-auto" />
        </div>
        <Card className="p-8 rounded-2xl shadow-2xl bg-slate-950 border-slate-800">
          <h2 className="text-3xl font-semibold text-slate-100 mb-6">Cadastro</h2>
          <form className="flex flex-col gap-4" onSubmit={handleSubmit}>
            <div>
              <label htmlFor="empresa" className="block mb-1 font-semibold text-slate-200">
                Nome da empresa
              </label>
              <Input
                id="empresa"
                name="empresa"
                placeholder="Nome da sua empresa"
                value={form.empresa}
                onChange={(e) => setForm((f) => ({ ...f, empresa: e.target.value }))}
                required
              />
            </div>
            <div>
              <label htmlFor="nome" className="block mb-1 font-semibold text-slate-200">
                Nome
              </label>
              <Input
                id="nome"
                name="nome"
                placeholder="Seu nome"
                value={form.nome}
                onChange={(e) => setForm((f) => ({ ...f, nome: e.target.value }))}
                required
              />
            </div>
            <div>
              <label htmlFor="email" className="block mb-1 font-semibold text-slate-200">
                Email
              </label>
              <Input
                id="email"
                name="email"
                type="email"
                placeholder="Seu email"
                value={form.email}
                onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
                required
              />
            </div>
            <div>
              <label htmlFor="celular" className="block mb-1 font-semibold text-slate-200">
                Celular
              </label>
              <Input
                id="celular"
                name="celular"
                inputMode="numeric"
                placeholder="(99) 99999-9999"
                value={form.celular}
                onChange={handleCelularChange}
                required
              />
            </div>
            <div>
              <label htmlFor="senha" className="block mb-1 font-semibold text-slate-200">
                Senha
              </label>
              <div className="relative">
                <Input
                  id="senha"
                  name="senha"
                  type={showPassword ? "text" : "password"}
                  placeholder="Crie uma senha"
                  value={form.senha}
                  onChange={(e) => setForm((f) => ({ ...f, senha: e.target.value }))}
                  required
                  className="pr-10"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  aria-label={showPassword ? "Ocultar senha" : "Mostrar senha"}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-300 hover:text-slate-100 transition-colors"
                >
                  {showPassword ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
                </button>
              </div>
            </div>

            {error ? <p className="text-red-600 text-sm">{error}</p> : null}

            <Button disabled={loading} type="submit" variant="primary" size="lg" className="mt-2">
              {loading ? "Cadastrando..." : "Cadastrar"}
            </Button>

            <div className="mt-2 text-center">
              <Link to="/login" className="text-sm text-slate-300 hover:text-white transition-colors underline underline-offset-2">
                Já possuo conta, fazer login
              </Link>
            </div>
          </form>
        </Card>
      </div>
    </div>
  );
};

export default Cadastro;
