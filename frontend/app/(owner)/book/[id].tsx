import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, TextInput, ActivityIndicator, Alert } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { COLORS, FONTS, SPACING, RADIUS } from '../../../src/theme';
import { createEmergency, getProperties, getProviderProfile } from '../../../src/api';
import type { Property } from '../../../src/types/api';

export default function BookProviderScreen() {
    const { id } = useLocalSearchParams();
    const router = useRouter();
    const { t } = useTranslation();

    const [provider, setProvider] = useState<{ provider_id?: string; specialties?: string[]; rating?: number; total_reviews?: number; hourly_rate?: number; name?: string; picture?: string; bio?: string; zone?: string; user?: { name?: string; picture?: string } } | null>(null);
    const [properties, setProperties] = useState<Property[]>([]);
    const [loading, setLoading] = useState(true);
    const [submitting, setSubmitting] = useState(false);

    // Form state
    const [selectedProp, setSelectedProp] = useState('');
    const [selectedService, setSelectedService] = useState('');
    const [description, setDescription] = useState('');
    // Simulating date/time logic for MVP
    const [scheduledDate, setScheduledDate] = useState(new Date(Date.now() + 86400000 * 2)); // In 2 days

    useEffect(() => {
        async function loadData() {
            try {
                const [propsRes, provData] = await Promise.all([
                    getProperties(),
                    getProviderProfile(id as string),
                ]);
                setProperties(propsRes);
                if (provData) {
                    setProvider(provData);
                    if (provData.specialties?.length > 0) {
                        setSelectedService(provData.specialties[0]);
                    }
                }
            } catch (e) {
                console.error(e);
            } finally {
                setLoading(false);
            }
        }
        loadData();
    }, [id]);

    const handleBook = async () => {
        if (!selectedProp || !selectedService) {
            Alert.alert(t('book.error'), t('book.error_select'));
            return;
        }

        setSubmitting(true);
        try {
            const providerName = provider?.user?.name || 'prestataire';

            await createEmergency({
                property_id: selectedProp,
                service_type: selectedService,
                description: description || undefined,
                target_provider_id: id as string,
                scheduled_date: scheduledDate.toISOString(),
            });

            Alert.alert(
                'Demande envoyée',
                `Votre demande a été envoyée à ${providerName}. Il vous répondra avec son tarif.`,
            );
            router.push('/(owner)/dashboard');
        } catch (e: unknown) {
            Alert.alert(t('book.error'), e instanceof Error ? e.message : String(e));
        } finally {
            setSubmitting(false);
        }
    };

    if (loading) return <View style={styles.center}><ActivityIndicator color={COLORS.brandPrimary} /></View>;

    return (
        <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
            <View style={styles.header}>
                <TouchableOpacity style={styles.backBtn} onPress={() => router.back()}>
                    <Ionicons name="arrow-back" size={24} color="#1E3A5F" />
                </TouchableOpacity>
                <Text style={styles.headerTitle}>{t('book.title')}</Text>
                <View style={{ width: 44 }} />
            </View>

            <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.content}>

                <View style={styles.providerCard}>
                    <Ionicons name="person-circle-outline" size={40} color="#3B82F6" />
                    <View style={{ marginLeft: SPACING.md }}>
                        <Text style={styles.providerName}>{provider?.user?.name}</Text>
                        <Text style={styles.providerTarget}>{t('book.selected_provider')}</Text>
                    </View>
                </View>

                <Text style={styles.label}>{t('book.step_service')}</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: SPACING.lg }}>
                    {(provider?.specialties || [t('book.general_service')]).map((spec: string) => (
                        <TouchableOpacity
                            key={spec}
                            style={[styles.chip, selectedService === spec && styles.chipActive]}
                            onPress={() => setSelectedService(spec)}
                        >
                            <Text style={[styles.chipText, selectedService === spec && styles.chipTextActive]}>{spec.toUpperCase()}</Text>
                        </TouchableOpacity>
                    ))}
                </ScrollView>

                <Text style={styles.label}>{t('book.step_property')}</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: SPACING.lg }}>
                    {properties.map(p => (
                        <TouchableOpacity
                            key={p.id}
                            style={[styles.chip, selectedProp === p.id && styles.chipActive]}
                            onPress={() => setSelectedProp(p.id)}
                        >
                            <Text style={[styles.chipText, selectedProp === p.id && styles.chipTextActive]}>{p.name}</Text>
                        </TouchableOpacity>
                    ))}
                </ScrollView>

                <Text style={styles.label}>{t('book.step_date')}</Text>
                <TouchableOpacity
                    style={styles.dateInput}
                    onPress={() => {
                        Alert.alert(t('book.date_select_title'), t('book.date_select_msg'), [
                            { text: t('book.date_tomorrow'), onPress: () => { const d = new Date(); d.setDate(d.getDate() + 1); setScheduledDate(d); } },
                            { text: t('book.date_in_2_days'), onPress: () => { const d = new Date(); d.setDate(d.getDate() + 2); setScheduledDate(d); } },
                            { text: t('book.date_next_week'), onPress: () => { const d = new Date(); d.setDate(d.getDate() + 7); setScheduledDate(d); } }
                        ]);
                    }}
                >
                    <Ionicons name="calendar-outline" size={20} color="#64748B" />
                    <Text style={styles.dateText}>
                        {scheduledDate.toLocaleDateString('fr-FR')} {t('book.date_simulation')}
                    </Text>
                </TouchableOpacity>

                <Text style={styles.label}>{t('book.step_description')}</Text>
                <TextInput
                    style={styles.textArea}
                    placeholder={t('book.description_placeholder')}
                    placeholderTextColor="#94A3B8"
                    multiline
                    numberOfLines={4}
                    value={description}
                    onChangeText={setDescription}
                />

            </ScrollView>

            <View style={styles.footer}>
                <TouchableOpacity style={[styles.submitBtn, { flex: 1 }]} onPress={handleBook} disabled={submitting}>
                    {submitting ? <ActivityIndicator color="#FFFFFF" /> : <Text style={styles.submitBtnText}>Envoyer la demande d'intervention</Text>}
                </TouchableOpacity>
            </View>
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: '#FFFFFF' },
    center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
    header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: SPACING.xl, paddingVertical: SPACING.md, borderBottomWidth: 1, borderBottomColor: '#F1F5F9' },
    backBtn: { width: 44, height: 44, borderRadius: 22, backgroundColor: '#F1F5F9', justifyContent: 'center', alignItems: 'center' },
    headerTitle: { fontFamily: 'Inter_700Bold', fontSize: 18, color: '#1E3A5F' },

    content: { padding: SPACING.xl },
    providerCard: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#F8FAFC', padding: SPACING.md, borderRadius: 16, marginBottom: SPACING.xl, borderWidth: 1, borderColor: '#F1F5F9' },
    providerName: { fontFamily: 'Inter_600SemiBold', fontSize: 16, color: '#1E3A5F' },
    providerTarget: { fontFamily: 'Inter_400Regular', fontSize: 12, color: '#64748B' },

    label: { fontFamily: 'Inter_600SemiBold', fontSize: 15, color: '#1E3A5F', marginBottom: SPACING.sm },
    chip: { paddingHorizontal: 16, paddingVertical: 10, borderRadius: 99, backgroundColor: '#F1F5F9', marginRight: SPACING.sm, borderWidth: 1, borderColor: 'transparent' },
    chipActive: { backgroundColor: '#EFF6FF', borderColor: '#3B82F6' },
    chipText: { fontFamily: 'Inter_500Medium', fontSize: 14, color: '#64748B' },
    chipTextActive: { color: '#3B82F6', fontWeight: 'bold' },

    dateInput: { flexDirection: 'row', alignItems: 'center', padding: SPACING.md, backgroundColor: '#F8FAFC', borderRadius: 12, borderWidth: 1, borderColor: '#E2E8F0', marginBottom: SPACING.xl },
    dateText: { fontFamily: 'Inter_500Medium', fontSize: 15, color: '#1E3A5F', marginLeft: SPACING.sm },

    textArea: { backgroundColor: '#F8FAFC', borderRadius: 12, borderWidth: 1, borderColor: '#E2E8F0', padding: SPACING.md, paddingTop: SPACING.md, fontFamily: 'Inter_400Regular', fontSize: 15, color: '#1E3A5F', minHeight: 100, textAlignVertical: 'top' },

    footer: { flexDirection: 'row', padding: SPACING.xl, borderTopWidth: 1, borderTopColor: '#F1F5F9', backgroundColor: '#FFFFFF', alignItems: 'center' },
    submitBtn: { backgroundColor: '#3B82F6', paddingHorizontal: SPACING.xl, paddingVertical: SPACING.md, borderRadius: 99 },
    submitBtnText: { fontFamily: 'Inter_600SemiBold', fontSize: 16, color: '#FFFFFF' }
});
