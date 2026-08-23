import { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../services/api';
import { useScanCancel } from './useScanReset';
import { useScanWebSocket } from './useScanWebSocket';
import type { Scan, ScanStage } from '../types';

export interface ScanData {
  scan: Scan | undefined;
  stages: ScanStage[];
}

export function useScanStatus() {
  const { scanId } = useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  
  const [expandedStages, setExpandedStages] = useState<Record<string, boolean>>({});
  const [showErrorModal, setShowErrorModal] = useState(false);
  const [showCancelConfirm, setShowCancelConfirm] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<Date>(new Date());

  // Tracks live WebSocket connectivity for the poll-interval decision below. A ref is
  // used because `useScanWebSocket` is called after this query, but `refetchInterval`
  // is a function evaluated at refetch time, so it reads the up-to-date value.
  const wsConnectedRef = useRef(false);

  const toggleStage = (stageId: string) => {
    setExpandedStages(prev => ({ ...prev, [stageId]: !prev[stageId] }));
  };

  const { data: scanData, isLoading, refetch, isRefetching } = useQuery({
    queryKey: ['scan', scanId],
    queryFn: async () => {
      if (!scanId) return null;
      const scan = await api.scans.get(scanId);
      return { scan, stages: scan?.results || [] };
    },
    refetchInterval: (query) => {
      const data = query.state.data as ScanData;
      if (data?.scan && ['COMPLETED', 'FAILED', 'CANCELLED'].includes(data.scan.state)) {
        return false;
      }
      // When the WebSocket is live it already pushes updates into this query's cache,
      // so drop to an infrequent safety-net poll (30s) instead of hammering every 3s.
      // If the socket drops, we fall back to the responsive 3s poll automatically.
      return wsConnectedRef.current ? 30000 : 3000;
    },
    enabled: !!scanId,
  });

  const scan = scanData?.scan;
  const stages = scanData?.stages || [];

  useEffect(() => {
    if (scan?.state === 'FAILED' && scan?.error) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setShowErrorModal(true);
    }
  }, [scan, scan?.error]);

  const cancelMutation = useScanCancel();

  const { connected: wsConnected, connecting: wsConnecting } = useScanWebSocket(scanId, undefined, {
    onMessage: (message) => {
      console.log('Scan real-time update received:', message);
      queryClient.setQueryData(['scan', scanId], {
        scan: message.data,
        stages: message.data.results || []
      });
      setLastUpdated(new Date());
    }
  });

  useEffect(() => {
    wsConnectedRef.current = wsConnected;
  }, [wsConnected]);

  useEffect(() => {
    if (scanData) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setLastUpdated(new Date());
    }
  }, [scanData]);

  const handleCancel = async () => {
    if (!scanId) return;
    try {
      await cancelMutation.mutateAsync(scanId);
      await refetch();
    } catch (error) {
      console.error('Cancel failed:', error);
    }
  };

  return {
    scanId,
    scan,
    stages,
    isLoading,
    refetch,
    isRefetching,
    expandedStages,
    toggleStage,
    showErrorModal,
    setShowErrorModal,
    showCancelConfirm,
    setShowCancelConfirm,
    lastUpdated,
    wsConnected,
    wsConnecting,
    cancelMutation,
    handleCancel,
    navigate,
  };
}