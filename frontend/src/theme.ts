// Altio Theme — Professional B2B Design System
// Inspired by: Minimalism / Swiss Style + Trust & Authority (ui-ux-pro-max)
import { Dimensions } from 'react-native';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');

export const COLORS = {
  // Backgrounds — near-white, clean, professional
  background: '#F1F5F9',
  paper: '#FFFFFF',
  subtle: '#E2E8F0',
  surfaceGlass: 'rgba(255, 255, 255, 0.85)',

  // Text — Slate palette, high contrast
  textPrimary: '#1E293B',
  textSecondary: '#64748B',
  textTertiary: '#94A3B8',
  textInverse: '#FFFFFF',

  // Brand — bleu professionnel pur (blue-600/500), sans dérive violet
  brandPrimary: '#2563EB',
  brandSecondary: '#3B82F6',
  brandAccent: '#1D4ED8',
  brandGradientStart: '#2563EB',
  brandGradientEnd: '#3B82F6',

  // Functional
  urgency: '#EF4444',
  urgencySoft: '#FEE2E2',
  success: '#10B981',
  successSoft: '#D1FAE5',
  warning: '#F59E0B',
  warningSoft: '#FEF3C7',
  info: '#2563EB',
  infoSoft: '#DBEAFE',

  // Accent — orange CTA recommandé B2B, violet uniquement pour admin
  coral: '#F97316',
  coralSoft: '#FFEDD5',
  purple: '#7C3AED',
  purpleSoft: '#EDE9FE',

  // Border — Slate 300/400
  border: '#CBD5E1',
  borderActive: '#94A3B8',
};

export const GRADIENT = {
  header: ['#EFF6FF', '#DBEAFE', '#EFF6FF'] as const,
  brandButton: ['#2563EB', '#3B82F6'] as const,
  urgencyButton: ['#EF4444', '#F87171'] as const,
  successButton: ['#10B981', '#34D399'] as const,
  warmBanner: ['#EA580C', '#F97316'] as const,
};

export const SPACING = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  xxl: 24,
  xxxl: 32,
  xxxxl: 40,
};

export const RADIUS = {
  sm: 10,
  md: 14,
  lg: 20,
  xl: 24,
  xxl: 28,
  full: 999,
};

// Shadows neutres (Slate 900) — pas de couleurs de marque sur les ombres
export const SHADOWS = {
  card: {
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.10,
    shadowRadius: 6,
    elevation: 2,
  },
  cardHover: {
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.16,
    shadowRadius: 12,
    elevation: 4,
  },
  float: {
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.20,
    shadowRadius: 16,
    elevation: 6,
  },
  urgency: {
    shadowColor: '#EF4444',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.20,
    shadowRadius: 8,
    elevation: 4,
  },
  success: {
    shadowColor: '#10B981',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.18,
    shadowRadius: 8,
    elevation: 4,
  },
};

export const FONTS = {
  h1: { fontSize: 28, fontWeight: '800' as const, letterSpacing: -0.8, fontFamily: 'PlusJakartaSans_800ExtraBold' },
  h2: { fontSize: 22, fontWeight: '700' as const, letterSpacing: -0.5, fontFamily: 'PlusJakartaSans_700Bold' },
  h3: { fontSize: 18, fontWeight: '600' as const, letterSpacing: -0.2, fontFamily: 'PlusJakartaSans_600SemiBold' },
  body: { fontSize: 15, fontWeight: '400' as const, lineHeight: 24, fontFamily: 'PlusJakartaSans_400Regular' },
  bodySmall: { fontSize: 13, fontWeight: '400' as const, lineHeight: 20, fontFamily: 'PlusJakartaSans_400Regular' },
  caption: { fontSize: 11, fontWeight: '600' as const, letterSpacing: 0.6, textTransform: 'uppercase' as const, fontFamily: 'PlusJakartaSans_600SemiBold' },
};

