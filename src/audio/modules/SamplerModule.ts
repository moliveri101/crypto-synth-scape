import { AudioModule } from "../AudioModule";

export class SamplerModule extends AudioModule {
  private gainNode: GainNode;
  private filterNode: BiquadFilterNode;
  
  // Sample storage and playback
  private samples: Map<number, AudioBuffer> = new Map(); // pad number -> buffer
  private activeSources: Map<number, AudioBufferSourceNode> = new Map();
  
  // Controls per pad
  private padVolumes: Map<number, number> = new Map();
  private padPitches: Map<number, number> = new Map();
  private padLoopEnabled: Map<number, boolean> = new Map();
  private padLoopStart: Map<number, number> = new Map();
  private padLoopEnd: Map<number, number> = new Map();
  
  // Global controls
  private volume: number = 0.8;
  private filterFreq: number = 20000;
  private filterRes: number = 0;

  constructor(ctx: AudioContext) {
    super(ctx);
    
    // Create signal chain
    this.gainNode = ctx.createGain();
    this.gainNode.gain.value = this.volume;
    
    this.filterNode = ctx.createBiquadFilter();
    this.filterNode.type = 'lowpass';
    this.filterNode.frequency.value = this.filterFreq;
    this.filterNode.Q.value = this.filterRes;
    
    // Connect chain
    this.filterNode.connect(this.gainNode);
    
    this.inputNode = this.gainNode;
    this.outputNode = this.gainNode;
    
    // Initialize 8 pads with defaults
    for (let i = 0; i < 8; i++) {
      this.padVolumes.set(i, 1.0);
      this.padPitches.set(i, 1.0);
      this.padLoopEnabled.set(i, false);
      this.padLoopStart.set(i, 0);
      this.padLoopEnd.set(i, 0);
    }
  }

  async loadSampleFromFile(padIndex: number, file: File): Promise<boolean> {
    try {
      const arrayBuffer = await file.arrayBuffer();
      const audioBuffer = await this.ctx.decodeAudioData(arrayBuffer);
      
      this.samples.set(padIndex, audioBuffer);
      this.padLoopEnd.set(padIndex, audioBuffer.duration);
      
      console.log(`SamplerModule: Sample loaded to pad ${padIndex}, duration: ${audioBuffer.duration}s`);
      return true;
    } catch (error) {
      console.error(`SamplerModule: Failed to load sample to pad ${padIndex}`, error);
      return false;
    }
  }

  async recordToPad(padIndex: number): Promise<boolean> {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream);
      const chunks: Blob[] = [];

