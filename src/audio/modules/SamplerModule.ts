import { AudioModule } from "../AudioModule";

export class SamplerModule extends AudioModule {
  private gainNode: GainNode;
  private recorder: MediaRecorder | null = null;
  private audioChunks: Blob[] = [];
  private recordedBuffer: AudioBuffer | null = null;
  private bufferSource: AudioBufferSourceNode | null = null;
  private isLooping: boolean = false;
  private isRecording: boolean = false;
  private isPlayingBack: boolean = false;
  private stream: MediaStream | null = null;
  
  // Professional sampler controls
  private playbackRate: number = 1.0; // Pitch control (0.5 = -1 octave, 2.0 = +1 octave)
  private loopStart: number = 0; // Loop start point in seconds
  private loopEnd: number = 0; // Loop end point in seconds
  private reverse: boolean = false; // Reverse playback
  private sampleStart: number = 0; // Sample trim start
  private sampleEnd: number = 1; // Sample trim end (0-1 normalized)

  constructor(ctx: AudioContext) {
    super(ctx);
    
    // Create gain node for output with safer default volume
    this.gainNode = ctx.createGain();
    this.gainNode.gain.value = 0.6; // Reduced from 0.8 to prevent clipping
    
    // Set input/output nodes
    this.inputNode = this.gainNode;
    this.outputNode = this.gainNode;
  }

  async startRecording(): Promise<boolean> {
    if (this.isRecording) return false;

    try {
      // Request microphone access
      this.stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      
      // Create MediaRecorder
      this.recorder = new MediaRecorder(this.stream);
      this.audioChunks = [];

      this.recorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          this.audioChunks.push(event.data);
        }
      };

      this.recorder.onstop = async () => {
        const audioBlob = new Blob(this.audioChunks, { type: 'audio/webm' });
        await this.loadAudioFromBlob(audioBlob);
      };

