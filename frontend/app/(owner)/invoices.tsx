import React, { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ScrollView, ActivityIndicator, RefreshControl } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { useQuery } from '@tanstack/react-query';
import { COLORS, FONTS, SPACING, RADIUS, SHADOWS, STATUS_COLORS } from '../../src/theme';
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
  service_fee: 'Frais de service Altio',
  commission: 'Commission Altio',
};

const INVOICE_ISSUER: Record<string, string> = {
  service: 'Émise par le prestataire (via mandat)',
  service_fee: 'Émise par Altio',
  commission: 'Émise par Altio',
};

const STATUS_STYLE: Record<string, { bg: string; text: string }> = {
  draft: { bg: COLORS.warningSoft, text: COLORS.warning },
  issued: { bg: COLORS.infoSoft, text: COLORS.info },
  sent: { bg: COLORS.infoSoft, text: COLORS.info },
  paid: { bg: COLORS.successSoft, text: COLORS.success },
  overdue: { bg: COLORS.urgencySoft, text: COLORS.urgency },
  cancelled: { bg: COLORS.urgencySoft, text: COLORS.urgency },
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
  { label: 'Frais Altio', value: 'service_fee' },
  { label: 'Commissions', value: 'commission' },
];

export default function OwnerInvoices() {
  const { t } = useTranslation();
  const router = useRouter();
  const [filter, setFilter] = useState<string | null>(null);

  const { data: invoices = [] as Invoice[], isLoading: loading, refetch } = useQuery({
    queryKey: ['invoices', 'buyer'],
    queryFn: () => getInvoices('buyer'),
  });

  const filtered = filter ? invoices.filter((i: Invoice) => i.invoice_type === filter) : invoices;

  const handleViewDetail = (invoiceId: string) => {
    router.push({ pathname: '/invoice/[id]' as any, params: { id: invoiceId } });
  };

  const handleDownload = (url: string, invoiceNumber: string) => {
    if (url) router.push({ pathname: '/invoice-viewer', params: { url, title: invoiceNumber } });
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
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
        refreshControl={<RefreshControl refreshing={false} onRefresh={() => refetch()} />}
      >
        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.headerTitle}>Factures</Text>
          <Text style={styles.headerSubtitle}>{filtered.length} facture{filtered.length !== 1 ? 's' : ''}</Text>
        </View>

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
          <View style={styles.emptyState}>
            <View style={styles.emptyIcon}>
              <Ionicons name="receipt-outline" size={48} color={COLORS.textTertiary} />
            </View>
            <Text style={styles.emptyTitle}>Aucune facture</Text>
            <Text style={styles.emptyText}>
              Vos factures apparaitront ici apres chaque mission terminee.
            </Text>
          </View>
        ) : (
          filtered.map((invoice: { id: string; invoice_number: string; invoice_type: string; status: string; amount_ttc: number; created_at: string; pdf_url?: string; mission?: { mission_type?: string; property?: { name?: string } }; emergency?: { service_type?: string } }) => {
            const statusStyle = STATUS_STYLE[invoice.status] || STATUS_STYLE.draft;
            const statusLabel = STATUS_LABEL[invoice.status] || invoice.status;

            const typeLabel = INVOICE_TYPE_LABEL[invoice.invoice_type] || 'Prestation';
            const issuerLabel = INVOICE_ISSUER[invoice.invoice_type] || '';
            const isAltioInvoice = invoice.invoice_type === 'service_fee' || invoice.invoice_type === 'commission';

            return (
              <TouchableOpacity key={invoice.id} style={styles.card} onPress={() => handleViewDetail(invoice.id)} activeOpacity={0.7}>
                <View style={styles.cardHeader}>
                  <View style={styles.cardHeaderLeft}>
                    <View style={[styles.invoiceIconWrap, isAltioInvoice && { backgroundColor: '#EDE9FE' }]}>
                      <Ionicons
                        name={isAltioInvoice ? 'business-outline' : 'construct-outline'}
                        size={20}
                        color={isAltioInvoice ? '#7C3AED' : COLORS.brandPrimary}
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
                  <View style={[styles.typeBadge, isAltioInvoice ? { backgroundColor: '#EDE9FE' } : { backgroundColor: COLORS.infoSoft }]}>
                    <Text style={[styles.typeText, isAltioInvoice ? { color: '#7C3AED' } : { color: COLORS.brandPrimary }]}>{typeLabel}</Text>
                  </View>
                </View>

                <View style={styles.amountRow}>
                  <Text style={styles.amountLabel}>{invoice.invoice_type === 'service' ? 'Montant de la prestation' : invoice.invoice_type === 'service_fee' ? 'Frais de service' : 'Commission plateforme'}</Text>
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

  header: {
    paddingHorizontal: SPACING.xl,
    paddingTop: SPACING.xl,
    paddingBottom: SPACING.lg,
  },
  headerTitle: {
    fontFamily: 'PlusJakartaSans_700Bold',
    fontSize: 24,
    color: '#1E3A5F',
  },
  headerSubtitle: {
    fontFamily: 'PlusJakartaSans_400Regular',
    fontSize: 14,
    color: COLORS.textSecondary,
    marginTop: 2,
  },

  emptyState: {
    alignItems: 'center',
    paddingHorizontal: SPACING.xxxl,
    paddingTop: 80,
  },
  emptyIcon: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: COLORS.subtle,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: SPACING.xl,
  },
  emptyTitle: {
    fontFamily: 'PlusJakartaSans_600SemiBold',
    fontSize: 18,
    color: COLORS.textPrimary,
    marginBottom: SPACING.sm,
  },
  emptyText: {
    fontFamily: 'PlusJakartaSans_400Regular',
    fontSize: 14,
    color: COLORS.textSecondary,
    textAlign: 'center',
    lineHeight: 22,
  },

  card: {
    marginHorizontal: SPACING.xl,
    marginBottom: SPACING.lg,
    backgroundColor: '#FFFFFF',
    borderRadius: RADIUS.md,
    padding: SPACING.lg,
    borderWidth: 1,
    borderColor: '#F1F5F9',
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
    backgroundColor: COLORS.infoSoft,
    justifyContent: 'center',
    alignItems: 'center',
  },
  invoiceNumber: {
    fontFamily: 'PlusJakartaSans_600SemiBold',
    fontSize: 15,
    color: '#1E3A5F',
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
    color: '#1E3A5F',
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
    paddingBottom: SPACING.lg,
    gap: SPACING.sm,
  },
  chip: {
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.sm,
    borderRadius: RADIUS.full,
    backgroundColor: COLORS.subtle,
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
