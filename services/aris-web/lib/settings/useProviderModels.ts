'use client';

import { useCallback, useEffect, useState } from 'react';
import { withAppBasePath } from '@/lib/routing/appPath';
import type { ModelSettingsResponse } from './providerModels';

export interface UseProviderModelsResult {
  data: ModelSettingsResponse | null;
  loading: boolean;
  error: Error | null;
  reload: () => Promise<void>;
}

export async function fetchProviderModels(): Promise<ModelSettingsResponse> {
  const res = await fetch(withAppBasePath('/api/settings/models'), { credentials: 'include' });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return (await res.json()) as ModelSettingsResponse;
}

export function useProviderModels(): UseProviderModelsResult {
  const [data, setData] = useState<ModelSettingsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      const json = await fetchProviderModels();
      setData(json);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e : new Error(String(e)));
      setData(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  return { data, loading, error, reload };
}
