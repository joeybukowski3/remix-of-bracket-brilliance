export function mlbInningsToOuts(value: string | number | null | undefined): number | null {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value === "number" && value < 0) return null;
  if (typeof value === "string" && value.trim().startsWith("-")) return null;

  const text = String(value).trim();
  if (!/^\d+(?:\.[0-2])?$/.test(text)) return null;

  const [wholeText, partialText = "0"] = text.split(".");
  const whole = Number(wholeText);
  const partial = Number(partialText);

  if (!Number.isFinite(whole) || !Number.isFinite(partial) || partial < 0 || partial > 2) return null;
  return whole * 3 + partial;
}

export function outsToDecimalInnings(outs: number | null | undefined): number | null {
  return typeof outs === "number" && Number.isInteger(outs) && outs >= 0 ? outs / 3 : null;
}

export function outsToMlbInnings(outs: number | null | undefined): string | null {
  if (typeof outs !== "number" || !Number.isInteger(outs) || outs < 0) return null;
  return `${Math.floor(outs / 3)}.${outs % 3}`;
}

export function averageOuts(values: Array<string | number | null | undefined>): number | null {
  const outs = values.map(mlbInningsToOuts).filter((value): value is number => Number.isInteger(value));
  if (!outs.length) return null;
  return outs.reduce((sum, value) => sum + value, 0) / outs.length;
}

export function averageDecimalInnings(values: Array<string | number | null | undefined>): number | null {
  const outs = averageOuts(values);
  return outs == null ? null : outs / 3;
}

export function totalOuts(values: Array<string | number | null | undefined>): number | null {
  const outs = values.map(mlbInningsToOuts).filter((value): value is number => Number.isInteger(value));
  if (!outs.length) return null;
  return outs.reduce((sum, value) => sum + value, 0);
}
