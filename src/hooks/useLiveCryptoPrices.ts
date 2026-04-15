import { useEffect, useRef, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { CryptoData } from "@/types/crypto";

interface UseLiveCryptoPricesOptions {
  cryptoIds: string[];
  onPriceUpdate: (updatedCryptos: CryptoData[]) => void;
  enabled: boolean;
  intervalMs?: number;
}

/**
 * Polls crypto prices at a configurable interval.
 * Fixes from original: onPriceUpdate is stored in a ref to avoid
 * re-triggering the effect when the callback identity changes.
 */
export const useLiveCryptoPrices = ({
  cryptoIds,
  onPriceUpdate,
  enabled,
  intervalMs = 120000,
}: UseLiveCryptoPricesOptions) => {
  const failureCount = useRef(0);
  const isFetching = useRef(false);
  // Stable ref for the callback so it never causes effect re-runs
  const onPriceUpdateRef = useRef(onPriceUpdate);
  onPriceUpdateRef.current = onPriceUpdate;

  const cryptoIdsKey = cryptoIds.join(",");

  const fetchPrices = useCallback(async () => {
    if (!enabled || cryptoIds.length === 0) return;
    if (isFetching.current) return;
    isFetching.current = true;

    try {
      const { data, error } = await supabase.functions.invoke("fetch-crypto-prices", {
        body: { cryptoIds },
      });

      if (error) {
        console.error("Error fetching crypto prices:", error);
        failureCount.current++;
        return;
      }

      failureCount.current = 0;

      if (Array.isArray(data) && data.length > 0) {
        const updated: CryptoData[] = data.map((c: any) => ({
          id: c.id,
          symbol: c.symbol,
          name: c.name,
          current_price: c.current_price,
          price_change_percentage_24h: c.price_change_percentage_24h,
          total_volume: c.total_volume,
          image: c.image,
        }));
        onPriceUpdateRef.current(updated);
      }
    } catch (err) {
      console.error("useLiveCryptoPrices error:", err);
      failureCount.current++;
    } finally {
      isFetching.current = false;
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cryptoIdsKey, enabled]);

  useEffect(() => {
    if (!enabled) {
      failureCount.current = 0;
      return;
    }
    if (failureCount.current >= 3) return;

    fetchPrices();
    const id = setInterval(() => {
      if (failureCount.current < 3) fetchPrices();
    }, intervalMs);

    return () => clearInterval(id);
  }, [fetchPrices, enabled, intervalMs]);
};
