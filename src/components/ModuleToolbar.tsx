import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Search, Plus, Sparkles, Satellite, Bitcoin, CloudSun,
  TrendingUp, HeartPulse, Fish, Radio, Lock, Zap, Building2, Brain,
} from "lucide-react";
import { CryptoData } from "@/types/crypto";
import { useToast } from "@/hooks/use-toast";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { InfoDialog } from "@/components/InfoDialog";

interface ModuleToolbarProps {
  onAddModule: (type: string, extraData?: Record<string, any>) => void;
  livePricesEnabled: boolean;
  onToggleLivePrices: () => void;
}

// Verified active NORAD IDs (as of 2025). Some of Lovable's defaults pointed
// to wrong or deorbited satellites — these are the corrected ones.
const POPULAR_SATELLITES = [
  { id: 25544, name: "ISS (International Space Station)" },
  { id: 48274, name: "CSS Tianhe (Chinese Space Station)" },
  { id: 20580, name: "Hubble Space Telescope" },
  { id: 43013, name: "NOAA 20 (JPSS-1 Weather)" },
  { id: 54234, name: "NOAA 21 (JPSS-2 Weather)" },
  { id: 33591, name: "NOAA 19 (Weather)" },
  { id: 25994, name: "Terra (EOS AM-1)" },
  { id: 27424, name: "Aqua (EOS PM-1)" },
  { id: 39084, name: "Landsat 8" },
  { id: 49260, name: "Landsat 9" },
  { id: 41859, name: "Galileo 15 (GPS-like)" },
];

const PLUGIN_CATEGORIES: Record<string, Array<{ type: string; label: string }>> = {
  Outputs: [
    { type: "output-speakers", label: "Speakers" },
  ],
  Mixers: [
    { type: "mixer-4", label: "4-Track Mixer" },
    { type: "mixer-8", label: "8-Track Mixer" },
    { type: "mixer-16", label: "16-Track Mixer" },
    { type: "mixer-32", label: "32-Track Mixer" },
  ],
  "Audio Sources": [
    { type: "data-drum-machine", label: "Data Drum Machine" },
    { type: "sampler", label: "Sampler" },
    { type: "sequencer", label: "Sequencer" },
    { type: "drums", label: "Drum Machine" },
  ],
  Translators: [
    { type: "tone-translator", label: "Tone Translator" },
    { type: "pulse-translator", label: "Pulse Translator" },
    { type: "melody-translator", label: "Melody Translator" },
  ],
  "Time Effects": [
    { type: "reverb", label: "Reverb" },
    { type: "delay", label: "Delay" },
    { type: "chorus", label: "Chorus" },
    { type: "flanger", label: "Flanger" },
    { type: "phaser", label: "Phaser" },
    { type: "pingpong-delay", label: "Ping-Pong Delay" },
  ],
  Dynamics: [
    { type: "compressor", label: "Compressor" },
    { type: "limiter", label: "Limiter" },
    { type: "gate", label: "Gate" },
    { type: "de-esser", label: "De-esser" },
  ],
  "Filters & EQ": [
    { type: "eq", label: "EQ" },
    { type: "lpf", label: "Low-Pass Filter" },
    { type: "hpf", label: "High-Pass Filter" },
    { type: "bandpass", label: "Band-Pass" },
    { type: "resonant-filter", label: "Resonant Filter" },
  ],
  Distortion: [
    { type: "overdrive", label: "Overdrive" },
    { type: "distortion", label: "Distortion" },
    { type: "fuzz", label: "Fuzz" },
    { type: "bitcrusher", label: "Bitcrusher" },
    { type: "tape-saturation", label: "Tape Saturation" },
  ],
  Modulation: [
    { type: "vibrato", label: "Vibrato" },
    { type: "tremolo", label: "Tremolo" },
    { type: "ring-mod", label: "Ring Modulator" },
    { type: "pitch-shifter", label: "Pitch Shifter" },
    { type: "octaver", label: "Octaver" },
  ],
  Advanced: [
    { type: "granular", label: "Granular" },
    { type: "vocoder", label: "Vocoder" },
    { type: "auto-pan", label: "Auto-Pan" },
    { type: "stereo-widener", label: "Stereo Widener" },
  ],
};

// ── Data input source categories shown inside the "Data Inputs" dropdown ────
type InputView = "menu" | "crypto" | "satellite";

