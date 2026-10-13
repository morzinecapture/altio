import React, { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ScrollView, ActivityIndicator, RefreshControl } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter, useFocusEffect } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { COLORS, SPACING, RADIUS, SHADOWS } from '../../src/theme';
import { EmptyState } from '../../src/components/ui';
import OwnerPageHeader from '../../src/components/owner/OwnerPageHeader';
import { getInvoices } from '../../src/api';
import type { Invoice } from '../../src/types/api';

const STATUS_LABEL: Record<string, string> = {
  draft: 'Brouillon',
  issued: 'Émise',
  sent: 'Envoyée',
  paid: 'Payée',
  overdue: 'En retard',
  cancelled: 'Annulée',
};

const INVOICE_TYPE_LABEL: Record<string, string> = {
  service: 'Prestation',
  displacement: 'Déplacement',
  service_fee: 'Frais de service Altio',
  commission: 'Commission Altio',
  credit_note: 'Avoir',
};

const INVOICE_ISSUER: Record<string, string> = {
  service: 'Émise par le prestataire (via mandat)',
  displacement: 'Émise par le prestataire (via mandat)',
  service_fee: 'Émise par Altio',
  commission: 'Émise par Altio',
  credit_note: 'Avoir',
};

const STATUS_STYLE: Record<string, { bg: string; text: string }> = {
  draft: { bg: '#F59E0B', text: '#FFFFFF' },
  issued: { bg: '#2563EB', text: '#FFFFFF' },
  sent: { bg: '#2563EB', text: '#FFFFFF' },
  paid: { bg: '#10B981', text: '#FFFFFF' },
  overdue: { bg: '#EF4444', text: '#FFFFFF' },
  cancelled: { bg: '#EF4444', text: '#FFFFFF' },
};

const formatDate = (iso: string) => {
  const d = new Date(iso);
  return d.toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' });
};

const formatAmount = (amount: number) => {
  return new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' }).format(amount);
};

const OWNER_FILTERS: { label: string; value: string | null }[] = [
  { label: 'Toutes', value: null },
  { label: 'Prestations', value: 'service' },
  { label: 'Déplacements', value: 'displacement' },
  { label: 'Frais Altio', value: 'service_fee' },
  { label: 'Commissions', value: 'commission' },
];

