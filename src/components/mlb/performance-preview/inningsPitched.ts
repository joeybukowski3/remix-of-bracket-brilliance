/** Converts an MLB-style innings-pitched string ("6.1" = 6 and 1/3 innings, "6.2" = 6 and 2/3) to a true decimal. */
export function inningsPitchedToDecimal(ipString: string | null | undefined): number | null {
  if (ipString == null) return null;
  const [wholeStr, fracStr = "0"] = String(ipString).split(".");
  const whole = Number(wholeStr);
  const frac = Number(fracStr);
  if (!Number.isFinite(whole) || !Number.isFinite(frac)) return null;
  const outs = whole * 3 + frac;
  return Number((outs / 3).toFixed(2));
}
