import { useState, useEffect, useCallback } from 'react';
import { hubService } from '../services/hub.service';
import { HubDTO, HubListQuery, CreateHubInput, UpdateHubInput } from '../types/fleet.types';

export function useHubs(initialQuery: HubListQuery = {}) {
  const [hubs, setHubs] = useState<HubDTO[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState<HubListQuery>(initialQuery);
  const [meta, setMeta] = useState({ page: 1, limit: 20, total: 0, totalPages: 1 });

  const fetchHubs = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await hubService.getHubs(query);
      setHubs(res.data);
      setMeta(res.meta);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load hubs');
    } finally {
      setLoading(false);
    }
  }, [query]);

  useEffect(() => {
    fetchHubs();
  }, [fetchHubs]);

  const createHub = async (input: CreateHubInput) => {
    const hub = await hubService.createHub(input);
    await fetchHubs();
    return hub;
  };

  const updateHub = async (hubId: string, input: UpdateHubInput) => {
    const hub = await hubService.updateHub(hubId, input);
    await fetchHubs();
    return hub;
  };

  return {
    hubs,
    loading,
    error,
    meta,
    query,
    setQuery,
    refetch: fetchHubs,
    createHub,
    updateHub
  };
}