export default function OwnerInvoices() {
  const router = useRouter();
  const [filter, setFilter] = useState<string | null>(null);

  const { data: invoices = [] as Invoice[], isLoading: loading, isError, isRefetching, refetch } = useQuery({
    queryKey: ['invoices', 'buyer'],
    queryFn: () => getInvoices('buyer'),
  });

  useFocusEffect(React.useCallback(() => { void refetch(); }, [refetch]));

  const filtered = filter ? invoices.filter((i: Invoice) => i.invoice_type === filter) : invoices;

  const handleViewDetail = (invoiceId: string) => {
    router.push({ pathname: '/invoice/[id]' as any, params: { id: invoiceId } });
  };

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={COLORS.brandPrimary} />
      </View>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      {isError && <TouchableOpacity accessibilityRole="button" onPress={() => refetch()} style={{ padding: SPACING.lg }}><Text>Impossible de charger les factures. Appuyez pour réessayer.</Text></TouchableOpacity>}
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
        refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={() => refetch()} />}
      >
        <OwnerPageHeader
          title="Factures"
          subtitle={`${filtered.length} facture${filtered.length !== 1 ? 's' : ''} · Paiements et justificatifs`}
          icon="receipt-outline"
        />

        {/* Filter chips */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.chipBar}
        >
          {OWNER_FILTERS.map((f) => {
            const active = filter === f.value;
            return (
              <TouchableOpacity
                key={f.label}
                style={[styles.chip, active && styles.chipActive]}
                onPress={() => setFilter(f.value)}
                activeOpacity={0.7}
              >
                <Text style={[styles.chipText, active && styles.chipTextActive]}>{f.label}</Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>

        {filtered.length === 0 ? (
          <EmptyState
            icon="receipt-outline"
            title="Aucune facture"
            subtitle="Vos factures apparaîtront ici après chaque mission terminée."
            testID="owner-invoices-empty"
          />
        ) : (
          filtered.map((invoice: { id: string; invoice_number: string; invoice_type: string; status: string; amount_ttc: number; created_at: string; pdf_url?: string; mission?: { mission_type?: string; property?: { name?: string } }; emergency?: { service_type?: string } }) => {
            const statusStyle = STATUS_STYLE[invoice.status] || STATUS_STYLE.draft;
            const statusLabel = STATUS_LABEL[invoice.status] || invoice.status;

            const typeLabel = INVOICE_TYPE_LABEL[invoice.invoice_type] || 'Prestation';
            const issuerLabel = INVOICE_ISSUER[invoice.invoice_type] || '';
            const isAltioInvoice = invoice.invoice_type === 'service_fee' || invoice.invoice_type === 'commission';
            const amountLabel = invoice.invoice_type === 'service' || invoice.invoice_type === 'displacement'
              ? 'Montant de la prestation'
              : invoice.invoice_type === 'service_fee'
                ? 'Frais de service'
                : invoice.invoice_type === 'credit_note'
                  ? 'Avoir'
                  : 'Commission plateforme';

            return (
              <TouchableOpacity key={invoice.id} style={styles.card} onPress={() => handleViewDetail(invoice.id)} activeOpacity={0.7}>
                <View style={styles.cardHeader}>
                  <View style={styles.cardHeaderLeft}>
                    <View style={[styles.invoiceIconWrap, isAltioInvoice && { backgroundColor: '#16233A' }]}>
                      <Ionicons
                        name={isAltioInvoice ? 'business-outline' : 'construct-outline'}
                        size={20}
                        color="#FFFFFF"
                      />
                    </View>
                    <View>
                      <Text style={styles.invoiceNumber}>{invoice.invoice_number || 'N/A'}</Text>
                      <Text style={styles.invoiceDate}>{formatDate(invoice.created_at)}</Text>
                      {issuerLabel ? <Text style={styles.issuerLabel}>{issuerLabel}</Text> : null}
                    </View>
                  </View>
                  <View style={[styles.statusBadge, { backgroundColor: statusStyle.bg }]}>
                    <Text style={[styles.statusText, { color: statusStyle.text }]}>{statusLabel}</Text>
                  </View>
                </View>

                <View style={styles.typeRow}>
                  <View style={[styles.typeBadge, isAltioInvoice ? { backgroundColor: '#16233A' } : { backgroundColor: '#2563EB' }]}>
                    <Text style={styles.typeText}>{typeLabel}</Text>
                  </View>
                </View>

                <View style={styles.amountRow}>
                  <Text style={styles.amountLabel}>{amountLabel}</Text>
                  <Text style={styles.amountValue}>{formatAmount(invoice.amount_ttc || 0)}</Text>
                </View>

                <View style={styles.detailHint}>
                  <Ionicons name="chevron-forward" size={16} color={COLORS.textTertiary} />
                  <Text style={styles.detailHintText}>Voir le détail</Text>
                </View>
              </TouchableOpacity>
            );
          })
        )}

        <View style={{ height: 100 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#FFFFFF' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#FFFFFF' },
  scrollContent: { paddingBottom: SPACING.xxxl },

  card: {
    marginHorizontal: SPACING.xl,
    marginBottom: SPACING.lg,
    backgroundColor: '#FFFFFF',
    borderRadius: RADIUS.md,
    padding: SPACING.lg,
    borderWidth: 1,
    borderColor: '#CBD5E1',
    ...SHADOWS.card,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: SPACING.md,
  },
  cardHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.md,
  },
  invoiceIconWrap: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: '#2563EB',
    justifyContent: 'center',
    alignItems: 'center',
  },
  invoiceNumber: {
    fontFamily: 'PlusJakartaSans_600SemiBold',
    fontSize: 15,
    color: COLORS.textPrimary,
  },
  invoiceDate: {
    fontFamily: 'PlusJakartaSans_400Regular',
    fontSize: 13,
    color: COLORS.textSecondary,
    marginTop: 1,
  },
  issuerLabel: {
    fontFamily: 'PlusJakartaSans_400Regular',
    fontSize: 11,
    color: COLORS.textTertiary,
    marginTop: 2,
    fontStyle: 'italic',
  },

  statusBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: RADIUS.full,
  },
  statusText: {
    fontFamily: 'PlusJakartaSans_600SemiBold',
    fontSize: 11,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },

  typeRow: {
    marginBottom: SPACING.md,
  },
  typeBadge: {
    alignSelf: 'flex-start',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: RADIUS.sm,
  },
  typeText: {
    fontFamily: 'PlusJakartaSans_600SemiBold',
    fontSize: 12,
    color: '#FFFFFF',
  },

  amountRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingTop: SPACING.md,
    borderTopWidth: 1,
    borderTopColor: '#F1F5F9',
    marginBottom: SPACING.md,
  },
  amountLabel: {
    fontFamily: 'PlusJakartaSans_400Regular',
    fontSize: 14,
    color: COLORS.textSecondary,
  },
  amountValue: {
    fontFamily: 'PlusJakartaSans_700Bold',
    fontSize: 20,
    color: COLORS.textPrimary,
  },

  detailHint: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: 4,
    paddingTop: SPACING.sm,
  },
  detailHintText: {
    fontFamily: 'PlusJakartaSans_400Regular',
    fontSize: 12,
    color: COLORS.textTertiary,
  },

  chipBar: {
    paddingHorizontal: SPACING.xl,
    paddingTop: SPACING.lg,
    paddingBottom: SPACING.lg,
    gap: SPACING.sm,
  },
  chip: {
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.sm,
    borderRadius: RADIUS.full,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#CBD5E1',
  },
  chipActive: {
    backgroundColor: COLORS.brandPrimary,
  },
  chipText: {
    fontFamily: 'PlusJakartaSans_600SemiBold',
    fontSize: 13,
    color: COLORS.textSecondary,
  },
  chipTextActive: {
    color: COLORS.textInverse,
  },
});
