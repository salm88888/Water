/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * Miyahna - Google Maps Platform APIProvider & Configuration Context
 */

import React, { createContext, useContext, useEffect, useState } from 'react';
import { APIProvider } from '@vis.gl/react-google-maps';

interface GoogleMapsConfigState {
  hasKey: boolean;
  isLoadingKey: boolean;
  loadError: boolean;
}

const GoogleMapsConfigContext = createContext<GoogleMapsConfigState>({
  hasKey: false,
  isLoadingKey: false,
  loadError: false,
});

export function useGoogleMapsConfig() {
  return useContext(GoogleMapsConfigContext);
}

const STATIC_BUILD_KEY =
  (typeof import.meta !== 'undefined' &&
    import.meta.env &&
    typeof import.meta.env.VITE_GOOGLE_MAPS_API_KEY === 'string' &&
    import.meta.env.VITE_GOOGLE_MAPS_API_KEY.trim()) ||
  '';

export const GoogleMapsProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [apiKey, setApiKey] = useState<string>(STATIC_BUILD_KEY);
  const [isLoadingKey, setIsLoadingKey] = useState<boolean>(!STATIC_BUILD_KEY);
  const [loadError, setLoadError] = useState<boolean>(false);

  useEffect(() => {
    if (STATIC_BUILD_KEY) return;
    let active = true;

    fetch('/api/maps-config')
      .then((res) => (res.ok ? res.json() : null))
      .then((payload) => {
        if (!active) return;
        const runtimeKey = typeof payload?.apiKey === 'string' ? payload.apiKey.trim() : '';
        if (runtimeKey) {
          setApiKey(runtimeKey);
        }
      })
      .catch(() => {
        // Offline or server unavailable; fallback gracefully without crashing UI
      })
      .finally(() => {
        if (active) setIsLoadingKey(false);
      });

    return () => {
      active = false;
    };
  }, []);

  const contextValue: GoogleMapsConfigState = {
    hasKey: Boolean(apiKey),
    isLoadingKey,
    loadError,
  };

  if (!apiKey) {
    return (
      <GoogleMapsConfigContext.Provider value={contextValue}>
        {children}
      </GoogleMapsConfigContext.Provider>
    );
  }

  return (
    <GoogleMapsConfigContext.Provider value={contextValue}>
      <APIProvider
        apiKey={apiKey}
        libraries={['marker']}
        language="ar"
        region="YE"
        onError={() => setLoadError(true)}
      >
        {children}
      </APIProvider>
    </GoogleMapsConfigContext.Provider>
  );
};
