export interface CryptoData {
  id: string;
  symbol: string;
  name: string;
  current_price: number;
  price_change_percentage_24h: number;
  total_volume: number;
  image: string;
}

export interface CryptoSound {
  id: string;
  crypto: CryptoData;
  oscillator: OscillatorNode | null;
  gainNode: GainNode | null;
  volume: number;
  waveform: OscillatorType;
  isPlaying: boolean;
}