      this.recorder.start();
      this.isRecording = true;
      console.log('SamplerModule: Recording started');
      return true;
    } catch (error) {
      console.error('SamplerModule: Failed to start recording', error);
      return false;
    }
  }

  stopRecording() {
    if (this.recorder && this.isRecording) {
      this.recorder.stop();
      this.isRecording = false;
      
      // Stop all tracks in the stream
      if (this.stream) {
        this.stream.getTracks().forEach(track => track.stop());
        this.stream = null;
      }
      
      console.log('SamplerModule: Recording stopped');
    }
  }

  private async loadAudioFromBlob(blob: Blob) {
    try {
      const arrayBuffer = await blob.arrayBuffer();
      this.recordedBuffer = await this.ctx.decodeAudioData(arrayBuffer);
      
      // Initialize loop points to full sample
      if (this.recordedBuffer) {
        this.loopStart = 0;
        this.loopEnd = this.recordedBuffer.duration;
        this.sampleStart = 0;
        this.sampleEnd = 1;
      }
      
      console.log('SamplerModule: Audio loaded successfully', this.recordedBuffer.duration);
    } catch (error) {
      console.error('SamplerModule: Failed to decode audio', error);
    }
  }

  startPlayback() {
    if (!this.recordedBuffer || this.isPlayingBack) return;

    this.stopPlayback(); // Stop any existing playback

    // Create buffer source with professional sampler features
    this.bufferSource = this.ctx.createBufferSource();
    
    // Handle reverse playback
    if (this.reverse && this.recordedBuffer) {
      this.bufferSource.buffer = this.reverseBuffer(this.recordedBuffer);
    } else {
      this.bufferSource.buffer = this.recordedBuffer;
    }
    
    // Set playback rate (pitch control)
    this.bufferSource.playbackRate.value = this.playbackRate;
    
    // Set loop points
    this.bufferSource.loop = this.isLooping;
    if (this.isLooping && this.recordedBuffer) {
      this.bufferSource.loopStart = this.loopStart;
      this.bufferSource.loopEnd = this.loopEnd;
    }
    
    this.bufferSource.connect(this.gainNode);
    
    this.bufferSource.onended = () => {
      if (!this.isLooping) {
        this.isPlayingBack = false;
      }
    };

    // Calculate start offset based on sample trim
    const duration = this.recordedBuffer.duration;
    const offset = this.sampleStart * duration;
    const playDuration = (this.sampleEnd - this.sampleStart) * duration;
    
    if (this.isLooping) {
      this.bufferSource.start(0, offset);
    } else {
      this.bufferSource.start(0, offset, playDuration);
    }
    
    this.isPlayingBack = true;
    this.isActive = true;
    console.log('SamplerModule: Playback started, rate:', this.playbackRate, 'loop:', this.isLooping, 'reverse:', this.reverse);
  }

  private reverseBuffer(buffer: AudioBuffer): AudioBuffer {
    const reversedBuffer = this.ctx.createBuffer(
      buffer.numberOfChannels,
      buffer.length,
      buffer.sampleRate
    );

    for (let channel = 0; channel < buffer.numberOfChannels; channel++) {
      const inputData = buffer.getChannelData(channel);
      const outputData = reversedBuffer.getChannelData(channel);
      
      for (let i = 0; i < buffer.length; i++) {
        outputData[i] = inputData[buffer.length - 1 - i];
      }
    }

    return reversedBuffer;
  }

  stopPlayback() {
    if (this.bufferSource) {
      try {
        this.bufferSource.stop();
      } catch (e) {
        // Already stopped
      }
      this.bufferSource.disconnect();
      this.bufferSource = null;
    }
    this.isPlayingBack = false;
    this.isActive = false;
  }

  setLoop(loop: boolean) {
    this.isLooping = loop;
    if (this.bufferSource) {
      this.bufferSource.loop = loop;
      if (loop && this.recordedBuffer) {
        this.bufferSource.loopStart = this.loopStart;
        this.bufferSource.loopEnd = this.loopEnd;
      }
    }
  }

  setVolume(volume: number) {
    // Clamp volume to prevent clipping
    this.gainNode.gain.value = Math.max(0, Math.min(1, volume));
  }

  setPitch(rate: number) {
    // Clamp playback rate to reasonable values (0.25x to 4x)
    this.playbackRate = Math.max(0.25, Math.min(4, rate));
    if (this.bufferSource) {
      this.bufferSource.playbackRate.value = this.playbackRate;
    }
  }

  setLoopStart(time: number) {
    if (this.recordedBuffer) {
      this.loopStart = Math.max(0, Math.min(this.recordedBuffer.duration, time));
      if (this.bufferSource && this.isLooping) {
        this.bufferSource.loopStart = this.loopStart;
      }
    }
  }

  setLoopEnd(time: number) {
    if (this.recordedBuffer) {
      this.loopEnd = Math.max(this.loopStart, Math.min(this.recordedBuffer.duration, time));
      if (this.bufferSource && this.isLooping) {
        this.bufferSource.loopEnd = this.loopEnd;
      }
    }
  }

  setReverse(reverse: boolean) {
    this.reverse = reverse;
    // Need to restart playback for reverse to take effect
    if (this.isPlayingBack) {
      this.stopPlayback();
      this.startPlayback();
    }
  }

  setSampleStart(normalized: number) {
    // 0-1 normalized position
    this.sampleStart = Math.max(0, Math.min(1, normalized));
  }

  setSampleEnd(normalized: number) {
    // 0-1 normalized position
    this.sampleEnd = Math.max(this.sampleStart, Math.min(1, normalized));
  }

  getDuration(): number {
    return this.recordedBuffer?.duration || 0;
  }

  getLoopStart(): number {
    return this.loopStart;
  }

  getLoopEnd(): number {
    return this.loopEnd;
  }

  getPitch(): number {
    return this.playbackRate;
  }

  getReverse(): boolean {
    return this.reverse;
  }

  getIsRecording(): boolean {
    return this.isRecording;
  }

  getIsPlaying(): boolean {
    return this.isPlayingBack;
  }

  hasRecording(): boolean {
    return this.recordedBuffer !== null;
  }

  start() {
    this.isActive = true;
    if (this.recordedBuffer) {
      this.startPlayback();
    }
  }

  stop() {
    this.stopPlayback();
    this.isActive = false;
  }

  setParameter(name: string, value: any) {
    switch (name) {
      case "volume":
        this.setVolume(value);
        break;
      case "loop":
        this.setLoop(value);
        break;
      case "pitch":
        this.setPitch(value);
        break;
      case "loopStart":
        this.setLoopStart(value);
        break;
      case "loopEnd":
        this.setLoopEnd(value);
        break;
      case "reverse":
        this.setReverse(value);
        break;
      case "sampleStart":
        this.setSampleStart(value);
        break;
      case "sampleEnd":
        this.setSampleEnd(value);
        break;
    }
  }

  dispose() {
    this.stopRecording();
    this.stopPlayback();
    
    if (this.stream) {
      this.stream.getTracks().forEach(track => track.stop());
      this.stream = null;
    }
    
    this.gainNode.disconnect();
    this.recordedBuffer = null;
    this.audioChunks = [];
    super.dispose();
  }
}
