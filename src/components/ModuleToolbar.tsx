import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Search, Plus, Sparkles, Satellite } from "lucide-react";
import { CryptoData } from "@/types/crypto";
import { SatelliteData } from "@/types/modules";
import { useToast } from "@/hooks/use-toast";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { ModuleType } from "@/types/modules";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { supabase } from "@/integrations/supabase/client";
import { InfoDialog } from "@/components/InfoDialog";

interface ModuleToolbarProps {
  onAddCrypto: (crypto: CryptoData) => void;
  onAddSatellite: (satellite: SatelliteData) => void;
  onAddPlugin: (type: ModuleType) => void;
  livePricesEnabled: boolean;
  onToggleLivePrices: () => void;
}

const POPULAR_SATELLITES = [
  { id: 25544, name: "ISS (International Space Station)" },
  { id: 48274, name: "Starlink-1007" },
  { id: 43013, name: "Hubble Space Telescope" },
  { id: 41859, name: "Tiangong Space Station" },
  { id: 37820, name: "NOAA 18 Weather Satellite" },
  { id: 33591, name: "GPS BIIR-11" },
  { id: 25994, name: "Terra (EOS AM-1)" },
  { id: 27424, name: "Aqua (EOS PM-1)" },
];

const PLUGIN_CATEGORIES = {
  "Outputs": [
    { type: "output-speakers" as ModuleType, label: "Speakers" },
  ],
  "Mixers": [
    { type: "mixer-4" as ModuleType, label: "4-Track Mixer" },
    { type: "mixer-8" as ModuleType, label: "8-Track Mixer" },
    { type: "mixer-16" as ModuleType, label: "16-Track Mixer" },
    { type: "mixer-32" as ModuleType, label: "32-Track Mixer" },
  ],
  "Audio Sources": [
    { type: "sampler" as ModuleType, label: "Sampler" },
    { type: "sequencer" as ModuleType, label: "Sequencer" },
    { type: "drums" as ModuleType, label: "Drum Machine" },
  ],
  "Time Effects": [
    { type: "reverb" as ModuleType, label: "Reverb" },
    { type: "delay" as ModuleType, label: "Delay" },
    { type: "chorus" as ModuleType, label: "Chorus" },
    { type: "flanger" as ModuleType, label: "Flanger" },
    { type: "phaser" as ModuleType, label: "Phaser" },
    { type: "pingpong-delay" as ModuleType, label: "Ping-Pong Delay" },
  ],
  "Dynamics": [
    { type: "compressor" as ModuleType, label: "Compressor" },
    { type: "limiter" as ModuleType, label: "Limiter" },
    { type: "gate" as ModuleType, label: "Gate" },
    { type: "de-esser" as ModuleType, label: "De-esser" },
  ],
  "Filters & EQ": [
    { type: "eq" as ModuleType, label: "EQ" },
    { type: "lpf" as ModuleType, label: "Low-Pass Filter" },
    { type: "hpf" as ModuleType, label: "High-Pass Filter" },
    { type: "bandpass" as ModuleType, label: "Band-Pass" },
    { type: "resonant-filter" as ModuleType, label: "Resonant Filter" },
  ],
  "Distortion": [
    { type: "overdrive" as ModuleType, label: "Overdrive" },
    { type: "distortion" as ModuleType, label: "Distortion" },
    { type: "fuzz" as ModuleType, label: "Fuzz" },
    { type: "bitcrusher" as ModuleType, label: "Bitcrusher" },
    { type: "tape-saturation" as ModuleType, label: "Tape Saturation" },
  ],
  "Modulation": [
    { type: "vibrato" as ModuleType, label: "Vibrato" },
    { type: "tremolo" as ModuleType, label: "Tremolo" },
    { type: "ring-mod" as ModuleType, label: "Ring Modulator" },
    { type: "pitch-shifter" as ModuleType, label: "Pitch Shifter" },
    { type: "octaver" as ModuleType, label: "Octaver" },
  ],
  "Advanced": [
    { type: "granular" as ModuleType, label: "Granular" },
    { type: "vocoder" as ModuleType, label: "Vocoder" },
    { type: "auto-pan" as ModuleType, label: "Auto-Pan" },
    { type: "stereo-widener" as ModuleType, label: "Stereo Widener" },
  ],
};

