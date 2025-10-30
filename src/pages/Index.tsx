import { useState, useEffect } from "react";
import { CryptoData, CryptoSound } from "@/types/crypto";
import { audioEngine } from "@/utils/audioEngine";
import CryptoSearch from "@/components/CryptoSearch";
import CryptoSoundCard from "@/components/CryptoSoundCard";
import AudioVisualizer from "@/components/AudioVisualizer";
import MasterControls from "@/components/MasterControls";
import { useToast } from "@/hooks/use-toast";

const Index = () => {
  const [cryptoSounds, setCryptoSounds] = useState<CryptoSound[]>([]);
  const [isPlaying, setIsPlaying] = useState(false);
  const [masterVolume, setMasterVolume] = useState(0.5);
  const { toast } = useToast();

  useEffect(() => {
    audioEngine.initialize();
    return () => {
      audioEngine.close();
    };
  }, []);

  useEffect(() => {
    audioEngine.setMasterVolume(masterVolume);
  }, [masterVolume]);

  const addCrypto = (crypto: CryptoData) => {
    const newCryptoSound: CryptoSound = {
      id: crypto.id,
      crypto,
      oscillator: null,
      gainNode: null,
      volume: 0.7,
      waveform: "sine",
      isPlaying: false,
    };

    setCryptoSounds((prev) => [...prev, newCryptoSound]);

    if (isPlaying) {
      startSound(newCryptoSound);
    }
  };

  const removeCrypto = (id: string) => {
    const cryptoSound = cryptoSounds.find((cs) => cs.id === id);
    if (cryptoSound?.oscillator) {
      cryptoSound.oscillator.stop();
      cryptoSound.oscillator.disconnect();
    }
    setCryptoSounds((prev) => prev.filter((cs) => cs.id !== id));
  };

  const startSound = (cryptoSound: CryptoSound) => {
    if (cryptoSound.oscillator) return;

    const nodes = audioEngine.createOscillator(
      cryptoSound.crypto,
      cryptoSound.waveform
    );

    if (nodes) {
      const { oscillator, gainNode } = nodes;
      gainNode.gain.value *= cryptoSound.volume;
      oscillator.start();

      setCryptoSounds((prev) =>
        prev.map((cs) =>
          cs.id === cryptoSound.id
            ? { ...cs, oscillator, gainNode, isPlaying: true }
            : cs
        )
      );
    }
  };

  const stopSound = (cryptoSound: CryptoSound) => {
    if (cryptoSound.oscillator) {
      cryptoSound.oscillator.stop();
      cryptoSound.oscillator.disconnect();

      setCryptoSounds((prev) =>
        prev.map((cs) =>
          cs.id === cryptoSound.id
            ? { ...cs, oscillator: null, gainNode: null, isPlaying: false }
            : cs
        )
      );
    }
  };

  const togglePlay = () => {
    if (isPlaying) {
      cryptoSounds.forEach(stopSound);
      audioEngine.suspend();
      setIsPlaying(false);
    } else {
      audioEngine.resume();
      cryptoSounds.forEach(startSound);
      setIsPlaying(true);
      toast({
        title: "Playing",
        description: "Your crypto symphony is now playing",
      });
    }
  };

  const updateVolume = (id: string, volume: number) => {
    setCryptoSounds((prev) =>
      prev.map((cs) => {
        if (cs.id === id) {
          if (cs.gainNode) {
            cs.gainNode.gain.value = volume * 0.5;
          }
          return { ...cs, volume };
        }
        return cs;
      })
    );
  };

  const updateWaveform = (id: string, waveform: OscillatorType) => {
    setCryptoSounds((prev) =>
      prev.map((cs) => {
        if (cs.id === id) {
          const wasPlaying = cs.isPlaying;
          if (wasPlaying) {
            stopSound(cs);
          }
          const updated = { ...cs, waveform };
          if (wasPlaying) {
            setTimeout(() => startSound(updated), 10);
          }
          return updated;
        }
        return cs;
      })
    );
  };

  return (
    <div className="min-h-screen bg-background relative overflow-hidden">
      <div className="absolute inset-0 bg-gradient-glow opacity-30" />
      
      <div className="relative max-w-7xl mx-auto px-4 py-8 space-y-8">
        <header className="text-center space-y-2">
          <h1 className="text-5xl font-bold bg-gradient-primary bg-clip-text text-transparent">
            CryptoSound
          </h1>
          <p className="text-lg text-muted-foreground">
            Transform cryptocurrency data into generative music
          </p>
        </header>

        <div className="grid lg:grid-cols-2 gap-8">
          <div className="space-y-6">
            <MasterControls
              isPlaying={isPlaying}
              onTogglePlay={togglePlay}
              masterVolume={masterVolume}
              onMasterVolumeChange={setMasterVolume}
              activeCryptos={cryptoSounds.length}
            />

            <CryptoSearch
              onAddCrypto={addCrypto}
              selectedCryptos={cryptoSounds.map((cs) => cs.crypto)}
            />
          </div>

          <AudioVisualizer
            isPlaying={isPlaying}
            activeCryptos={cryptoSounds.length}
          />
        </div>

        {cryptoSounds.length > 0 && (
          <div>
            <h2 className="text-2xl font-bold text-foreground mb-4">
              Active Sound Layers
            </h2>
            <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
              {cryptoSounds.map((cs) => (
                <CryptoSoundCard
                  key={cs.id}
                  cryptoSound={cs}
                  onRemove={() => removeCrypto(cs.id)}
                  onVolumeChange={(vol) => updateVolume(cs.id, vol)}
                  onWaveformChange={(wf) => updateWaveform(cs.id, wf)}
                />
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default Index;
