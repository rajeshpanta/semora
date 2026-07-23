import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback, useEffect, useRef } from 'react';
import { AppState } from 'react-native';
import {
  listCollaborations,
  subscribeToCollaboration,
  syncCollaborationToPlanner,
} from '@/lib/collaboration';
import { isDeviceOnline } from '@/lib/offlineSync';

/**
 * Keeps shared deadlines and group assignments current even when the student
 * is not looking at the collaboration screen.
 */
export function CollaborationSyncBridge({
  userId,
  semesterId,
}: {
  userId: string | null;
  semesterId: string | null;
}) {
  const queryClient = useQueryClient();
  const running = useRef(new Set<string>());
  const collaborations = useQuery({
    queryKey: ['collaborations', userId],
    queryFn: () => listCollaborations(userId!),
    enabled: !!userId,
  });
  const collaborationRows = collaborations.data;
  const refetchCollaborations = collaborations.refetch;

  const syncOne = useCallback(async (id: string) => {
    if (!semesterId || !isDeviceOnline() || running.current.has(id)) return;
    running.current.add(id);
    try {
      await syncCollaborationToPlanner(id, semesterId);
      queryClient.invalidateQueries({ queryKey: ['tasks'] });
      queryClient.invalidateQueries({ queryKey: ['taskStats'] });
      queryClient.invalidateQueries({ queryKey: ['courses'] });
      queryClient.invalidateQueries({ queryKey: ['collaboration', id] });
    } catch {
      // The course space remains available for an explicit retry. Background
      // collaboration health should never interrupt the student's current flow.
    } finally {
      running.current.delete(id);
    }
  }, [semesterId, queryClient]);

  useEffect(() => {
    if (!semesterId) return;
    collaborationRows?.forEach((row) => {
      syncOne(row.id).catch(() => {});
    });
  }, [collaborationRows, semesterId, syncOne]);

  useEffect(() => {
    if (!userId || !collaborationRows?.length) return;
    const unsubscribe = collaborationRows.map((row) =>
      subscribeToCollaboration(
        row.id,
        () => syncOne(row.id).catch(() => {}),
        'planner',
      ),
    );
    return () => unsubscribe.forEach((stop) => stop());
  }, [userId, collaborationRows, syncOne]);

  useEffect(() => {
    if (!userId) return;
    const subscription = AppState.addEventListener('change', (state) => {
      if (state !== 'active' || !isDeviceOnline()) return;
      refetchCollaborations()
        .then(({ data }) => data?.forEach((row) => syncOne(row.id).catch(() => {})))
        .catch(() => {});
    });
    return () => subscription.remove();
  }, [userId, refetchCollaborations, syncOne]);

  return null;
}