export const STATUS_COLORS: Record<string, { bg: string; text: string }> = {
  completed: { bg: COLORS.successSoft, text: COLORS.success },
  pending: { bg: COLORS.warningSoft, text: COLORS.warning },
  urgent: { bg: COLORS.urgencySoft, text: COLORS.urgency },
  open: { bg: COLORS.urgencySoft, text: COLORS.urgency },
  bids_open: { bg: COLORS.warningSoft, text: COLORS.warning },
  in_progress: { bg: COLORS.infoSoft, text: COLORS.info },
  assigned: { bg: COLORS.purpleSoft, text: COLORS.purple },
  accepted: { bg: COLORS.successSoft, text: COLORS.success },
  rejected: { bg: COLORS.urgencySoft, text: COLORS.urgency },
  awaiting_payment: { bg: COLORS.coralSoft, text: COLORS.coral },
  pending_provider_approval: { bg: COLORS.warningSoft, text: COLORS.warning },
  validated: { bg: COLORS.successSoft, text: COLORS.success },
  paid: { bg: COLORS.successSoft, text: COLORS.success },
  expired: { bg: COLORS.warningSoft, text: COLORS.warning },
  dispute: { bg: COLORS.urgencySoft, text: COLORS.urgency },
  cancelled: { bg: '#FECACA', text: '#DC2626' },
  refunded: { bg: '#FFEDD5', text: '#D97706' },
  // Urgence — états intermédiaires
  bid_accepted: { bg: COLORS.infoSoft, text: COLORS.info },
  provider_accepted: { bg: COLORS.infoSoft, text: COLORS.info },
  displacement_paid: { bg: COLORS.infoSoft, text: COLORS.info },
  on_site: { bg: COLORS.infoSoft, text: COLORS.info },
  quote_submitted: { bg: COLORS.coralSoft, text: COLORS.coral },
  quote_sent: { bg: COLORS.coralSoft, text: COLORS.coral },
  quote_accepted: { bg: COLORS.infoSoft, text: COLORS.info },
  quote_refused: { bg: COLORS.urgencySoft, text: COLORS.urgency },
};

export const MISSION_TYPE_LABELS: Record<string, string> = {
  cleaning: 'Ménage',
  linen: 'Linge',
  maintenance: 'Maintenance',
};

export const SERVICE_TYPE_LABELS: Record<string, string> = {
  plumbing: 'Plomberie',
  electrical: 'Électricité',
  locksmith: 'Serrurerie',
  jacuzzi: 'Jacuzzi/Spa',
  repair: 'Réparation',
};

export const STATUS_LABELS: Record<string, string> = {
  pending: 'En recherche de prestataire',
  assigned: 'Prestataire confirmé',
  in_progress: 'Intervention en cours',
  completed: 'Terminée',
  awaiting_payment: 'À régler',
  open: 'En recherche',
  accepted: 'Acceptée',
  rejected: 'Refusée',
  pending_provider_approval: 'En attente de sa réponse',
  validated: 'Validée',
  paid: 'Payée',
  expired: 'Expirée',
  dispute: 'Litige en cours',
  cancelled: 'Annulée',
  refunded: 'Remboursée',
  bids_open: 'En recherche de prestataire',
  bid_accepted: 'Prestataire en route',
  provider_accepted: 'Prestataire en route',
  displacement_paid: 'Prestataire en route',
  on_site: 'Prestataire sur place',
  quote_submitted: 'Devis à valider',
  quote_sent: 'Devis à valider',
  quote_accepted: 'Travaux en cours',
  quote_paid: 'Travaux en cours',
  quote_refused: 'Devis refusé',
};

export const EMERGENCY_STATUS_LABELS: Record<string, string> = {
  bids_open: 'Recherche en cours',
  bid_accepted: 'Prestataire en route',
  provider_accepted: 'Prestataire en route',
  displacement_paid: 'Prestataire en route',
  on_site: 'Prestataire sur place',
  quote_submitted: 'Devis à valider',
  quote_sent: 'Devis à valider',
  quote_accepted: 'Travaux en cours',
  quote_refused: 'Devis refusé',
  in_progress: 'Travaux en cours',
  completed: 'Intervention terminée',
  cancelled: 'Annulée',
  refunded: 'Remboursée',
};

export { SCREEN_WIDTH, SCREEN_HEIGHT };
