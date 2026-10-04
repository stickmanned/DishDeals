"use client";
import { useCallback, useState } from "react";
import { DEFAULT_ORIGIN, type NearbyOrigin } from "@/lib/frontend/nearby";

export type LocationStatus = "default" | "locating" | "device" | "denied" | "unavailable";

/**
 * Nearby anchor for Discover. It starts at a Burnaby default and only asks the browser for the
 * visitor's position after an explicit tap. The position stays in this tab's memory: it is not
 * stored or sent anywhere.
 */
export function useUserLocation() {
  const [origin, setOrigin] = useState<NearbyOrigin>(DEFAULT_ORIGIN);
  const [status, setStatus] = useState<LocationStatus>("default");

  const locate = useCallback(() => {
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      setStatus("unavailable");
      return;
    }
    setStatus("locating");
    navigator.geolocation.getCurrentPosition(
      ({ coords }) => {
        setOrigin({ lat: coords.latitude, lng: coords.longitude, source: "device", label: "Your location" });
        setStatus("device");
      },
      (error) => setStatus(error.code === error.PERMISSION_DENIED ? "denied" : "unavailable"),
      { enableHighAccuracy: false, maximumAge: 5 * 60_000, timeout: 10_000 },
    );
  }, []);

  const reset = useCallback(() => {
    setOrigin(DEFAULT_ORIGIN);
    setStatus("default");
  }, []);

  return { origin, status, locate, reset };
}
