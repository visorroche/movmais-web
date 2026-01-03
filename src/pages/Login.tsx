import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Link, useNavigate } from "react-router-dom";
import { useState } from "react";
import { login } from "@/lib/auth";
import { useToast } from "@/components/ui/use-toast";
import { Eye, EyeOff } from "lucide-react";
import logo from "@/assets/logo.svg";

const Login = () => {
  const [form, setForm] = useState({ email: "", senha: "" });
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const navigate = useNavigate();
  const { toast } = useToast();

  return (
    <div className="min-h-screen w-full flex items-center justify-center bg-gradient-to-b from-slate-900 to-secondary p-6">
      <div className="w-full max-w-md">
        <div className="mb-6 flex justify-center">
          <img src={logo} alt="MovMais" className="h-12 w-auto" />
        </div>
        <Card className="p-8 rounded-2xl shadow-2xl bg-slate-950 border-slate-800">
          <h2 className="text-3xl font-semibold text-slate-100 mb-6">Entrar</h2>
          <form
            className="flex flex-col gap-4"
            onSubmit={async (e) => {
              e.preventDefault();
              if (loading) return;
              try {
                setLoading(true);
                await login(form.email, form.senha);
                navigate("/dashboard");
              } catch {
                toast({ title: "Falha no login", description: "Verifique seu email e senha.", variant: "destructive" });
              } finally {
                setLoading(false);
              }
            }}
          >
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
              <label htmlFor="senha" className="block mb-1 font-semibold text-slate-200">
                Senha
              </label>
              <div className="relative">
                <Input
                  id="senha"
                  name="senha"
                  type={showPassword ? "text" : "password"}
                  placeholder="Sua senha"
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
            <Button type="submit" disabled={loading} variant="primary" size="lg" className="mt-2">
              {loading ? "Entrando..." : "Entrar"}
            </Button>
          </form>
          <div className="mt-4 text-center">
            <Link to="/cadastro" className="text-sm text-slate-300 hover:text-white transition-colors underline underline-offset-2">
              Não tem conta? Cadastre-se
            </Link>
          </div>
        </Card>
      </div>
    </div>
  );
};

export default Login;
