// API Client for MontRTO
const BACKEND_URL = process.env.EXPO_PUBLIC_BACKEND_URL;

import AsyncStorage from '@react-native-async-storage/async-storage';

const getToken = async (): Promise<string | null> => {
  return await AsyncStorage.getItem('session_token');
};

const apiCall = async (path: string, options: RequestInit = {}): Promise<any> => {
  const token = await getToken();
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options.headers as Record<string, string> || {}),
  };
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const url = `${BACKEND_URL}/api${path}`;
  const response = await fetch(url, {
    ...options,
    headers,
    credentials: 'include',
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({ detail: 'Network error' }));
    throw new Error(errorData.detail || `HTTP ${response.status}`);
  }

  return response.json();
};

// Auth
export const exchangeSession = (sessionId: string) =>
  apiCall('/auth/session', { method: 'POST', body: JSON.stringify({ session_id: sessionId }) });

export const getMe = () => apiCall('/auth/me');

export const logout = () => apiCall('/auth/logout', { method: 'POST' });

// Users
export const setRole = (role: string) =>
  apiCall('/users/role', { method: 'PUT', body: JSON.stringify({ role }) });

export const getProfile = () => apiCall('/users/profile');

export const updateProviderProfile = (data: any) =>
  apiCall('/users/provider-profile', { method: 'PUT', body: JSON.stringify(data) });

// Properties
export const getProperties = () => apiCall('/properties');

export const createProperty = (data: any) =>
  apiCall('/properties', { method: 'POST', body: JSON.stringify(data) });

export const getProperty = (id: string) => apiCall(`/properties/${id}`);

export const updateProperty = (id: string, data: any) =>
  apiCall(`/properties/${id}`, { method: 'PUT', body: JSON.stringify(data) });

export const deleteProperty = (id: string) =>
  apiCall(`/properties/${id}`, { method: 'DELETE' });

export const syncIcal = (id: string) =>
  apiCall(`/properties/${id}/sync-ical`, { method: 'POST' });

// Reservations
export const getReservations = (propertyId?: string) =>
  apiCall(`/reservations${propertyId ? `?property_id=${propertyId}` : ''}`);

// Missions
export const getMissions = (status?: string, missionType?: string) => {
  const params = new URLSearchParams();
  if (status) params.set('status', status);
  if (missionType) params.set('mission_type', missionType);
  const qs = params.toString();
  return apiCall(`/missions${qs ? `?${qs}` : ''}`);
};

export const createMission = (data: any) =>
  apiCall('/missions', { method: 'POST', body: JSON.stringify(data) });

export const getMission = (id: string) => apiCall(`/missions/${id}`);

export const applyToMission = (missionId: string, data: any) =>
  apiCall(`/missions/${missionId}/apply`, { method: 'POST', body: JSON.stringify(data) });

export const handleApplication = (missionId: string, appId: string, action: string) =>
  apiCall(`/missions/${missionId}/applications/${appId}`, { method: 'PUT', body: JSON.stringify({ action }) });

export const startMission = (missionId: string) =>
  apiCall(`/missions/${missionId}/start`, { method: 'PUT' });

export const completeMission = (missionId: string) =>
  apiCall(`/missions/${missionId}/complete`, { method: 'PUT' });

// Emergency
export const createEmergency = (data: any) =>
  apiCall('/emergency', { method: 'POST', body: JSON.stringify(data) });

export const getEmergencies = () => apiCall('/emergency');

export const getEmergency = (id: string) => apiCall(`/emergency/${id}`);

export const acceptEmergency = (id: string, data: any) =>
  apiCall(`/emergency/${id}/accept`, { method: 'PUT', body: JSON.stringify(data) });

export const payDisplacement = (id: string, originUrl: string) =>
  apiCall(`/emergency/${id}/pay-displacement`, { method: 'POST', body: JSON.stringify({ origin_url: originUrl }) });

export const payQuote = (id: string, originUrl: string) =>
  apiCall(`/emergency/${id}/pay-quote`, { method: 'POST', body: JSON.stringify({ origin_url: originUrl }) });

export const completeEmergency = (id: string, data: any) =>
  apiCall(`/emergency/${id}/complete`, { method: 'PUT', body: JSON.stringify(data) });

export const checkPaymentStatus = (sessionId: string) =>
  apiCall(`/payments/status/${sessionId}`);

// Quotes
export const createQuote = (data: any) =>
  apiCall('/quotes', { method: 'POST', body: JSON.stringify(data) });

export const handleQuote = (quoteId: string, action: string) =>
  apiCall(`/quotes/${quoteId}`, { method: 'PUT', body: JSON.stringify({ action }) });

// Service Types
export const getServiceTypes = () => apiCall('/service-types');

// Provider
export const toggleAvailability = () =>
  apiCall('/provider/availability', { method: 'PUT' });

export const getProviderStats = () => apiCall('/provider/stats');

// Notifications
export const getNotifications = () => apiCall('/notifications');

export const markNotificationRead = (id: string) =>
  apiCall(`/notifications/${id}/read`, { method: 'PUT' });

// Dashboard
export const getOwnerDashboard = () => apiCall('/dashboard/owner');
