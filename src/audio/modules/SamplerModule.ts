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

  constructor(ctx: AudioContext) {
    super(ctx);
    
    // Create gain node for output
    this.gainNode = ctx.createGain();
    this.gainNode.gain.value = 0.8;
    
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
      console.log('SamplerModule: Audio loaded successfully', this.recordedBuffer.duration);
    } catch (error) {
      console.error('SamplerModule: Failed to decode audio', error);
    }
  }

  startPlayback() {
    if (!this.recordedBuffer || this.isPlayingBack) return;

    this.stopPlayback(); // Stop any existing playback

    this.bufferSource = this.ctx.createBufferSource();
    this.bufferSource.buffer = this.recordedBuffer;
    this.bufferSource.loop = this.isLooping;
    this.bufferSource.connect(this.gainNode);
    
    this.bufferSource.onended = () => {
      if (!this.isLooping) {
        this.isPlayingBack = false;
      }
    };

    this.bufferSource.start(0);
    this.isPlayingBack = true;
    this.isActive = true;
    console.log('SamplerModule: Playback started, loop:', this.isLooping);
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
    }
  }

  setVolume(volume: number) {
    this.gainNode.gain.value = volume;
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
    if (name === "volume") {
      this.setVolume(value);
    } else if (name === "loop") {
      this.setLoop(value);
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