const ModuleToolbar = ({ onAddCrypto, onAddSatellite, onAddPlugin, livePricesEnabled, onToggleLivePrices }: ModuleToolbarProps) => {
  const [search, setSearch] = useState("");
  const [results, setResults] = useState<CryptoData[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [isCryptoOpen, setIsCryptoOpen] = useState(false);
  const [isSatelliteOpen, setIsSatelliteOpen] = useState(false);
  const [isPluginOpen, setIsPluginOpen] = useState(false);
  const [isFetchingSatellite, setIsFetchingSatellite] = useState(false);
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
    setIsCryptoOpen(false);
    toast({
      title: "Module added",
      description: `${crypto.name} module added to canvas`,
    });
  };

  const handleAddSatellite = async (satelliteId: number, satelliteName: string) => {
    setIsFetchingSatellite(true);
    try {
      const { data, error } = await supabase.functions.invoke('fetch-satellite-data', {
        body: { satelliteId }
      });

      if (error) throw error;

      onAddSatellite(data);
      setIsSatelliteOpen(false);
      toast({
        title: "Satellite added",
        description: `${satelliteName} module added to canvas`,
      });
    } catch (error) {
      console.error('Error fetching satellite:', error);
      toast({
        title: "Error",
        description: "Failed to fetch satellite data",
        variant: "destructive",
      });
    } finally {
      setIsFetchingSatellite(false);
    }
  };

  const handleAddPlugin = (type: ModuleType, label: string) => {
    onAddPlugin(type);
    setIsPluginOpen(false);
    toast({
      title: "Plugin added",
      description: `${label} added to canvas`,
    });
  };

  return (
    <div className="fixed top-4 left-4 z-10 flex gap-2">
        <Popover open={isCryptoOpen} onOpenChange={setIsCryptoOpen}>
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

      <Popover open={isSatelliteOpen} onOpenChange={setIsSatelliteOpen}>
        <PopoverTrigger asChild>
          <Button size="lg" variant="secondary" className="shadow-glow gap-2">
            <Satellite className="w-5 h-5" />
            Add Satellite
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-96 bg-card border-border" align="start">
          <ScrollArea className="h-[400px] pr-4">
            <div className="space-y-2">
              <h4 className="text-sm font-semibold text-muted-foreground mb-3">
                Popular Satellites
              </h4>
              {POPULAR_SATELLITES.map((satellite) => (
                <Button
                  key={satellite.id}
                  variant="ghost"
                  className="w-full justify-between text-left h-auto py-2"
                  onClick={() => handleAddSatellite(satellite.id, satellite.name)}
                  disabled={isFetchingSatellite}
                >
                  <span className="flex-1">{satellite.name}</span>
                  <span className="text-xs text-muted-foreground ml-2">
                    ID: {satellite.id}
                  </span>
                </Button>
              ))}
            </div>
          </ScrollArea>
        </PopoverContent>
      </Popover>

      <Popover open={isPluginOpen} onOpenChange={setIsPluginOpen}>
        <PopoverTrigger asChild>
          <Button size="lg" variant="secondary" className="shadow-glow gap-2">
            <Sparkles className="w-5 h-5" />
            Add Effect
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-96 bg-card border-border" align="start">
          <ScrollArea className="h-[500px] pr-4">
            <div className="space-y-4">
              {Object.entries(PLUGIN_CATEGORIES).map(([category, plugins]) => (
                <div key={category}>
                  <h4 className="text-sm font-semibold text-muted-foreground mb-2">
                    {category}
                  </h4>
                  <div className="space-y-1">
                    {plugins.map((plugin) => (
                      <Button
                        key={plugin.type}
                        variant="ghost"
                        className="w-full justify-start text-left"
                        onClick={() => handleAddPlugin(plugin.type, plugin.label)}
                      >
                        {plugin.label}
                      </Button>
                    ))}
                  </div>
                  <Separator className="mt-3" />
                </div>
              ))}
            </div>
          </ScrollArea>
        </PopoverContent>
      </Popover>

      <InfoDialog />

      <Button 
        size="lg" 
        variant={livePricesEnabled ? "default" : "outline"}
        onClick={onToggleLivePrices}
        className="gap-2"
      >
        <Sparkles className="w-5 h-5" />
        {livePricesEnabled ? "Live Prices ON" : "Live Prices OFF"}
      </Button>
    </div>
  );
};

export default ModuleToolbar;
