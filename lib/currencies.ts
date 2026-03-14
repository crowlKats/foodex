export const CURRENCIES = [
  { code: "EUR", symbol: "\u20AC", name: "Euro" },
  { code: "USD", symbol: "$", name: "US Dollar" },
  { code: "GBP", symbol: "\u00A3", name: "British Pound" },
  { code: "CHF", symbol: "CHF", name: "Swiss Franc" },
  { code: "CAD", symbol: "CA$", name: "Canadian Dollar" },
  { code: "AUD", symbol: "A$", name: "Australian Dollar" },
  { code: "JPY", symbol: "\u00A5", name: "Japanese Yen" },
  { code: "SEK", symbol: "kr", name: "Swedish Krona" },
  { code: "NOK", symbol: "kr", name: "Norwegian Krone" },
  { code: "DKK", symbol: "kr", name: "Danish Krone" },
  { code: "PLN", symbol: "z\u0142", name: "Polish Zloty" },
  { code: "CZK", symbol: "K\u010D", name: "Czech Koruna" },
  { code: "HUF", symbol: "Ft", name: "Hungarian Forint" },
  { code: "TRY", symbol: "\u20BA", name: "Turkish Lira" },
  { code: "BRL", symbol: "R$", name: "Brazilian Real" },
  { code: "MXN", symbol: "MX$", name: "Mexican Peso" },
  { code: "INR", symbol: "\u20B9", name: "Indian Rupee" },
  { code: "CNY", symbol: "\u00A5", name: "Chinese Yuan" },
  { code: "KRW", symbol: "\u20A9", name: "South Korean Won" },
  { code: "NZD", symbol: "NZ$", name: "New Zealand Dollar" },
] as const;

export function getCurrencySymbol(code: string): string {
  return CURRENCIES.find((c) => c.code === code)?.symbol ?? code;
}