      return new Promise((resolve) => {
        recorder.ondataavailable = (e) => {
          if (e.data.size > 0) chunks.push(e.data);
        };

        recorder.onstop = async () => {
          const blob = new Blob(chunks, { type: 'audio/webm' });
          const arrayBuffer = await blob.arrayBuffer();
          const audioBuffer = await this.ctx.decodeAudioData(arrayBuffer);
          
          this.samples.set(padIndex, audioBuffer);
          this.padLoopEnd.set(padIndex, audioBuffer.duration);
          
          stream.getTracks().forEach(track => track.stop());
          resolve(true);
        };

        recorder.start();
        
        // Auto-stop after 10 seconds
        setTimeout(() => {
          if (recorder.state === 'recording') {
            recorder.stop();
          }
        }, 10000);
      });
    } catch (error) {
      console.error(`SamplerModule: Failed to record to pad ${padIndex}`, error);
      return false;
    }
  }

  triggerPad(padIndex: number) {
    const buffer = this.samples.get(padIndex);
    if (!buffer) {
      console.warn(`SamplerModule: No sample on pad ${padIndex}`);
      return;
    }

    // Stop existing playback on this pad
    this.stopPad(padIndex);

    const source = this.ctx.createBufferSource();
    source.buffer = buffer;
    
    // Apply pad-specific settings
    const pitch = this.padPitches.get(padIndex) || 1.0;
    source.playbackRate.value = pitch;
    
    const loopEnabled = this.padLoopEnabled.get(padIndex) || false;
    source.loop = loopEnabled;
    
    if (loopEnabled) {
      source.loopStart = this.padLoopStart.get(padIndex) || 0;
      source.loopEnd = this.padLoopEnd.get(padIndex) || buffer.duration;
    }
    
    // Create pad gain node for individual volume control
    const padGain = this.ctx.createGain();
    const padVolume = this.padVolumes.get(padIndex) || 1.0;
    padGain.gain.value = padVolume;
    
    source.connect(padGain);
    padGain.connect(this.filterNode);
    
    source.onended = () => {
      if (!loopEnabled) {
        this.activeSources.delete(padIndex);
      }
    };
    
    source.start(0);
    this.activeSources.set(padIndex, source);
    this.isActive = true;
    
    console.log(`SamplerModule: Triggered pad ${padIndex}, pitch: ${pitch}, loop: ${loopEnabled}`);
  }

  stopPad(padIndex: number) {
    const source = this.activeSources.get(padIndex);
    if (source) {
      try {
        source.stop();
        source.disconnect();
      } catch (e) {
        // Already stopped
      }
      this.activeSources.delete(padIndex);
    }
    
    if (this.activeSources.size === 0) {
      this.isActive = false;
    }
  }

  stopAllPads() {
    this.activeSources.forEach((source, padIndex) => {
      this.stopPad(padIndex);
    });
  }

  // Pad-specific controls
  setPadVolume(padIndex: number, volume: number) {
    this.padVolumes.set(padIndex, Math.max(0, Math.min(1, volume)));
  }

  setPadPitch(padIndex: number, pitch: number) {
    this.padPitches.set(padIndex, Math.max(0.25, Math.min(4, pitch)));
    
    // Update active source if playing
    const source = this.activeSources.get(padIndex);
    if (source) {
      source.playbackRate.value = pitch;
    }
  }

  setPadLoop(padIndex: number, enabled: boolean) {
    this.padLoopEnabled.set(padIndex, enabled);
  }

  setPadLoopStart(padIndex: number, time: number) {
    const buffer = this.samples.get(padIndex);
    if (buffer) {
      this.padLoopStart.set(padIndex, Math.max(0, Math.min(buffer.duration, time)));
    }
  }

  setPadLoopEnd(padIndex: number, time: number) {
    const buffer = this.samples.get(padIndex);
    if (buffer) {
      const loopStart = this.padLoopStart.get(padIndex) || 0;
      this.padLoopEnd.set(padIndex, Math.max(loopStart, Math.min(buffer.duration, time)));
    }
  }

  // Global controls
  setVolume(volume: number) {
    this.volume = Math.max(0, Math.min(1, volume));
    this.gainNode.gain.value = this.volume;
  }

  setFilterFrequency(freq: number) {
    this.filterFreq = Math.max(20, Math.min(20000, freq));
    this.filterNode.frequency.value = this.filterFreq;
  }

  setFilterResonance(res: number) {
    this.filterRes = Math.max(0, Math.min(30, res));
    this.filterNode.Q.value = this.filterRes;
  }

  // Getters
  hasSample(padIndex: number): boolean {
    return this.samples.has(padIndex);
  }

  isPadPlaying(padIndex: number): boolean {
    return this.activeSources.has(padIndex);
  }

  getPadDuration(padIndex: number): number {
    return this.samples.get(padIndex)?.duration || 0;
  }

  getPadVolume(padIndex: number): number {
    return this.padVolumes.get(padIndex) || 1.0;
  }

  getPadPitch(padIndex: number): number {
    return this.padPitches.get(padIndex) || 1.0;
  }

  getPadLoop(padIndex: number): boolean {
    return this.padLoopEnabled.get(padIndex) || false;
  }

  getPadLoopStart(padIndex: number): number {
    return this.padLoopStart.get(padIndex) || 0;
  }

  getPadLoopEnd(padIndex: number): number {
    return this.padLoopEnd.get(padIndex) || 0;
  }

  getVolume(): number {
    return this.volume;
  }

  getFilterFrequency(): number {
    return this.filterFreq;
  }

  getFilterResonance(): number {
    return this.filterRes;
  }

  start() {
    this.isActive = true;
  }

  stop() {
    this.stopAllPads();
    this.isActive = false;
  }

  setParameter(name: string, value: any) {
    const parts = name.split('_');
    
    if (parts[0] === 'pad' && parts.length >= 3) {
      const padIndex = parseInt(parts[1]);
      const param = parts[2];
      
      switch (param) {
        case 'volume':
          this.setPadVolume(padIndex, value);
          break;
        case 'pitch':
          this.setPadPitch(padIndex, value);
          break;
        case 'loop':
          this.setPadLoop(padIndex, value);
          break;
        case 'loopStart':
          this.setPadLoopStart(padIndex, value);
          break;
        case 'loopEnd':
          this.setPadLoopEnd(padIndex, value);
          break;
      }
    } else {
      switch (name) {
        case 'volume':
          this.setVolume(value);
          break;
        case 'filterFreq':
          this.setFilterFrequency(value);
          break;
        case 'filterRes':
          this.setFilterResonance(value);
          break;
      }
    }
  }

  dispose() {
    this.stopAllPads();
    this.filterNode.disconnect();
    this.gainNode.disconnect();
    this.samples.clear();
    this.activeSources.clear();
    super.dispose();
  }
}
