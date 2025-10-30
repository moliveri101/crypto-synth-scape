import { useState } from "react";
import { Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { CryptoData } from "@/types/crypto";
import { useToast } from "@/hooks/use-toast";

interface CryptoSearchProps {
  onAddCrypto: (crypto: CryptoData) => void;
  selectedCryptos: CryptoData[];
}

const CryptoSearch = ({ onAddCrypto, selectedCryptos }: CryptoSearchProps) => {
  const [search, setSearch] = useState("");
  const [results, setResults] = useState<CryptoData[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const { toast } = useToast();

  const searchCrypto = async () => {
    if (!search.trim()) return;

    setIsSearching(true);
    try {
      const response = await fetch(
        `https://api.coingecko.com/api/v3/search?query=${search}`
      );
      const data = await response.json();

      if (data.coins && data.coins.length > 0) {
        const ids = data.coins.slice(0, 5).map((c: any) => c.id).join(",");
        const priceResponse = await fetch(
          `https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&ids=${ids}`
        );
        const priceData = await priceResponse.json();
        setResults(priceData);
      } else {
        setResults([]);
        toast({
          title: "No results",
          description: "Try searching for a different cryptocurrency",
        });
      }
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to search cryptocurrencies",
        variant: "destructive",
      });
    } finally {
      setIsSearching(false);
    }
  };

  const handleAdd = (crypto: CryptoData) => {
    if (selectedCryptos.find((c) => c.id === crypto.id)) {
      toast({
        title: "Already added",
        description: `${crypto.name} is already in your mix`,
      });
      return;
    }
    onAddCrypto(crypto);
    setSearch("");
    setResults([]);
    toast({
      title: "Added to mix",
      description: `${crypto.name} is now generating sound`,
    });
  };

  return (
    <div className="space-y-4">
      <div className="flex gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Search cryptocurrency..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && searchCrypto()}
            className="pl-9 bg-secondary border-border"
          />
        </div>
        <Button onClick={searchCrypto} disabled={isSearching}>
          {isSearching ? "Searching..." : "Search"}
        </Button>
      </div>

      {results.length > 0 && (
        <div className="space-y-2">
          {results.map((crypto) => (
            <div
              key={crypto.id}
              className="flex items-center justify-between p-3 bg-card border border-border rounded-lg hover:border-primary transition-colors"
            >
              <div className="flex items-center gap-3">
                <img src={crypto.image} alt={crypto.name} className="w-8 h-8" />
                <div>
                  <p className="font-medium text-foreground">{crypto.name}</p>
                  <p className="text-sm text-muted-foreground">
                    {crypto.symbol.toUpperCase()}
                  </p>
                </div>
              </div>
              <Button size="sm" onClick={() => handleAdd(crypto)}>
                Add
              </Button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default CryptoSearch;
