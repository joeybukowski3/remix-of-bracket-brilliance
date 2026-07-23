function finiteNumber(value) {
  if (value === null || value === undefined || value === "") return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

export function mlbInningsToOuts(value) {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value === "number" && value < 0) return null;
  if (typeof value === "string" && value.trim().startsWith("-")) return null;

  const text = String(value).trim();
  if (!/^\d+(?:\.[0-2])?$/.test(text)) return null;

  const [wholeText, partialText = "0"] = text.split(".");
  const whole = finiteNumber(wholeText);
  const partial = finiteNumber(partialText);

  if (whole == null || partial == null || partial < 0 || partial > 2) return null;
  return whole * 3 + partial;
}

export function outsToDecimalInnings(outs) {
  const number = finiteNumber(outs);
  return number == null || number < 0 || !Number.isInteger(number) ? null : number / 3;
}

export function outsToMlbInnings(outs) {
  const number = finiteNumber(outs);
  if (number == null || number < 0 || !Number.isInteger(number)) return null;
  const whole = Math.floor(number / 3);
  const remainder = number % 3;
  return `${whole}.${remainder}`;
}

export function averageOuts(values) {
  const outs = (values ?? []).map(mlbInningsToOuts).filter(Number.isInteger);
  if (!outs.length) return null;
  return outs.reduce((sum, value) => sum + value, 0) / outs.length;
}

export function averageDecimalInnings(values) {
  const outs = averageOuts(values);
  return outs == null ? null : outs / 3;
}

export function totalOuts(values) {
  const outs = (values ?? []).map(mlbInningsToOuts).filter(Number.isInteger);
  if (!outs.length) return null;
  return outs.reduce((sum, value) => sum + value, 0);
}
