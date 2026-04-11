import React from 'react';
import { View, Text, StyleSheet, ScrollView, ActivityIndicator, TouchableOpacity, Share } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useQuery } from '@tanstack/react-query';
import { COLORS, SPACING, RADIUS, SHADOWS } from '../../src/theme';
import { getServiceTypeLabel } from '../../src/utils/serviceLabels';
import { getInvoiceDetail } from '../../src/api';
import type { Invoice, InvoiceParty } from '../../src/types/api';

const STATUS_LABEL: Record<string, string> = {
  draft: 'Brouillon',
  issued: 'Émise',
  sent: 'Envoyée',
  paid: 'Payée',
  overdue: 'En retard',
  cancelled: 'Annulée',
};

const STATUS_STYLE: Record<string, { bg: string; text: string }> = {
  draft: { bg: COLORS.warningSoft, text: COLORS.warning },
  issued: { bg: COLORS.infoSoft, text: COLORS.info },
  sent: { bg: COLORS.infoSoft, text: COLORS.info },
  paid: { bg: COLORS.successSoft, text: COLORS.success },
  overdue: { bg: COLORS.urgencySoft, text: COLORS.urgency },
  cancelled: { bg: COLORS.urgencySoft, text: COLORS.urgency },
};

const INVOICE_TYPE_LABEL: Record<string, string> = {
  service: 'Facture de prestation (mandat)',
  service_fee: 'Frais de service Altio',
  commission: 'Commission plateforme Altio',
};

const formatDate = (iso?: string) => {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('fr-FR', { day: '2-digit', month: 'long', year: 'numeric' });
};

const formatAmount = (amount?: number) => {
  if (amount == null) return '—';
  return new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' }).format(amount);
};

function PartyBlock({ label, party, showVatExempt }: { label: string; party?: InvoiceParty; showVatExempt?: boolean }) {
  if (!party) return null;
  return (
    <View style={styles.partyBlock}>
      <Text style={styles.partyLabel}>{label}</Text>
      {party.company_name && <Text style={styles.partyName}>{party.company_name}</Text>}
      {party.name && !party.company_name && <Text style={styles.partyName}>{party.name}</Text>}
      {party.name && party.company_name && <Text style={styles.partyDetail}>{party.name}</Text>}
      {party.siren && <Text style={styles.partyDetail}>SIREN : {party.siren}</Text>}
      {party.vat_number && <Text style={styles.partyDetail}>TVA : {party.vat_number}</Text>}
      {party.billing_address && <Text style={styles.partyDetail}>{party.billing_address}</Text>}
      {showVatExempt && party.is_vat_exempt && (
        <Text style={styles.vatExemptNote}>TVA non applicable, art. 293 B du CGI</Text>
      )}
    </View>
  );
}

function InfoRow({ label, value }: { label: string; value?: string }) {
  if (!value || value === '—') return null;
  return (
    <View style={styles.infoRow}>
      <Text style={styles.infoLabel}>{label}</Text>
      <Text style={styles.infoValue}>{value}</Text>
    </View>
  );
}

