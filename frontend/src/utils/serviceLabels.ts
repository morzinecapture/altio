const MISSION_TYPE_MAP: Record<string, string> = {
  cleaning: 'Ménage',
  linen: 'Linge',
  plumbing: 'Plomberie',
  electrical: 'Électricité',
  electricity: 'Électricité',
  heating: 'Chauffage',
  locksmith: 'Serrurerie',
  jacuzzi: 'Jacuzzi / Spa',
  repair: 'Réparation',
  maintenance: 'Maintenance',
  general: 'Général',
  emergency: 'Urgence',
  concierge: 'Conciergerie',
  service: 'Service',
};

const SERVICE_TYPE_MAP: Record<string, string> = {
  plumbing: 'Plomberie',
  electrical: 'Électricité',
  electricity: 'Électricité',
  heating: 'Chauffage',
  locksmith: 'Serrurerie',
  jacuzzi: 'Jacuzzi / Spa',
  repair: 'Réparation',
  cleaning: 'Ménage',
  linen: 'Linge',
  maintenance: 'Maintenance',
  general: 'Général',
  emergency: 'Urgence',
  concierge: 'Conciergerie',
  service: 'Service',
};

export const getMissionTypeLabel = (type: string, services?: string[] | null): string => {
  if (Array.isArray(services) && services.length) return [...new Set(services)].map(service => getMissionTypeLabel(service)).join(' + ');
  const label = MISSION_TYPE_MAP[type];
  if (!label) {
    console.warn(`[getMissionTypeLabel] Type inconnu : "${type}"`);
    return type;
  }
  return label;
};

export const getServiceTypeLabel = (type: string): string => {
  const label = SERVICE_TYPE_MAP[type];
  if (!label) {
    console.warn(`[getServiceTypeLabel] Type inconnu : "${type}"`);
    return type;
  }
  return label;
};
