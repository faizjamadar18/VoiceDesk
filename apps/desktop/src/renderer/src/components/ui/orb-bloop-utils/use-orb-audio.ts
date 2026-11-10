import { useEffect, useRef, type RefObject } from "react";

export interface OrbAudioAnalyzer {
  update: () => void;
  allAvg: number;
  lowAvg: number;
  midAvg: number;
  highAvg: number;
}

export function useOrbAudio(
  mode: "ambient" | "mic" | "file",
  audioElement?: RefObject<HTMLAudioElement | null>,
  audioSrc?: string
): RefObject<OrbAudioAnalyzer | null> {
  const analyzerRef = useRef<OrbAudioAnalyzer | null>(null);

  useEffect(() => {
    let audioCtx: AudioContext | null = null;
    let analyzerNode: AnalyserNode | null = null;
    let sourceNode: MediaStreamAudioSourceNode | MediaElementAudioSourceNode | null = null;
    let stream: MediaStream | null = null;

    const dataArray = new Uint8Array(64);

    const analyzerObj: OrbAudioAnalyzer = {
      allAvg: 0,
      lowAvg: 0,
      midAvg: 0,
      highAvg: 0,
      update: () => {
        if (!analyzerNode) return;
        analyzerNode.getByteFrequencyData(dataArray);
        let sum = 0;
        let low = 0;
        let mid = 0;
        let high = 0;
        const len = dataArray.length;
        for (let i = 0; i < len; i++) {
          const val = dataArray[i];
          sum += val;
          if (i < len * 0.25) low += val;
          else if (i < len * 0.65) mid += val;
          else high += val;
        }
        analyzerObj.allAvg = sum / len;
        analyzerObj.lowAvg = low / (len * 0.25);
        analyzerObj.midAvg = mid / (len * 0.4);
        analyzerObj.highAvg = high / (len * 0.35);
      },
    };

    if (mode === "mic") {
      navigator.mediaDevices
        ?.getUserMedia({ audio: true, video: false })
        .then((micStream) => {
          stream = micStream;
          audioCtx = new AudioContext();
          sourceNode = audioCtx.createMediaStreamSource(micStream);
          analyzerNode = audioCtx.createAnalyser();
          analyzerNode.fftSize = 128;
          sourceNode.connect(analyzerNode);
          analyzerRef.current = analyzerObj;
        })
        .catch((err) => {
          console.warn("[OrbAudio] Mic access failed", err);
        });
    } else if (mode === "file" && audioElement?.current) {
      try {
        audioCtx = new AudioContext();
        sourceNode = audioCtx.createMediaElementSource(audioElement.current);
        analyzerNode = audioCtx.createAnalyser();
        analyzerNode.fftSize = 128;
        sourceNode.connect(analyzerNode);
        analyzerNode.connect(audioCtx.destination);
        analyzerRef.current = analyzerObj;
      } catch (err) {
        console.warn("[OrbAudio] MediaElementSource failed", err);
      }
    } else {
      analyzerRef.current = null;
    }

    return () => {
      stream?.getTracks().forEach((track) => track.stop());
      sourceNode?.disconnect();
      analyzerNode?.disconnect();
      if (audioCtx && audioCtx.state !== "closed") {
        audioCtx.close().catch(() => {});
      }
      analyzerRef.current = null;
    };
  }, [mode, audioElement, audioSrc]);

  return analyzerRef;
}

export function useCorsAudioSrc(src?: string): string {
  return src || "";
}

