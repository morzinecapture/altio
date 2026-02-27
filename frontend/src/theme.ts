// MontRTO Theme - Alpine Utility Design System
import { Dimensions } from 'react-native';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');

export const COLORS = {
  // Backgrounds
  background: '#F4F6FA',
  paper: '#FFFFFF',
  subtle: '#F1F5F9',

  // Text
  textPrimary: '#0F172A',
  textSecondary: '#64748B',
  textTertiary: '#94A3B8',
  textInverse: '#FFFFFF',

  // Brand
  brandPrimary: '#1E293B',
  brandSecondary: '#334155',
  brandAccent: '#0F172A',

  // Functional
  urgency: '#EF4444',
  urgencySoft: '#FEE2E2',
  success: '#10B981',
  successSoft: '#D1FAE5',
  warning: '#F59E0B',
  warningSoft: '#FEF3C7',
  info: '#3B82F6',
  infoSoft: '#EFF6FF',

  // Border
  border: '#E2E8F0',
  borderActive: '#CBD5E1',
};

export const SPACING = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  xxl: 24,
  xxxl: 32,
};

export const RADIUS = {
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  full: 999,
};

export const SHADOWS = {
  card: {
    shadowColor: '#94A3B8',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.08,
    shadowRadius: 4,
    elevation: 2,
  },
  float: {
    shadowColor: '#64748B',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 12,
    elevation: 6,
  },
  urgency: {
    shadowColor: '#EF4444',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 12,
    elevation: 8,
  },
};

export const FONTS = {
  h1: { fontSize: 28, fontWeight: '700' as const, letterSpacing: -0.5 },
  h2: { fontSize: 22, fontWeight: '700' as const, letterSpacing: -0.3 },
  h3: { fontSize: 18, fontWeight: '600' as const },
  body: { fontSize: 15, fontWeight: '400' as const, lineHeight: 22 },
  bodySmall: { fontSize: 13, fontWeight: '500' as const },
  caption: { fontSize: 11, fontWeight: '600' as const, letterSpacing: 0.8, textTransform: 'uppercase' as const },
};

export const STATUS_COLORS: Record<string, { bg: string; text: string }> = {
  completed: { bg: COLORS.successSoft, text: COLORS.success },
  pending: { bg: COLORS.warningSoft, text: COLORS.warning },
  urgent: { bg: COLORS.urgencySoft, text: COLORS.urgency },
  open: { bg: COLORS.urgencySoft, text: COLORS.urgency },
  in_progress: { bg: COLORS.infoSoft, text: COLORS.info },
  assigned: { bg: COLORS.infoSoft, text: COLORS.info },
  accepted: { bg: COLORS.successSoft, text: COLORS.success },
  rejected: { bg: COLORS.urgencySoft, text: COLORS.urgency },
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
  open: 'Ouverte',
  accepted: 'Accepté',
  rejected: 'Refusé',
};

export { SCREEN_WIDTH, SCREEN_HEIGHT };
