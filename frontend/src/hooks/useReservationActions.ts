import { Alert } from 'react-native';
import { useQueryClient } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';
import { createMission } from '../api/missions';
import { sendPushNotification } from '../api/notifications';
import type { ReservationWithMission, ReservationMissionStatus } from '../api/properties';

interface PropertyInfo {
  id: string;
  name: string;
  fixed_rate: number | null;
  address: string;
}

export function useReservationActions() {
  const queryClient = useQueryClient();

  const invalidateReservationCaches = (propertyId: string) => {
    queryClient.invalidateQueries({ queryKey: ['properties', 'reservations-with-missions', propertyId] });
    queryClient.invalidateQueries({ queryKey: ['cleaning-missions', propertyId] });
  };

  const createCleaningMission = async (
    reservation: ReservationWithMission,
    property: PropertyInfo,
  ) => {
    if (!property.fixed_rate) {
      Alert.alert(
        'Prix du ménage manquant',
        'Définissez d\'abord un tarif de ménage pour ce logement (section "Tarif fixe").',
        [{ text: 'Compris' }],
      );
      return;
    }
    try {
      const { data: prop } = await supabase.from('properties').select('owner_id').eq('id', property.id).single();
      await supabase.from('missions').insert({
        property_id: property.id,
        owner_id: prop?.owner_id,
        reservation_id: reservation.id,
        mission_type: 'cleaning',
        status: 'pending',
        mode: 'fixed',
        scheduled_date: reservation.check_out,
        description: `Ménage check-out — ${reservation.guest_name || 'invité'}`,
        fixed_rate: property.fixed_rate,
      });
      Alert.alert('Mission créée', `Mission ménage créée pour le ${new Date(reservation.check_out).toLocaleDateString('fr-FR')}.`);
      invalidateReservationCaches(property.id);
    } catch (e: unknown) {
      Alert.alert('Erreur', e instanceof Error ? e.message : String(e));
    }
  };

  const sendToFavorite = async (
    reservation: ReservationMissionStatus,
    property: PropertyInfo,
    favoriteProviderId: string,
    favoriteProviderName: string,
  ) => {
    const checkOutDate = new Date(reservation.check_out).toLocaleDateString('fr-FR');
    const platform = reservation.source || 'Direct';
    try {
      await createMission({
        property_id: property.id,
        mission_type: 'cleaning',
        status: 'pending_provider_approval',
        assigned_provider_id: favoriteProviderId,
        scheduled_date: reservation.check_out,
        description: `Ménage check-out — ${reservation.guest_name || 'invité'} (${platform})`,
        fixed_rate: property.fixed_rate || undefined,
        reservation_id: reservation.id,
        show_address: true,
        mode: 'fixed',
      });
      await sendPushNotification(
        favoriteProviderId,
        'Nouvelle mission ménage',
        `${property.name ? property.name + ' — ' : ''}Mission ménage le ${checkOutDate} à ${property.address || 'adresse non renseignée'}`,
        { type: 'mission' },
      );
      Alert.alert('Mission envoyée', `Mission ménage envoyée à ${favoriteProviderName} pour le ${checkOutDate}.`);
      invalidateReservationCaches(property.id);
    } catch (e: unknown) {
      Alert.alert('Erreur', e instanceof Error ? e.message : String(e));
    }
  };

  const publishToNetwork = async (
    reservation: ReservationMissionStatus,
    property: PropertyInfo,
  ) => {
    const checkOutDate = new Date(reservation.check_out).toLocaleDateString('fr-FR');
    const platform = reservation.source || 'Direct';
    try {
      await createMission({
        property_id: property.id,
        mission_type: 'cleaning',
        status: 'pending',
        assigned_provider_id: null,
        scheduled_date: reservation.check_out,
        description: `Ménage check-out — ${reservation.guest_name || 'invité'} (${platform})`,
        fixed_rate: property.fixed_rate || undefined,
        reservation_id: reservation.id,
        max_applications: 3,
        show_address: false,
        mode: 'fixed',
      });
      Alert.alert('Mission publiée', `Mission ménage publiée au réseau pour le ${checkOutDate}. Les prestataires proches vont candidater.`);
      invalidateReservationCaches(property.id);
    } catch (e: unknown) {
      Alert.alert('Erreur', e instanceof Error ? e.message : String(e));
    }
  };

  return { createCleaningMission, sendToFavorite, publishToNetwork };
}
