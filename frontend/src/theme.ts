// Altio Theme — Professional B2B Design System
// Inspired by: Minimalism / Swiss Style + Trust & Authority (ui-ux-pro-max)
import { Dimensions } from 'react-native';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');

export const COLORS = {
  // Backgrounds — near-white, clean, professional
  background: '#F8FAFC',
  paper: '#FFFFFF',
  subtle: '#F1F5F9',
  surfaceGlass: 'rgba(255, 255, 255, 0.92)',

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
  urgencySoft: '#FEF2F2',
  success: '#10B981',
  successSoft: '#ECFDF5',
  warning: '#F59E0B',
  warningSoft: '#FFFBEB',
  info: '#2563EB',
  infoSoft: '#EFF6FF',

  // Accent — orange CTA recommandé B2B, violet uniquement pour admin
  coral: '#F97316',
  coralSoft: '#FFF7ED',
  purple: '#7C3AED',
  purpleSoft: '#F5F3FF',

  // Border — Slate 200/300
  border: '#E2E8F0',
  borderActive: '#CBD5E1',
};

export const GRADIENT = {
  header: ['#F8FAFC', '#EFF6FF', '#F8FAFC'] as const,
  brandButton: ['#2563EB', '#3B82F6'] as const,
  urgencyButton: ['#EF4444', '#F87171'] as const,
  successButton: ['#10B981', '#34D399'] as const,
  warmBanner: ['#F97316', '#FB923C'] as const,
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
    shadowOpacity: 0.06,
    shadowRadius: 6,
    elevation: 2,
  },
  cardHover: {
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.10,
    shadowRadius: 12,
    elevation: 4,
  },
  float: {
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.14,
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
  in_progress: { bg: COLORS.infoSoft, text: COLORS.info },
  assigned: { bg: COLORS.purpleSoft, text: COLORS.purple },
  accepted: { bg: COLORS.successSoft, text: COLORS.success },
  rejected: { bg: COLORS.urgencySoft, text: COLORS.urgency },
  awaiting_payment: { bg: COLORS.coralSoft, text: COLORS.coral },
  pending_provider_approval: { bg: COLORS.warningSoft, text: COLORS.warning },
  cancelled: { bg: COLORS.urgencySoft, text: COLORS.urgency },
  refunded: { bg: COLORS.warningSoft, text: COLORS.warning },
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
  pending: 'En attente',
  assigned: 'Assignée',
  in_progress: 'En cours',
  completed: 'Terminée',
  awaiting_payment: 'À payer',
  open: 'Ouverte',
  accepted: 'Accepté',
  rejected: 'Refusée',
  pending_provider_approval: 'Proposition Directe',
  cancelled: 'Annulée',
  refunded: 'Remboursée',
};

export const EMERGENCY_STATUS_LABELS: Record<string, string> = {
  open: 'Ouverte',
  bids_open: 'Candidatures ouvertes',
  bid_accepted: 'Prestataire sélectionné',
  provider_accepted: 'En route',
  on_site: 'Sur place',
  quote_submitted: 'Devis soumis',
  quote_sent: 'Devis envoyé',
  quote_accepted: 'Devis accepté',
  completed: 'Terminée',
};

export { SCREEN_WIDTH, SCREEN_HEIGHT };
