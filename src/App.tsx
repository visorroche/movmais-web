import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import Login from "@/pages/Login";
import Cadastro from "@/pages/Cadastro";
import AreaLogada from "@/pages/AreaLogada";
import Dashboard from "@/pages/Dashboard";
import DashboardAoVivo from "@/pages/dashboard/AoVivo";
import DashboardMes from "@/pages/dashboard/Mes";
import DashboardItens from "@/pages/dashboard/Itens";
import DashboardSimulacoes from "@/pages/dashboard/Simulacoes";
import DashboardOperacao from "@/pages/dashboard/Operacao";
import Clientes from "@/pages/Clientes";
import Pedidos from "@/pages/Pedidos";
import Produtos from "@/pages/Produtos";
import LogIntegracoes from "@/pages/LogIntegracoes";
import ConfigUsuarios from "@/pages/configuracoes/Usuarios";
import ConfigEmpresa from "@/pages/configuracoes/Empresa";
import ConfigPlataformas from "@/pages/configuracoes/Plataformas";
import NotFound from "@/pages/NotFound";
import { Toaster } from "@/components/ui/toaster";

const App = () => {
  return (
    <>
      <Toaster />
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<Navigate to="/login" replace />} />
          <Route path="/login" element={<Login />} />
          <Route path="/cadastro" element={<Cadastro />} />
          <Route element={<AreaLogada />}>
            <Route path="/dashboard" element={<Dashboard />} />
            <Route path="/dashboard/ao-vivo" element={<DashboardAoVivo />} />
            <Route path="/dashboard/mes" element={<DashboardMes />} />
            <Route path="/dashboard/itens" element={<DashboardItens />} />
            <Route path="/dashboard/simulacoes" element={<DashboardSimulacoes />} />
            <Route path="/dashboard/operacao" element={<DashboardOperacao />} />
            <Route path="/clientes" element={<Clientes />} />
            <Route path="/pedidos" element={<Pedidos />} />
            <Route path="/produtos" element={<Produtos />} />
            <Route path="/logs-integracoes" element={<LogIntegracoes />} />
            <Route path="/configuracoes/usuarios" element={<ConfigUsuarios />} />
            <Route path="/configuracoes/empresa" element={<ConfigEmpresa />} />
            <Route path="/configuracoes/plataformas" element={<ConfigPlataformas />} />
          </Route>
          <Route path="*" element={<NotFound />} />
        </Routes>
      </BrowserRouter>
    </>
  );
};

export default App;
