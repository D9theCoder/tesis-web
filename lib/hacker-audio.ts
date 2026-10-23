/**
 * Tiny Web Audio synthesizer for the hacker session cinematics. No audio files:
 * every sound is a short oscillator with an exponential envelope through one
 * shared master gain. An instance is created synchronously inside the click
 * that selected the theme (or inside the overlay's sound toggle click), so
 * browser autoplay rules have a user gesture on record.
 *
 * Nothing here touches the DOM or React. `dispose` stops all live voices,
 * disconnects the master gain, and closes the context.
 */

export type HackerAudio = {
  /** Short phosphor beep for each scrolling log line (opening reel). */
  splashBeep(step: number): void;
  /** Rising tone under the "ACCESS GRANTED" slam. */
  splashSlam(): void;
  /** Falling tone under the CRT power-down collapse. */
  powerCollapse(): void;
  /** One quiet blip confirming the sound toggle flipped on. */
  confirm(): void;
  /** Stop every voice, drop the master gain, and close the context. */
  dispose(): void;
};

type WebkitWindow = Window & { webkitAudioContext?: typeof AudioContext };

type BeepSpec = {
  freq: number;
  freqEnd?: number;
  at?: number;
  dur: number;
  type: OscillatorType;
  vol: number;
};

const LOG_BEEP_FREQS: readonly number[] = [880, 1174, 1480, 1975];

export function createHackerAudio(): HackerAudio | null {
  if (typeof window === "undefined") return null;
  const Ctor = window.AudioContext ?? (window as WebkitWindow).webkitAudioContext;
  if (typeof Ctor !== "function") return null;

  let context: AudioContext;
  try {
    context = new Ctor();
  } catch {
    return null;
  }
  if (context.state === "suspended") {
    // Resume is legal here: creation always happens inside a user gesture.
    void context.resume().catch(() => {});
  }

  const master = context.createGain();
  master.gain.value = 0.16;
  master.connect(context.destination);

  const live = new Set<OscillatorNode>();

  const beep = (spec: BeepSpec) => {
    try {
      if (context.state !== "running") return;
      const at = context.currentTime + (spec.at ?? 0);
      const osc = context.createOscillator();
      osc.type = spec.type;
      osc.frequency.setValueAtTime(Math.max(1, spec.freq), at);
      if (spec.freqEnd !== undefined) {
        osc.frequency.exponentialRampToValueAtTime(Math.max(1, spec.freqEnd), at + spec.dur);
      }
      const gain = context.createGain();
      gain.gain.setValueAtTime(0.0001, at);
      gain.gain.exponentialRampToValueAtTime(spec.vol, at + 0.008);
      gain.gain.exponentialRampToValueAtTime(0.0001, at + spec.dur);
      osc.connect(gain);
      gain.connect(master);
      osc.start(at);
      osc.stop(at + spec.dur + 0.03);
      live.add(osc);
      osc.onended = () => {
        live.delete(osc);
      };
    } catch {
      /* Audio is decorative; any failure stays silent. */
    }
  };

  return {
    splashBeep(step: number) {
      const index = ((step % LOG_BEEP_FREQS.length) + LOG_BEEP_FREQS.length) % LOG_BEEP_FREQS.length;
      beep({ freq: LOG_BEEP_FREQS[index] ?? 880, dur: 0.045, type: "square", vol: 0.45 });
    },
    splashSlam() {
      beep({ freq: 110, freqEnd: 780, dur: 0.22, type: "sawtooth", vol: 0.8 });
      beep({ freq: 660, at: 0.21, dur: 0.07, type: "square", vol: 0.5 });
    },
    powerCollapse() {
      beep({ freq: 520, freqEnd: 44, dur: 0.3, type: "sawtooth", vol: 0.75 });
      beep({ freq: 210, freqEnd: 30, at: 0.04, dur: 0.36, type: "sine", vol: 0.6 });
    },
    confirm() {
      beep({ freq: 1320, dur: 0.06, type: "triangle", vol: 0.35 });
    },
    dispose() {
      for (const osc of live) {
        try {
          osc.onended = null;
          osc.stop();
        } catch {
          /* Already stopped. */
        }
      }
      live.clear();
      try {
        master.disconnect();
      } catch {
        /* Already disconnected. */
      }
      void context.close().catch(() => {});
    },
  };
}
