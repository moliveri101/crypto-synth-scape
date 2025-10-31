import { useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { CryptoData } from '@/types/crypto';

interface UseLiveCryptoPricesOptions {
  cryptoIds: string[];
  onPriceUpdate: (updatedCryptos: CryptoData[]) => void;
  enabled: boolean;
  intervalMs?: number;
}

export const useLiveCryptoPrices = ({
  cryptoIds,
  onPriceUpdate,
  enabled,
  intervalMs = 30000, // Default: 30 seconds
}: UseLiveCryptoPricesOptions) => {
  
  const fetchPrices = useCallback(async () => {
    if (!enabled || cryptoIds.length === 0) return;

    try {
      const { data, error } = await supabase.functions.invoke('fetch-crypto-prices', {
        body: { cryptoIds },
      });

      if (error) {
        console.error('Error fetching crypto prices:', error);
        return;
      }

      if (data && Array.isArray(data)) {
        const updatedCryptos: CryptoData[] = data.map((crypto: any) => ({
          id: crypto.id,
          symbol: crypto.symbol,
          name: crypto.name,
          current_price: crypto.current_price,
          price_change_percentage_24h: crypto.price_change_percentage_24h,
          total_volume: crypto.total_volume,
          image: crypto.image,
        }));

        onPriceUpdate(updatedCryptos);
      }
    } catch (error) {
      console.error('Error in useLiveCryptoPrices:', error);
    }
  }, [cryptoIds, onPriceUpdate, enabled]);

  useEffect(() => {
    if (!enabled) return;

    // Fetch immediately on mount
    fetchPrices();

    // Set up polling interval
    const intervalId = setInterval(fetchPrices, intervalMs);

    return () => clearInterval(intervalId);
  }, [fetchPrices, enabled, intervalMs]);

  return { fetchPrices };
};
