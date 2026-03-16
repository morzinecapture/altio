// Altio Theme — Premium Light Design System
import { Dimensions } from 'react-native';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');

export const COLORS = {
  // Backgrounds
  background: '#F0F4FF',
  paper: '#FFFFFF',
  subtle: '#F5F7FC',
  surfaceGlass: 'rgba(255, 255, 255, 0.85)',

  // Text
  textPrimary: '#1A1D2E',
  textSecondary: '#6B7194',
  textTertiary: '#9CA3C0',
  textInverse: '#FFFFFF',

  // Brand
  brandPrimary: '#4A6CF7',
  brandSecondary: '#6C63FF',
  brandAccent: '#3B5BDB',
  brandGradientStart: '#4A6CF7',
  brandGradientEnd: '#6C63FF',

  // Functional
  urgency: '#FF6B6B',
  urgencySoft: '#FFF0F0',
  success: '#06D6A0',
  successSoft: '#E6FBF3',
  warning: '#FFB648',
  warningSoft: '#FFF8EB',
  info: '#4A6CF7',
  infoSoft: '#EEF2FF',

  // Accent (for badges, tags)
  coral: '#FF8A65',
  coralSoft: '#FFF3EE',
  purple: '#8B5CF6',
  purpleSoft: '#F3EEFF',

  // Border
  border: '#E8ECF4',
  borderActive: '#C5CCE0',
};

export const GRADIENT = {
  header: ['#E8F0FE', '#D4E4FF', '#F0F4FF'] as const,
  brandButton: ['#4A6CF7', '#6C63FF'] as const,
  urgencyButton: ['#FF6B6B', '#FF8A8A'] as const,
  successButton: ['#06D6A0', '#34E8BE'] as const,
  warmBanner: ['#FF9A56', '#FFB648'] as const,
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

export const SHADOWS = {
  card: {
    shadowColor: '#4A6CF7',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 3,
  },
  cardHover: {
    shadowColor: '#4A6CF7',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.12,
    shadowRadius: 16,
    elevation: 6,
  },
  float: {
    shadowColor: '#4A6CF7',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.18,
    shadowRadius: 20,
    elevation: 8,
  },
  urgency: {
    shadowColor: '#FF6B6B',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 12,
    elevation: 8,
  },
  success: {
    shadowColor: '#06D6A0',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 12,
    elevation: 6,
  },
};

export const FONTS = {
  h1: { fontSize: 28, fontWeight: '700' as const, letterSpacing: -0.5, fontFamily: 'Inter_700Bold' },
  h2: { fontSize: 22, fontWeight: '700' as const, letterSpacing: -0.3, fontFamily: 'Inter_700Bold' },
  h3: { fontSize: 18, fontWeight: '600' as const, fontFamily: 'Inter_600SemiBold' },
  body: { fontSize: 15, fontWeight: '400' as const, lineHeight: 22, fontFamily: 'Inter_400Regular' },
  bodySmall: { fontSize: 13, fontWeight: '500' as const, fontFamily: 'Inter_500Medium' },
  caption: { fontSize: 11, fontWeight: '600' as const, letterSpacing: 0.8, textTransform: 'uppercase' as const, fontFamily: 'Inter_600SemiBold' },
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
