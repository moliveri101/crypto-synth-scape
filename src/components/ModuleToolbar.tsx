import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Search, Plus } from "lucide-react";
import { CryptoData } from "@/types/crypto";
import { useToast } from "@/hooks/use-toast";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";

interface ModuleToolbarProps {
  onAddCrypto: (crypto: CryptoData) => void;
}

const ModuleToolbar = ({ onAddCrypto }: ModuleToolbarProps) => {
  const [search, setSearch] = useState("");
  const [results, setResults] = useState<CryptoData[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [isOpen, setIsOpen] = useState(false);
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
    onAddCrypto(crypto);
    setSearch("");
    setResults([]);
    setIsOpen(false);
    toast({
      title: "Module added",
      description: `${crypto.name} module added to canvas`,
    });
  };

  return (
    <div className="fixed top-4 left-4 z-10 flex gap-2">
      <Popover open={isOpen} onOpenChange={setIsOpen}>
        <PopoverTrigger asChild>
          <Button size="lg" className="shadow-glow gap-2">
            <Plus className="w-5 h-5" />
            Add Crypto Module
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-96 bg-card border-border" align="start">
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
                {isSearching ? "..." : "Search"}
              </Button>
            </div>

            {results.length > 0 && (
              <div className="max-h-64 overflow-y-auto space-y-2">
                {results.map((crypto) => (
                  <div
                    key={crypto.id}
                    className="flex items-center justify-between p-2 bg-secondary border border-border rounded hover:border-primary transition-colors"
                  >
                    <div className="flex items-center gap-2">
                      <img
                        src={crypto.image}
                        alt={crypto.name}
                        className="w-6 h-6"
                      />
                      <div>
                        <p className="font-medium text-sm text-foreground">
                          {crypto.name}
                        </p>
                        <p className="text-xs text-muted-foreground">
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
        </PopoverContent>
      </Popover>
    </div>
  );
};

export default ModuleToolbar;
