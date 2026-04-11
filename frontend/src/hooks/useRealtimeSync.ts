import { useEffect, useRef } from 'react';
import { supabase } from '../lib/supabase';
import { queryClient } from '../query-client';
import { missionKeys } from './useMissions';
import { emergencyKeys } from './useEmergencies';
import { notificationKeys } from './useNotifications';
import { profileKeys } from './useProfile';
import { propertyKeys } from './useProperties';
import type { RealtimeChannel } from '@supabase/supabase-js';

/**
 * Global Realtime subscription hook.
 * Listens to postgres_changes on missions, emergency_requests, and notifications tables.
 * Invalidates the corresponding React Query cache keys so the UI stays in sync
 * without manual refresh.
 *
 * Should be mounted once at the app root (e.g. in _layout.tsx).
 */
export function useRealtimeSync() {
  const channelRef = useRef<RealtimeChannel | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function setup() {
      // Get the current session to know if the user is authenticated
      const {
        data: { session },
      } = await supabase.auth.getSession();

      // Only subscribe when the user is logged in
      if (!session?.user || cancelled) return;

      const userId = session.user.id;

      const channel = supabase
        .channel('realtime-sync')
        // ── Missions: UPDATE events ──
        .on(
          'postgres_changes',
          {
            event: 'UPDATE',
            schema: 'public',
            table: 'missions',
          },
          (payload) => {
            const missionId = (payload.new as { id?: string }).id;

            // Invalidate all mission lists (owner dashboard, provider feed, etc.)
            queryClient.invalidateQueries({ queryKey: missionKeys.all });

            // Invalidate the specific mission detail if we have an id
            if (missionId) {
              queryClient.invalidateQueries({
                queryKey: missionKeys.detail(missionId),
              });
            }

            // Also invalidate the owner dashboard view
            queryClient.invalidateQueries({
              queryKey: missionKeys.ownerDashboard,
            });

            // Provider stats depend on mission counts and earnings
            queryClient.invalidateQueries({ queryKey: profileKeys.providerStats });
          },
        )
        // ── Emergency requests: INSERT events ──
        .on(
          'postgres_changes',
          {
            event: 'INSERT',
            schema: 'public',
            table: 'emergency_requests',
          },
          () => {
            queryClient.invalidateQueries({ queryKey: emergencyKeys.all });
            queryClient.invalidateQueries({ queryKey: profileKeys.providerStats });
          },
        )
        // ── Emergency requests: UPDATE events ──
        .on(
          'postgres_changes',
          {
            event: 'UPDATE',
            schema: 'public',
            table: 'emergency_requests',
          },
          (payload) => {
            const emergencyId = (payload.new as { id?: string }).id;

            queryClient.invalidateQueries({ queryKey: emergencyKeys.all });

            if (emergencyId) {
              queryClient.invalidateQueries({
                queryKey: emergencyKeys.detail(emergencyId),
              });
            }

            queryClient.invalidateQueries({ queryKey: profileKeys.providerStats });
          },
        )
        // ── Mission applications: INSERT/UPDATE events ──
        .on(
          'postgres_changes',
          {
            event: '*',
            schema: 'public',
            table: 'mission_applications',
          },
          () => {
            queryClient.invalidateQueries({ queryKey: missionKeys.all });
            queryClient.invalidateQueries({ queryKey: profileKeys.providerStats });
          },
        )
        // ── Emergency bids: INSERT/UPDATE events ──
        .on(
          'postgres_changes',
          {
            event: '*',
            schema: 'public',
            table: 'emergency_bids',
          },
          () => {
            queryClient.invalidateQueries({ queryKey: emergencyKeys.all });
          },
        )
        // ── Reviews: INSERT events ──
        .on(
          'postgres_changes',
          {
            event: 'INSERT',
            schema: 'public',
            table: 'reviews',
          },
          (payload) => {
            queryClient.invalidateQueries({ queryKey: profileKeys.providerStats });
            // Invalidate the specific provider profile and reviews cache
            const providerId = (payload.new as { provider_id?: string }).provider_id;
            if (providerId) {
              queryClient.invalidateQueries({ queryKey: profileKeys.provider(providerId) });
            }
            queryClient.invalidateQueries({ queryKey: ['reviews'] });
            queryClient.invalidateQueries({ queryKey: ['providers'] });
          },
        )
        // ── Reservations: INSERT/UPDATE events ──
        .on(
          'postgres_changes',
          {
            event: '*',
            schema: 'public',
            table: 'reservations',
          },
          () => {
            queryClient.invalidateQueries({ queryKey: propertyKeys.all });
          },
        )
        // ── Mission quotes: UPDATE events ──
        .on(
          'postgres_changes',
          {
            event: 'UPDATE',
            schema: 'public',
            table: 'mission_quotes',
          },
          (payload) => {
            const quoteRow = payload.new as { mission_id?: string; emergency_request_id?: string };
            // Invalidate related mission or emergency detail
            if (quoteRow.mission_id) {
              queryClient.invalidateQueries({ queryKey: missionKeys.detail(quoteRow.mission_id) });
              queryClient.invalidateQueries({ queryKey: missionKeys.all });
            }
            if (quoteRow.emergency_request_id) {
              queryClient.invalidateQueries({ queryKey: emergencyKeys.detail(quoteRow.emergency_request_id) });
              queryClient.invalidateQueries({ queryKey: emergencyKeys.all });
            }
          },
        )
        // ── Notifications: INSERT events ──
        .on(
          'postgres_changes',
          {
            event: 'INSERT',
            schema: 'public',
            table: 'notifications',
            filter: `user_id=eq.${userId}`,
          },
          () => {
            queryClient.invalidateQueries({ queryKey: notificationKeys.all });
          },
        )
        .subscribe();

      channelRef.current = channel;
    }

    setup();

    // Also react to auth state changes (login/logout) to re-setup or teardown
    const {
      data: { subscription: authSubscription },
    } = supabase.auth.onAuthStateChange((event) => {
      // Teardown existing channel on sign out
      if (event === 'SIGNED_OUT') {
        if (channelRef.current) {
          supabase.removeChannel(channelRef.current);
          channelRef.current = null;
        }
        return;
      }

      // Re-setup on sign in (if channel is not already active)
      if (event === 'SIGNED_IN' && !channelRef.current) {
        setup();
      }
    });

    return () => {
      cancelled = true;
      authSubscription.unsubscribe();
      if (channelRef.current) {
        supabase.removeChannel(channelRef.current);
        channelRef.current = null;
      }
    };
  }, []);
}