export default function InvoiceDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();

  const { data: invoice, isLoading, error } = useQuery<Invoice>({
    queryKey: ['invoice', id],
    queryFn: () => getInvoiceDetail(id!),
    enabled: !!id,
  });

  const handleViewPdf = () => {
    if (invoice?.pdf_url) {
      router.push({ pathname: '/invoice-viewer', params: { url: invoice.pdf_url, title: invoice.invoice_number } });
    }
  };

  const handleShare = async () => {
    if (invoice?.pdf_url) {
      await Share.share({ url: invoice.pdf_url, title: invoice.invoice_number });
    }
  };

  if (isLoading) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.center}>
          <ActivityIndicator size="large" color={COLORS.brandPrimary} />
        </View>
      </SafeAreaView>
    );
  }

  if (error || !invoice) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.center}>
          <Ionicons name="alert-circle-outline" size={48} color={COLORS.urgency} />
          <Text style={styles.errorText}>Facture introuvable</Text>
          <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
            <Text style={styles.backButtonText}>Retour</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  const statusStyle = STATUS_STYLE[invoice.status] || STATUS_STYLE.draft;
  const isMandate = invoice.invoice_type === 'service';

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.headerBtn}>
          <Ionicons name="arrow-back" size={22} color={COLORS.textPrimary} />
        </TouchableOpacity>
        <Text style={styles.headerTitle} numberOfLines={1}>Détail facture</Text>
        <TouchableOpacity onPress={handleShare} style={styles.headerBtn}>
          <Ionicons name="share-outline" size={22} color={COLORS.brandPrimary} />
        </TouchableOpacity>
      </View>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent}>
        {/* Invoice number + status */}
        <View style={styles.topCard}>
          <View style={styles.topCardRow}>
            <Text style={styles.invoiceNumber}>{invoice.invoice_number}</Text>
            <View style={[styles.statusBadge, { backgroundColor: statusStyle.bg }]}>
              <Text style={[styles.statusText, { color: statusStyle.text }]}>
                {STATUS_LABEL[invoice.status] || invoice.status}
              </Text>
            </View>
          </View>
          <Text style={styles.invoiceType}>{INVOICE_TYPE_LABEL[invoice.invoice_type] || invoice.invoice_type}</Text>
          <Text style={styles.invoiceDate}>Émise le {formatDate(invoice.issued_at || invoice.created_at)}</Text>
        </View>

        {/* Mandate notice */}
        {isMandate && (
          <View style={styles.mandateNotice}>
            <Ionicons name="information-circle-outline" size={18} color={COLORS.info} />
            <Text style={styles.mandateText}>
              Facture émise par Altio au nom et pour le compte du prestataire en vertu d'un mandat de facturation (art. 289-I-2 du CGI).
            </Text>
          </View>
        )}

        {/* Parties */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Parties</Text>
          <View style={styles.partiesRow}>
            <PartyBlock label="Émetteur" party={invoice.seller} showVatExempt={isMandate} />
            <PartyBlock label="Destinataire" party={invoice.buyer} />
          </View>
        </View>

        {/* Prestation details */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Prestation</Text>
          <View style={styles.card}>
            {invoice.description && <InfoRow label="Description" value={invoice.description} />}
            {invoice.mission?.description && <InfoRow label="Mission" value={invoice.mission.description} />}
            {invoice.mission?.property?.name && <InfoRow label="Bien" value={invoice.mission.property.name} />}
            {invoice.mission?.property?.address && <InfoRow label="Adresse" value={invoice.mission.property.address} />}
            {invoice.emergency?.service_type && <InfoRow label="Urgence" value={getServiceTypeLabel(invoice.emergency.service_type)} />}
            {invoice.mandate_reference && <InfoRow label="Réf. mandat" value={invoice.mandate_reference} />}
          </View>
        </View>

        {/* Amounts */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Montants</Text>
          <View style={styles.card}>
            <View style={styles.amountLine}>
              <Text style={styles.amountLineLabel}>Montant HT</Text>
              <Text style={styles.amountLineValue}>{formatAmount(invoice.amount_ht)}</Text>
            </View>
            <View style={styles.amountLine}>
              <Text style={styles.amountLineLabel}>TVA ({(invoice.tva_rate * 100).toFixed(0)} %)</Text>
              <Text style={styles.amountLineValue}>{formatAmount(invoice.tva_amount)}</Text>
            </View>
            <View style={styles.amountDivider} />
            <View style={styles.amountLine}>
              <Text style={styles.amountTotalLabel}>Total TTC</Text>
              <Text style={styles.amountTotalValue}>{formatAmount(invoice.amount_ttc)}</Text>
            </View>
          </View>
        </View>

        {/* Dates */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Dates</Text>
          <View style={styles.card}>
            <InfoRow label="Date d'émission" value={formatDate(invoice.issued_at || invoice.created_at)} />
            {invoice.due_date && <InfoRow label="Date d'échéance" value={formatDate(invoice.due_date)} />}
            {invoice.paid_at && <InfoRow label="Date de paiement" value={formatDate(invoice.paid_at)} />}
          </View>
        </View>

        {/* Legal mentions */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Mentions légales</Text>
          <View style={styles.legalCard}>
            <Text style={styles.legalText}>
              En cas de retard de paiement, une pénalité de 3 fois le taux d'intérêt légal sera appliquée, ainsi qu'une indemnité forfaitaire de recouvrement de 40 €.
            </Text>
            <Text style={styles.legalText}>
              Pas d'escompte pour paiement anticipé.
            </Text>
            {isMandate && invoice.seller?.is_vat_exempt && (
              <Text style={styles.legalText}>
                TVA non applicable, article 293 B du Code général des impôts.
              </Text>
            )}
          </View>
        </View>

        {/* Actions */}
        <View style={styles.actionsRow}>
          {invoice.pdf_url && (
            <TouchableOpacity style={styles.actionButton} onPress={handleViewPdf} activeOpacity={0.7}>
              <Ionicons name="eye-outline" size={18} color={COLORS.brandPrimary} />
              <Text style={styles.actionText}>Voir le PDF</Text>
            </TouchableOpacity>
          )}
          {invoice.facturx_url && (
            <TouchableOpacity
              style={[styles.actionButton, { backgroundColor: COLORS.successSoft }]}
              onPress={() => router.push({ pathname: '/invoice-viewer', params: { url: invoice.facturx_url!, title: `${invoice.invoice_number} (Factur-X)` } })}
              activeOpacity={0.7}
            >
              <Ionicons name="code-outline" size={18} color={COLORS.success} />
              <Text style={[styles.actionText, { color: COLORS.success }]}>Factur-X XML</Text>
            </TouchableOpacity>
          )}
        </View>

        <View style={{ height: 100 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#FFFFFF' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: SPACING.xxxl },
  errorText: { fontFamily: 'PlusJakartaSans_600SemiBold', fontSize: 16, color: COLORS.textPrimary, marginTop: SPACING.md },
  backButton: { marginTop: SPACING.xl, paddingHorizontal: SPACING.xl, paddingVertical: SPACING.md, borderRadius: RADIUS.sm, backgroundColor: COLORS.infoSoft },
  backButtonText: { fontFamily: 'PlusJakartaSans_600SemiBold', fontSize: 14, color: COLORS.brandPrimary },
  scrollContent: { paddingBottom: SPACING.xxxl },

  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.md,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
  },
  headerBtn: {
    width: 40, height: 40, borderRadius: 12, backgroundColor: '#F1F5F9',
    justifyContent: 'center', alignItems: 'center',
  },
  headerTitle: {
    flex: 1, fontFamily: 'PlusJakartaSans_600SemiBold', fontSize: 17,
    color: '#1E3A5F', textAlign: 'center', marginHorizontal: SPACING.md,
  },

  topCard: {
    marginHorizontal: SPACING.xl, marginTop: SPACING.xl,
    backgroundColor: '#FFFFFF', borderRadius: RADIUS.md,
    padding: SPACING.lg, borderWidth: 1, borderColor: '#F1F5F9',
    ...SHADOWS.card,
  },
  topCardRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: SPACING.sm },
  invoiceNumber: { fontFamily: 'PlusJakartaSans_700Bold', fontSize: 18, color: '#1E3A5F' },
  invoiceType: { fontFamily: 'PlusJakartaSans_500Medium', fontSize: 14, color: COLORS.textSecondary, marginBottom: 4 },
  invoiceDate: { fontFamily: 'PlusJakartaSans_400Regular', fontSize: 13, color: COLORS.textTertiary },

  statusBadge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: RADIUS.full },
  statusText: { fontFamily: 'PlusJakartaSans_600SemiBold', fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.5 },

  mandateNotice: {
    flexDirection: 'row', alignItems: 'flex-start', gap: SPACING.sm,
    marginHorizontal: SPACING.xl, marginTop: SPACING.md,
    backgroundColor: COLORS.infoSoft, borderRadius: RADIUS.sm, padding: SPACING.md,
  },
  mandateText: { flex: 1, fontFamily: 'PlusJakartaSans_400Regular', fontSize: 12, color: COLORS.info, lineHeight: 18 },

  section: { marginHorizontal: SPACING.xl, marginTop: SPACING.xl },
  sectionTitle: { fontFamily: 'PlusJakartaSans_600SemiBold', fontSize: 15, color: '#1E3A5F', marginBottom: SPACING.md },

  card: {
    backgroundColor: '#FFFFFF', borderRadius: RADIUS.md, padding: SPACING.lg,
    borderWidth: 1, borderColor: '#F1F5F9', ...SHADOWS.card,
  },

  partiesRow: { flexDirection: 'row', gap: SPACING.md },
  partyBlock: {
    flex: 1, backgroundColor: '#FFFFFF', borderRadius: RADIUS.md,
    padding: SPACING.md, borderWidth: 1, borderColor: '#F1F5F9',
  },
  partyLabel: { fontFamily: 'PlusJakartaSans_600SemiBold', fontSize: 11, color: COLORS.textTertiary, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: SPACING.sm },
  partyName: { fontFamily: 'PlusJakartaSans_600SemiBold', fontSize: 14, color: '#1E3A5F', marginBottom: 4 },
  partyDetail: { fontFamily: 'PlusJakartaSans_400Regular', fontSize: 12, color: COLORS.textSecondary, marginBottom: 2 },
  vatExemptNote: { fontFamily: 'PlusJakartaSans_400Regular', fontSize: 11, color: COLORS.warning, fontStyle: 'italic', marginTop: 4 },

  infoRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', paddingVertical: 6 },
  infoLabel: { fontFamily: 'PlusJakartaSans_400Regular', fontSize: 13, color: COLORS.textSecondary, flex: 1 },
  infoValue: { fontFamily: 'PlusJakartaSans_500Medium', fontSize: 13, color: '#1E3A5F', flex: 1.5, textAlign: 'right' },

  amountLine: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 6 },
  amountLineLabel: { fontFamily: 'PlusJakartaSans_400Regular', fontSize: 14, color: COLORS.textSecondary },
  amountLineValue: { fontFamily: 'PlusJakartaSans_500Medium', fontSize: 14, color: '#1E3A5F' },
  amountDivider: { height: 1, backgroundColor: '#F1F5F9', marginVertical: SPACING.sm },
  amountTotalLabel: { fontFamily: 'PlusJakartaSans_700Bold', fontSize: 16, color: '#1E3A5F' },
  amountTotalValue: { fontFamily: 'PlusJakartaSans_700Bold', fontSize: 20, color: '#1E3A5F' },

  legalCard: {
    backgroundColor: COLORS.subtle, borderRadius: RADIUS.md, padding: SPACING.md,
  },
  legalText: { fontFamily: 'PlusJakartaSans_400Regular', fontSize: 11, color: COLORS.textTertiary, lineHeight: 16, marginBottom: 6 },

  actionsRow: { flexDirection: 'row', gap: SPACING.md, marginHorizontal: SPACING.xl, marginTop: SPACING.xl },
  actionButton: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: SPACING.sm, paddingVertical: SPACING.md, borderRadius: RADIUS.sm, backgroundColor: COLORS.infoSoft,
  },
  actionText: { fontFamily: 'PlusJakartaSans_600SemiBold', fontSize: 14, color: COLORS.brandPrimary },
});
