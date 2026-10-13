const SERVICE_LABELS: Record<string, string> = {
  cleaning: 'ménage',
  linen: 'linge',
  plumbing: 'plomberie',
  electrical: 'électricité',
  electricity: 'électricité',
  heating: 'chauffage',
  locksmith: 'serrurerie',
  jacuzzi: 'jacuzzi / spa',
  repair: 'réparation',
  maintenance: 'entretien',
  general: 'général',
  emergency: 'urgence',
  concierge: 'conciergerie',
  service: 'service',
  intervention: 'intervention',
}

export const getFrenchServiceLabel = (value?: string | null, services?: string[] | null): string => {
  if (Array.isArray(services) && services.length) return [...new Set(services)].map(service => getFrenchServiceLabel(service)).join(' + ')
  return SERVICE_LABELS[value || 'service'] || value || 'service'
}
