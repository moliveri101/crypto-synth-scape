import { Info } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";

export const InfoDialog = () => {
  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button size="lg" variant="outline" className="w-12 px-0 shadow-glow">
          <Info className="w-5 h-5" />
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl max-h-[80vh]">
        <DialogHeader>
          <DialogTitle className="text-2xl">Crypto Audio Modular Synthesizer</DialogTitle>
          <DialogDescription>
            A visual audio synthesis environment powered by cryptocurrency data and satellite tracking
          </DialogDescription>
        </DialogHeader>
        <ScrollArea className="h-[60vh] pr-4">
          <div className="space-y-6 text-sm">
            <section>
              <h3 className="font-semibold text-lg mb-2 text-foreground">What is this?</h3>
              <p className="text-muted-foreground">
                This is a modular audio synthesizer that transforms real-time cryptocurrency prices and 
                satellite orbital data into sound. Create complex audio chains by connecting modules together, 
                then route them through effects and mixers to craft unique sonic landscapes driven by live data.
              </p>
            </section>

            <section>
              <h3 className="font-semibold text-lg mb-2 text-foreground">Getting Started</h3>
              <ol className="list-decimal list-inside space-y-2 text-muted-foreground">
                <li>Add a <strong>Crypto Module</strong> or <strong>Satellite</strong> as your audio source</li>
                <li>Add a <strong>Mixer</strong> to control and combine multiple sources</li>
                <li>Add <strong>Speakers</strong> as your audio output destination</li>
                <li><strong>Connect modules</strong> by dragging from output (right) to input (left) handles</li>
                <li>Press <strong>Play</strong> on the mixer to start generating sound</li>
              </ol>
            </section>

            <section>
              <h3 className="font-semibold text-lg mb-2 text-foreground">Module Types</h3>
              <div className="space-y-3">
                <div>
                  <h4 className="font-medium text-foreground">Audio Sources</h4>
                  <ul className="list-disc list-inside ml-4 text-muted-foreground space-y-1">
                    <li><strong>Crypto:</strong> Generates oscillator tones modulated by cryptocurrency price changes</li>
                    <li><strong>Satellite:</strong> Creates pulses and tones based on satellite speed and altitude</li>
                    <li><strong>Sampler:</strong> Record audio from your microphone and loop it</li>
                    <li><strong>Sequencer:</strong> Programmable 16-step pattern generator</li>
                    <li><strong>Drums:</strong> Trigger various drum and percussion sounds</li>
                  </ul>
                </div>
                <div>
                  <h4 className="font-medium text-foreground">Processing</h4>
                  <ul className="list-disc list-inside ml-4 text-muted-foreground space-y-1">
                    <li><strong>Mixers:</strong> Combine and balance multiple audio sources (4, 8, 16, or 32 tracks)</li>
                    <li><strong>Effects:</strong> Time-based (reverb, delay), filters (EQ, low/high-pass), distortion, modulation, and more</li>
                  </ul>
                </div>
                <div>
                  <h4 className="font-medium text-foreground">Outputs</h4>
                  <ul className="list-disc list-inside ml-4 text-muted-foreground">
                    <li><strong>Speakers:</strong> Final audio output with master volume control</li>
                  </ul>
                </div>
              </div>
            </section>

            <section>
              <h3 className="font-semibold text-lg mb-2 text-foreground">Connection Guide</h3>
              <ul className="list-disc list-inside space-y-2 text-muted-foreground">
                <li><strong>Creating connections:</strong> Drag from a module's output handle (right side) to another module's input handle (left side)</li>
                <li><strong>Deleting connections:</strong> Click on a connection line to select it, then press Delete or Backspace</li>
                <li><strong>Multiple selections:</strong> Hold Ctrl/Cmd to select multiple connections at once</li>
                <li><strong>Valid chains:</strong> Sources → Effects → Mixer → Speakers</li>
              </ul>
            </section>

            <section>
              <h3 className="font-semibold text-lg mb-2 text-foreground">Live Data</h3>
              <ul className="list-disc list-inside space-y-2 text-muted-foreground">
                <li><strong>Live Prices:</strong> Toggle the "Live Prices" button to enable real-time cryptocurrency price updates</li>
                <li><strong>Satellites:</strong> Choose from popular satellites like the ISS, Hubble, or Starlink - their orbital data continuously updates the audio</li>
              </ul>
            </section>

            <section>
              <h3 className="font-semibold text-lg mb-2 text-foreground">Tips</h3>
              <ul className="list-disc list-inside space-y-2 text-muted-foreground">
                <li>Start with simple chains before creating complex patches</li>
                <li>Use multiple mixers to create sub-mixes and better organize your sound</li>
                <li>Experiment with different effect chains - order matters!</li>
                <li>Collapse modules to keep your workspace tidy using the chevron button</li>
                <li>Try connecting crypto modules to sequencers for data-driven patterns</li>
                <li>Layer multiple satellites for evolving ambient soundscapes</li>
              </ul>
            </section>
          </div>
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
};
