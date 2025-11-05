import { AudioModule } from "../AudioModule";

export class DrumsModule extends AudioModule {
  private volume: number = 0.6; // Phase 2: Reduced from 1.0
  private pitch: number = 0;
  private selectedDrum: string = "kick";
  private analyser: AnalyserNode;
  private monitoringInterval: number | null = null;
  private lastTriggerTime: number = 0;
  private minTriggerInterval: number = 0.05; // 50ms between triggers
  // Phase 3: Pre-generated noise buffers
  private noiseBuffers: Map<string, AudioBuffer> = new Map();

  constructor(ctx: AudioContext) {
    super(ctx);
    
    // Create input node with analyser to detect gate signals
    this.inputNode = ctx.createGain();
    this.analyser = ctx.createAnalyser();
    this.analyser.fftSize = 256;
    this.inputNode.connect(this.analyser);
    
    // Output node for volume control
    const outputGain = ctx.createGain();
    outputGain.gain.value = this.volume;
    this.outputNode = outputGain;
    
    // Phase 3: Pre-generate noise buffers for efficiency
    this.generateNoiseBuffers();
  }

  // Phase 3: Pre-generate noise buffers to prevent CPU spikes
  private generateNoiseBuffers() {
    const bufferLength = this.ctx.sampleRate * 0.5; // 0.5 seconds
    
    // Generate white noise buffer
    const whiteNoise = this.ctx.createBuffer(1, bufferLength, this.ctx.sampleRate);
    const whiteData = whiteNoise.getChannelData(0);
    for (let i = 0; i < bufferLength; i++) {
      whiteData[i] = Math.random() * 2 - 1;
    }
    this.noiseBuffers.set('white', whiteNoise);
    
    // Could pre-generate filtered versions too, but we'll filter on-demand for flexibility
  }

  start() {
    this.isActive = true;
    this.startMonitoring();
  }

  stop() {
    this.isActive = false;
    this.stopMonitoring();
  }

  private startMonitoring() {
    if (this.monitoringInterval !== null) return;
    
    const dataArray = new Uint8Array(this.analyser.frequencyBinCount);
    
    this.monitoringInterval = window.setInterval(() => {
      if (!this.isActive) return;
      
      this.analyser.getByteTimeDomainData(dataArray);
      
      // Calculate RMS to detect gate signal
      let sum = 0;
      for (let i = 0; i < dataArray.length; i++) {
        const normalized = (dataArray[i] - 128) / 128;
        sum += normalized * normalized;
      }
      const rms = Math.sqrt(sum / dataArray.length);
      
      // Trigger if RMS is above threshold and enough time has passed
      const now = this.ctx.currentTime;
      if (rms > 0.1 && (now - this.lastTriggerTime) > this.minTriggerInterval) {
        this.trigger();
        this.lastTriggerTime = now;
      }
    }, 10); // Check every 10ms
  }

  private stopMonitoring() {
    if (this.monitoringInterval !== null) {
      clearInterval(this.monitoringInterval);
      this.monitoringInterval = null;
    }
  }

  trigger() {
    if (!this.isActive) return;
    
    const now = this.ctx.currentTime;
    const pitchMultiplier = Math.pow(2, this.pitch / 12);

    const env = this.ctx.createGain();
    env.connect(this.outputNode);

    switch (this.selectedDrum) {
      case "kick": {
        // Phase 3: Add 1ms attack to prevent click
        const osc = this.ctx.createOscillator();
        osc.type = "sine";
        osc.frequency.setValueAtTime(150 * pitchMultiplier, now);
        osc.frequency.exponentialRampToValueAtTime(40 * pitchMultiplier, now + 0.5);
        
        // Phase 3: Use setTargetAtTime for smoother envelope
        env.gain.setValueAtTime(0, now);
        env.gain.setTargetAtTime(this.volume, now, 0.001); // 1ms attack
        env.gain.setTargetAtTime(0.01, now + 0.1, 0.15); // Smoother decay
        
        osc.connect(env);
        osc.start(now);
        osc.stop(now + 0.5);
        break;
      }

      case "snare": {
        this.startOsc("triangle", 200 * pitchMultiplier, 0.2, env);
        this.startNoise(0.2, "highpass", 1000, 0.7, env);
        break;
      }

      case "hihat": {
        this.startNoise(0.1, "highpass", 8000, 0.8, env);
        break;
      }

      case "clap": {
        this.startNoise(0.15, "bandpass", 2000, 0.5, env);
        break;
      }

      default:
        this.startOsc("sine", 150 * pitchMultiplier, 0.3, env);
        break;
    }
  }

  private startOsc(type: OscillatorType, freq: number, decay: number, env: GainNode) {
    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, now);
    osc.connect(env);
    
    // Phase 3: Add 1-2ms attack and use setTargetAtTime for smoother envelope
    env.gain.setValueAtTime(0, now);
    env.gain.setTargetAtTime(this.volume, now, 0.002); // 2ms attack
    env.gain.setTargetAtTime(0.01, now + decay * 0.3, decay * 0.2); // Smoother decay
    
    osc.start(now);
    osc.stop(now + decay);
  }

  private startNoise(decay: number, filterType: BiquadFilterType, freq: number, q: number, env: GainNode) {
    const now = this.ctx.currentTime;
    
    // Phase 3: Use pre-generated noise buffer
    const noiseBuffer = this.noiseBuffers.get('white');
    if (!noiseBuffer) return;
    
    const src = this.ctx.createBufferSource();
    src.buffer = noiseBuffer;
    
    const filt = this.ctx.createBiquadFilter();
    filt.type = filterType;
    filt.frequency.value = freq;
    filt.Q.value = q;
    
    src.connect(filt);
    filt.connect(env);
    
    // Phase 3: Add 1-2ms attack and smoother envelope
    env.gain.setValueAtTime(0, now);
    env.gain.setTargetAtTime(this.volume, now, 0.002); // 2ms attack
    env.gain.setTargetAtTime(0.01, now + decay * 0.3, decay * 0.2); // Smoother decay
    
    src.start(now);
    src.stop(now + decay);
  }

  setParameter(name: string, value: any) {
    switch (name) {
      case "volume":
        this.volume = value;
        (this.outputNode as GainNode).gain.value = value;
        break;
      case "pitch":
        this.pitch = value;
        break;
      case "selectedDrum":
        this.selectedDrum = value;
        break;
    }
  }

  dispose() {
    this.stopMonitoring();
    this.noiseBuffers.clear();
    super.dispose();
  }
}
