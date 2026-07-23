const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

function validDate(value) {
  if (typeof value !== "string" || !DATE_PATTERN.test(value)) return false;
  const timestamp = Date.parse(`${value}T00:00:00.000Z`);
  return Number.isFinite(timestamp) && new Date(timestamp).toISOString().slice(0, 10) === value;
}

function firstString(...values) {
  for (const value of values) {
    const text = String(value ?? "").trim();
    if (text) return text;
  }
  return null;
}

function addDate({ dates, errors, source, date, required = false }) {
  if (!date) {
    if (required) errors.push(`${source} has no trustworthy date field.`);
    return;
  }
  if (!validDate(date)) {
    errors.push(`${source} has invalid date "${date}".`);
    return;
  }
  dates[source] = date;
}

function unique(values) {
  return [...new Set(values.filter(Boolean))];
}

export function validateKPropsV2SourceIntegrity({
  rawPayload,
  workloadPayload = null,
  detailsPayload = null,
  oddsPayload = null,
  outputSlateDate = null,
} = {}) {
  const errors = [];
  const warnings = [];
  const dates = {};

  addDate({ dates, errors, source: "hr-props-raw.json", date: rawPayload?.date, required: true });
  addDate({ dates, errors, source: "k-workload-shadow.json", date: workloadPayload?.date, required: false });
  addDate({ dates, errors, source: "strikeout-prop-details.json", date: detailsPayload?.date, required: false });
  addDate({ dates, errors, source: "output slateDate", date: outputSlateDate, required: false });

  if (workloadPayload && !workloadPayload.date) {
    warnings.push("k-workload-shadow.json has no trustworthy date field.");
  }
  if (detailsPayload && !detailsPayload.date) {
    warnings.push("strikeout-prop-details.json has no trustworthy date field.");
  }

  const oddsDate = firstString(oddsPayload?.date, oddsPayload?.slateDate);
  addDate({ dates, errors, source: "mlb-odds.json", date: oddsDate, required: false });
  if (oddsPayload && !oddsDate) {
    warnings.push("mlb-odds.json has no trustworthy date field.");
  }

  const rawOddsDates = unique((rawPayload?.pitchers ?? []).map((row) => row?.kOddsSlateDate));
  if (rawOddsDates.length > 1) {
    errors.push(`hr-props-raw.json pitcher K odds have multiple slate dates: ${rawOddsDates.join(", ")}.`);
  } else if (rawOddsDates.length === 1) {
    addDate({ dates, errors, source: "hr-props-raw.json pitcher K odds", date: rawOddsDates[0], required: false });
  } else {
    warnings.push("hr-props-raw.json pitcher K odds have no trustworthy date field.");
  }

  if (rawPayload?.date) {
    dates["hr-props-raw.json games"] = rawPayload.date;
    dates["hr-props-raw.json lineup"] = rawPayload.date;
  } else {
    warnings.push("hr-props-raw.json games/lineup data have no trustworthy independent date field.");
  }

  const datedValues = Object.entries(dates);
  const intendedSlateDate = outputSlateDate || dates["hr-props-raw.json"] || datedValues[0]?.[1] || null;
  if (!intendedSlateDate) errors.push("Unable to determine intended slate date.");

  for (const [source, date] of datedValues) {
    if (intendedSlateDate && date !== intendedSlateDate) {
      errors.push(`${source} date ${date} does not match intended slate ${intendedSlateDate}.`);
    }
  }

  return {
    ok: errors.length === 0,
    slateDate: intendedSlateDate,
    sourceDates: dates,
    warnings,
    errors,
  };
}

export function assertKPropsV2SourceIntegrity(args = {}) {
  const result = validateKPropsV2SourceIntegrity(args);
  if (!result.ok) {
    throw new Error(`K props V2 source integrity failed: ${result.errors.join("; ")}`);
  }
  return result;
}
