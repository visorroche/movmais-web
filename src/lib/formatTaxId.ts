export function formatTaxIdBR(value: string | null | undefined): string {
  const raw = String(value ?? "").trim();
  if (!raw) return "-";
  const digits = raw.replace(/\D/g, "");
  // CPF: 11 dígitos => 000.000.000-00
  if (digits.length === 11) {
    return `${digits.slice(0, 3)}.${digits.slice(3, 6)}.${digits.slice(6, 9)}-${digits.slice(9, 11)}`;
  }
  // CNPJ: 14 dígitos => 00.000.000/0000-00
  if (digits.length === 14) {
    return `${digits.slice(0, 2)}.${digits.slice(2, 5)}.${digits.slice(5, 8)}/${digits.slice(8, 12)}-${digits.slice(12, 14)}`;
  }
  return raw;
}

