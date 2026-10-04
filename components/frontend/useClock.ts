"use client";
import { useEffect, useState } from "react";
export function useClock() {
  const [now, setNow] = useState(() => new Date("2026-10-03T19:00:00-07:00"));
  const [ready, setReady] = useState(false);
  useEffect(() => {
    const update = () => {
      setNow(new Date());
      setReady(true);
    };
    update();
    const timer = setInterval(update, 30_000);
    document.addEventListener("visibilitychange", update);
    window.addEventListener("focus", update);
    return () => {
      clearInterval(timer);
      document.removeEventListener("visibilitychange", update);
      window.removeEventListener("focus", update);
    };
  }, []);
  return { now, ready };
}
