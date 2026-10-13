// Altio Theme — Professional B2B Design System
// Inspired by: Minimalism / Swiss Style + Trust & Authority (ui-ux-pro-max)
import { Dimensions } from 'react-native';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');

export const COLORS = {
  // Backgrounds — near-white, clean, professional
  background: '#F5F4EF',
  paper: '#FFFFFF',
  subtle: '#ECEEEA',
  surfaceGlass: 'rgba(255, 255, 255, 0.85)',

  // Text — Slate palette, high contrast
  textPrimary: '#142B3C',
  textSecondary: '#60717C',
  textTertiary: '#71808A',
  textInverse: '#FFFFFF',

  // Brand — bleu professionnel pur (blue-600/500), sans dérive violet
  brandPrimary: '#2861DF',
  brandSecondary: '#3B82F6',
  brandAccent: '#1D4ED8',
  brandGradientStart: '#2563EB',
  brandGradientEnd: '#3B82F6',

  // Functional
  urgency: '#EF4444',
  urgencySoft: '#FEE2E2',
  success: '#297C62',
  successSoft: '#E5F2EA',
  warning: '#956318',
  warningSoft: '#FEF3C7',
  info: '#2563EB',
  infoSoft: '#ECF2FF',

  // Accent — orange CTA recommandé B2B, violet uniquement pour admin
  coral: '#F97316',
  coralSoft: '#FFEDD5',
  purple: '#7C3AED',
  purpleSoft: '#EDE9FE',

  // Border — Slate 300/400
  border: '#E3E7E5',
  borderActive: '#94A3B8',
  navy: '#173748',
  gold: '#D6B681',
  attention: '#FFFAF0',
  attentionBorder: '#EAD7B7',
  avatar: '#DDC7A8',
  onNavyMuted: '#C6D8DC',
  heroGlass: 'rgba(20,43,60,0.30)',
  heroBorder: 'rgba(255,255,255,0.28)',
  scrim: 'rgba(20,43,60,0.48)',
};

export const GRADIENT = {
  alpine: ['rgba(8,30,47,0.88)', 'rgba(11,37,57,0.46)', 'rgba(8,27,44,0.33)'] as const,
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
    shadowOpacity: 0.04,
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
  assigned: { bg: COLORS.infoSoft, text: COLORS.info },
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

// Palette catégorielle — sert à distinguer des familles de services entre elles,
// jamais à porter un sens d'état (succès/erreur/alerte : voir COLORS fonctionnel).
// Chaque entrée = teinte pleine pour l'icône/le texte, teinte douce pour le fond.
export const ACCENTS = {
  violet:     { color: '#8B5CF6', bg: COLORS.purpleSoft },
  pink:       { color: '#EC4899', bg: '#FCE7F3' },
  cyan:       { color: '#06B6D4', bg: '#CFFAFE' },
  blue:       { color: COLORS.brandSecondary, bg: COLORS.infoSoft },
  orange:     { color: COLORS.coral, bg: COLORS.coralSoft },
  green:      { color: COLORS.success, bg: COLORS.successSoft },
  amber:      { color: COLORS.warning, bg: COLORS.warningSoft },
  neutral:    { color: COLORS.textSecondary, bg: COLORS.background },
} as const;

export type AccentName = keyof typeof ACCENTS;

// Visuel partagé des services et catégories partenaires.
// Source unique : ne pas redéclarer de table icône/couleur dans un écran.
export const SERVICE_VISUALS: Record<string, { icon: string; accent: AccentName }> = {
  // Prestations Altio
  cleaning:   { icon: 'sparkles-outline', accent: 'green'   },
  linen:      { icon: 'shirt-outline',    accent: 'pink'    },
  maintenance:{ icon: 'construct-outline',accent: 'blue'    },
  plumbing:   { icon: 'water-outline',    accent: 'blue'    },
  electrical: { icon: 'flash-outline',    accent: 'amber'   },
  locksmith:  { icon: 'key-outline',      accent: 'violet'  },
  jacuzzi:    { icon: 'sunny-outline',    accent: 'cyan'    },
  repair:     { icon: 'hammer-outline',   accent: 'orange'  },
  // Catégories du catalogue partenaires
  restaurant: { icon: 'restaurant-outline', accent: 'orange'  },
  activite:   { icon: 'bicycle-outline',    accent: 'green'   },
  spa:        { icon: 'sparkles-outline',   accent: 'violet'  },
  transport:  { icon: 'car-outline',        accent: 'blue'    },
  shopping:   { icon: 'bag-outline',        accent: 'pink'    },
  location:   { icon: 'key-outline',        accent: 'amber'   },
  autre:      { icon: 'ellipsis-horizontal-outline', accent: 'neutral' },
};

/** Visuel d'un service : icône + couleurs. Retombe sur 'autre' si la clé est inconnue. */
export const getServiceVisual = (key: string) => {
  const entry = SERVICE_VISUALS[key] ?? SERVICE_VISUALS.autre;
  return { icon: entry.icon, ...ACCENTS[entry.accent] };
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
