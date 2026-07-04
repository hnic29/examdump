import { useState, useEffect, useRef, useCallback } from 'react';

interface UseTimerReturn {
  secondsLeft: number;
  isRunning: boolean;
  start: () => void;
  pause: () => void;
  resume: () => void;
  reset: (seconds: number) => void;
}

export function useTimer(initialSeconds: number, onExpire: () => void): UseTimerReturn {
  const [secondsLeft, setSecondsLeft] = useState(initialSeconds);
  const [paused, setPaused] = useState(true);
  const onExpireRef = useRef(onExpire);
  const secondsRef = useRef(secondsLeft);
  onExpireRef.current = onExpire;
  secondsRef.current = secondsLeft;

  useEffect(() => {
    if (paused || secondsRef.current <= 0) return;

    const id = setInterval(() => {
      const next = secondsRef.current - 1;
      secondsRef.current = next;
      if (next <= 0) {
        clearInterval(id);
        setSecondsLeft(0);
        setPaused(true);
        onExpireRef.current();
      } else {
        setSecondsLeft(next);
      }
    }, 1000);

    return () => clearInterval(id);
  }, [paused]);

  const start = useCallback(() => setPaused(false), []);
  const pause = useCallback(() => setPaused(true), []);
  const resume = useCallback(() => setPaused(false), []);
  const reset = useCallback((s: number) => {
    setSecondsLeft(s);
    secondsRef.current = s;
    setPaused(true);
  }, []);

  return { secondsLeft, isRunning: !paused && secondsLeft > 0, start, pause, resume, reset };
}
