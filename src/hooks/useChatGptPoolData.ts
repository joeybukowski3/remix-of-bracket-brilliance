import { useEffect, useState } from "react";
import {
  CHATGPT_POOL_DATA_PATH,
  parseChatGptPoolData,
  type ChatGptPoolData,
} from "@/lib/nfl/chatGptPool";

type PoolDataState = {
  loading: boolean;
  error: string | null;
  data: ChatGptPoolData | null;
};

export function useChatGptPoolData(): PoolDataState {
  const [state, setState] = useState<PoolDataState>({ loading: true, error: null, data: null });

  useEffect(() => {
    let cancelled = false;

    fetch(CHATGPT_POOL_DATA_PATH, { cache: "no-store" })
      .then(async (response) => {
        if (!response.ok) throw new Error(`Pool ledger unavailable (${response.status}).`);
        const data = parseChatGptPoolData(await response.json());
        if (!data) throw new Error("Pool ledger data is malformed.");
        if (!cancelled) setState({ loading: false, error: null, data });
      })
      .catch((error: Error) => {
        if (!cancelled) setState({ loading: false, error: error.message, data: null });
      });

    return () => {
      cancelled = true;
    };
  }, []);

  return state;
}
