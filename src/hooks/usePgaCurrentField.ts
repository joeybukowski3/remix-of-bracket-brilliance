import { useEffect, useState } from "react";
import { isPgaCurrentField, type PgaCurrentField } from "@/lib/pga/currentField";

export function usePgaCurrentField() {
  const [payload, setPayload] = useState<unknown>(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let active = true;
    fetch("/data/pga/current-field.json", { cache: "no-store" })
      .then((response) => response.ok ? response.json() : null)
      .then((value) => { if (active) setPayload(value); })
      .catch(() => { if (active) setPayload(null); })
      .finally(() => { if (active) setLoaded(true); });

    return () => { active = false; };
  }, []);

  return {
    payload,
    field: isPgaCurrentField(payload) ? payload as PgaCurrentField : null,
    loaded,
  };
}
