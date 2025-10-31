import { useEffect, useCallback, useRef } from 'react';
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
  intervalMs = 120000, // Default: 2 minutes to avoid rate limits
}: UseLiveCryptoPricesOptions) => {
  const failureCountRef = useRef(0);
  const backoffTimeoutRef = useRef<number | null>(null);
  
  const fetchPrices = useCallback(async () => {
    if (!enabled || cryptoIds.length === 0) return;

    try {
      const { data, error } = await supabase.functions.invoke('fetch-crypto-prices', {
        body: { cryptoIds },
      });

      if (error) {
        console.error('Error fetching crypto prices:', error);
        failureCountRef.current++;
        
        // Stop polling after 3 consecutive failures
        if (failureCountRef.current >= 3) {
          console.warn('Too many failures, stopping price updates');
        }
        return;
      }

      // Reset failure count on success
      failureCountRef.current = 0;

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
      failureCountRef.current++;
    }
  }, [cryptoIds, onPriceUpdate, enabled]);

  useEffect(() => {
    if (!enabled) {
      failureCountRef.current = 0;
      if (backoffTimeoutRef.current) {
        clearTimeout(backoffTimeoutRef.current);
      }
      return;
    }

    // Don't fetch if too many failures
    if (failureCountRef.current >= 3) {
      console.warn('Skipping fetch due to previous failures');
      return;
    }

    // Fetch immediately on mount
    fetchPrices();

    // Set up polling interval
    const intervalId = setInterval(() => {
      if (failureCountRef.current < 3) {
        fetchPrices();
      }
    }, intervalMs);

    return () => {
      clearInterval(intervalId);
      if (backoffTimeoutRef.current) {
        clearTimeout(backoffTimeoutRef.current);
      }
    };
  }, [fetchPrices, enabled, intervalMs]);

  return { fetchPrices };
};