const ModuleToolbar = ({ onAddModule, livePricesEnabled, onToggleLivePrices }: ModuleToolbarProps) => {
  // Data inputs popover
  const [isInputOpen, setIsInputOpen] = useState(false);
  const [inputView, setInputView] = useState<InputView>("menu");
  const [search, setSearch] = useState("");
  const [results, setResults] = useState<CryptoData[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [isFetchingSatellite, setIsFetchingSatellite] = useState(false);

  // Plugins popover
  const [isPluginOpen, setIsPluginOpen] = useState(false);

  const { toast } = useToast();

  // Reset input popover to menu when closed
  const handleInputOpenChange = (open: boolean) => {
    setIsInputOpen(open);
    if (!open) {
      setInputView("menu");
      setSearch("");
      setResults([]);
    }
  };

  // ── Crypto ──────────────────────────────────────────────────────────────

  const searchCrypto = async () => {
    if (!search.trim()) return;
    setIsSearching(true);
    try {
      const resp = await fetch(`https://api.coingecko.com/api/v3/search?query=${search}`);
      const data = await resp.json();
      if (data.coins?.length) {
        const ids = data.coins.slice(0, 5).map((c: any) => c.id).join(",");
        const priceResp = await fetch(
          `https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&ids=${ids}`,
        );
        setResults(await priceResp.json());
      } else {
        setResults([]);
        toast({ title: "No results", description: "Try a different search term" });
      }
    } catch {
      toast({ title: "Error", description: "Failed to search cryptocurrencies", variant: "destructive" });
    } finally {
      setIsSearching(false);
    }
  };

  const handleAddCrypto = (crypto: CryptoData) => {
    onAddModule("crypto", { crypto, id: crypto.id });
    setSearch("");
    setResults([]);
    setIsInputOpen(false);
  };

  // ── Satellite ───────────────────────────────────────────────────────────

  const handleAddSatellite = async (satelliteId: number, satelliteName: string) => {
    setIsFetchingSatellite(true);
    try {
      const { data, error } = await supabase.functions.invoke("fetch-satellite-data", {
        body: { satelliteId },
      });
      if (error) throw error;
      onAddModule("satellite", { satellite: data, id: data.id });
      setIsInputOpen(false);
    } catch {
      toast({ title: "Error", description: "Failed to fetch satellite data", variant: "destructive" });
    } finally {
      setIsFetchingSatellite(false);
    }
  };

  // ── Render ──────────────────────────────────────────────────────────────

  return (
    <div className="fixed top-4 left-4 z-10 flex gap-2">
      {/* ── Data Inputs dropdown ─────────────────────────────────────── */}
      <Popover open={isInputOpen} onOpenChange={handleInputOpenChange}>
        <PopoverTrigger asChild>
          <Button size="lg" className="shadow-glow gap-2">
            <Plus className="w-5 h-5" />
            Data Inputs
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-96 bg-card border-border" align="start">
          {inputView === "menu" && (
            <ScrollArea className="h-[420px] pr-4">
              <div className="space-y-1">
                <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">
                  Live Data Sources
                </h4>

                {/* Crypto */}
                <Button
                  variant="ghost"
                  className="w-full justify-start gap-3 h-auto py-3"
                  onClick={() => setInputView("crypto")}
                >
                  <Bitcoin className="w-5 h-5 text-orange-400 shrink-0" />
                  <div className="text-left">
                    <p className="font-medium">Cryptocurrency</p>
                    <p className="text-xs text-muted-foreground">Price data mapped to oscillators</p>
                  </div>
                </Button>

                {/* Satellite */}
                <Button
                  variant="ghost"
                  className="w-full justify-start gap-3 h-auto py-3"
                  onClick={() => setInputView("satellite")}
                >
                  <Satellite className="w-5 h-5 text-blue-400 shrink-0" />
                  <div className="text-left">
                    <p className="font-medium">Satellite Tracking</p>
                    <p className="text-xs text-muted-foreground">Orbital data mapped to rhythm & pitch</p>
                  </div>
                </Button>

                {/* Weather — live */}
                <Button
                  variant="ghost"
                  className="w-full justify-start gap-3 h-auto py-3"
                  onClick={() => {
                    onAddModule("weather");
                    setIsInputOpen(false);
                  }}
                >
                  <CloudSun className="w-5 h-5 text-cyan-400 shrink-0" />
                  <div className="text-left">
                    <p className="font-medium">Weather</p>
                    <p className="text-xs text-muted-foreground">Temperature, wind, pressure via Open-Meteo</p>
                  </div>
                </Button>

                {/* Earthquakes — live */}
                <Button
                  variant="ghost"
                  className="w-full justify-start gap-3 h-auto py-3"
                  onClick={() => {
                    onAddModule("earthquakes");
                    setIsInputOpen(false);
                  }}
                >
                  <Zap className="w-5 h-5 text-red-400 shrink-0" />
                  <div className="text-left">
                    <p className="font-medium">Earthquakes</p>
                    <p className="text-xs text-muted-foreground">USGS live feed &rarr; pulse triggers on new quakes</p>
                  </div>
                </Button>

                {/* US Debt — live */}
                <Button
                  variant="ghost"
                  className="w-full justify-start gap-3 h-auto py-3"
                  onClick={() => {
                    onAddModule("us-debt");
                    setIsInputOpen(false);
                  }}
                >
                  <Building2 className="w-5 h-5 text-amber-400 shrink-0" />
                  <div className="text-left">
                    <p className="font-medium">US Debt</p>
                    <p className="text-xs text-muted-foreground">Treasury fiscal data &rarr; ticking debt clock</p>
                  </div>
                </Button>

                <Separator className="my-3" />
                <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">
                  Coming Soon
                </h4>

                {/* Stocks */}
                <div className="flex items-center gap-3 px-3 py-3 opacity-50 cursor-default">
                  <TrendingUp className="w-5 h-5 text-green-400 shrink-0" />
                  <div className="text-left flex-1">
                    <p className="font-medium">Stock Market</p>
                    <p className="text-xs text-muted-foreground">Equities, indices, forex &rarr; sound</p>
                  </div>
                  <Badge variant="outline" className="text-[10px] shrink-0">Soon</Badge>
                </div>

                {/* Vitals — Hume Health (mock) */}
                <Button
                  variant="ghost"
                  className="w-full justify-start gap-3 h-auto py-3"
                  onClick={() => {
                    onAddModule("vitals");
                    setIsInputOpen(false);
                  }}
                >
                  <HeartPulse className="w-5 h-5 text-pink-400 shrink-0" />
                  <div className="text-left">
                    <p className="font-medium">Vitals (Hume Health)</p>
                    <p className="text-xs text-muted-foreground">Heart rate, HRV, breathing &rarr; pulse triggers</p>
                  </div>
                </Button>

                {/* Emotiv EEG — 14-channel brain signal */}
                <Button
                  variant="ghost"
                  className="w-full justify-start gap-3 h-auto py-3"
                  onClick={() => {
                    onAddModule("emotiv");
                    setIsInputOpen(false);
                  }}
                >
                  <Brain className="w-5 h-5 text-cyan-400 shrink-0" />
                  <div className="text-left">
                    <p className="font-medium">Emotiv EEG (14-ch)</p>
                    <p className="text-xs text-muted-foreground">EPOC X brainwaves via Cortex &rarr; sound</p>
                  </div>
                </Button>

                {/* Vitals (placeholder removed — replaced by live module above) */}
                <div className="flex items-center gap-3 px-3 py-3 opacity-50 cursor-default hidden">
                  <HeartPulse className="w-5 h-5 text-red-400 shrink-0" />
                  <div className="text-left flex-1">
                    <p className="font-medium">Biometric / Vitals</p>
                    <p className="text-xs text-muted-foreground">Heart rate, HRV, SpO2 &rarr; sound</p>
                  </div>
                  <Badge variant="outline" className="text-[10px] shrink-0">Soon</Badge>
                </div>

                {/* Whale tracking */}
                <div className="flex items-center gap-3 px-3 py-3 opacity-50 cursor-default">
                  <Fish className="w-5 h-5 text-teal-400 shrink-0" />
                  <div className="text-left flex-1">
                    <p className="font-medium">Whale Tracking</p>
                    <p className="text-xs text-muted-foreground">Migration patterns &rarr; sound</p>
                  </div>
                  <Badge variant="outline" className="text-[10px] shrink-0">Soon</Badge>
                </div>

                {/* Radio signals */}
                <div className="flex items-center gap-3 px-3 py-3 opacity-50 cursor-default">
                  <Radio className="w-5 h-5 text-purple-400 shrink-0" />
                  <div className="text-left flex-1">
                    <p className="font-medium">Radio Signals</p>
                    <p className="text-xs text-muted-foreground">SDR / space radio &rarr; sound</p>
                  </div>
                  <Badge variant="outline" className="text-[10px] shrink-0">Soon</Badge>
                </div>

                {/* Blockchain */}
                <div className="flex items-center gap-3 px-3 py-3 opacity-50 cursor-default">
                  <Lock className="w-5 h-5 text-amber-400 shrink-0" />
                  <div className="text-left flex-1">
                    <p className="font-medium">Blockchain Activity</p>
                    <p className="text-xs text-muted-foreground">Transactions, gas, mempool &rarr; sound</p>
                  </div>
                  <Badge variant="outline" className="text-[10px] shrink-0">Soon</Badge>
                </div>
              </div>
            </ScrollArea>
          )}

          {/* ── Crypto sub-view ──────────────────────────────────────── */}
          {inputView === "crypto" && (
            <div className="space-y-4">
              <div className="flex items-center gap-2">
                <Button variant="ghost" size="sm" onClick={() => setInputView("menu")} aria-label="Back">
                  &larr;
                </Button>
                <Bitcoin className="w-5 h-5 text-orange-400" />
                <h4 className="font-semibold text-sm">Cryptocurrency</h4>
              </div>
              <div className="flex gap-2">
                <div className="relative flex-1">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <Input
                    placeholder="Search cryptocurrency..."
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && searchCrypto()}
                    className="pl-9 bg-secondary border-border"
                    aria-label="Search cryptocurrency"
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
                        <img src={crypto.image} alt={`${crypto.name} icon`} className="w-6 h-6" />
                        <div>
                          <p className="font-medium text-sm text-foreground">{crypto.name}</p>
                          <p className="text-xs text-muted-foreground">{crypto.symbol.toUpperCase()}</p>
                        </div>
                      </div>
                      <Button size="sm" onClick={() => handleAddCrypto(crypto)}>Add</Button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* ── Satellite sub-view ───────────────────────────────────── */}
          {inputView === "satellite" && (
            <div className="space-y-4">
              <div className="flex items-center gap-2">
                <Button variant="ghost" size="sm" onClick={() => setInputView("menu")} aria-label="Back">
                  &larr;
                </Button>
                <Satellite className="w-5 h-5 text-blue-400" />
                <h4 className="font-semibold text-sm">Satellite Tracking</h4>
              </div>
              <ScrollArea className="h-[350px] pr-4">
                <div className="space-y-1">
                  {POPULAR_SATELLITES.map((sat) => (
                    <Button
                      key={sat.id}
                      variant="ghost"
                      className="w-full justify-between text-left h-auto py-2"
                      onClick={() => handleAddSatellite(sat.id, sat.name)}
                      disabled={isFetchingSatellite}
                    >
                      <span className="flex-1">{sat.name}</span>
                      <span className="text-xs text-muted-foreground ml-2">ID: {sat.id}</span>
                    </Button>
                  ))}
                </div>
              </ScrollArea>
            </div>
          )}
        </PopoverContent>
      </Popover>

      {/* ── Plugins / Effects dropdown ───────────────────────────────── */}
      <Popover open={isPluginOpen} onOpenChange={setIsPluginOpen}>
        <PopoverTrigger asChild>
          <Button size="lg" variant="secondary" className="shadow-glow gap-2">
            <Sparkles className="w-5 h-5" />
            Add Plugin
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-96 bg-card border-border" align="start">
          <ScrollArea className="h-[500px] pr-4">
            <div className="space-y-4">
              {Object.entries(PLUGIN_CATEGORIES).map(([category, plugins]) => (
                <div key={category}>
                  <h4 className="text-sm font-semibold text-muted-foreground mb-2">{category}</h4>
                  <div className="space-y-1">
                    {plugins.map((p) => (
                      <Button
                        key={p.type}
                        variant="ghost"
                        className="w-full justify-start text-left"
                        onClick={() => {
                          onAddModule(p.type);
                          setIsPluginOpen(false);
                        }}
                      >
                        {p.label}
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
