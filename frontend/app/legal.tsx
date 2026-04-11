import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  Linking,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { COLORS, FONTS, SPACING, RADIUS } from '../src/theme';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type Tab = 'cgu' | 'cgv' | 'privacy' | 'mentions' | 'mediation';

const TABS: { key: Tab; label: string }[] = [
  { key: 'cgu', label: 'CGU' },
  { key: 'cgv', label: 'CGV' },
  { key: 'privacy', label: 'RGPD' },
  { key: 'mentions', label: 'Mentions' },
  { key: 'mediation', label: 'Médiation' },
];

// ---------------------------------------------------------------------------
// Main screen
// ---------------------------------------------------------------------------

export default function LegalScreen() {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<Tab>('cgu');

  const openLink = useCallback((url: string) => {
    Linking.openURL(url).catch(() => {});
  }, []);

  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity
          onPress={() => router.back()}
          style={styles.backBtn}
          accessibilityLabel="Retour"
          accessibilityRole="button"
        >
          <Ionicons name="arrow-back" size={24} color={COLORS.textPrimary} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Informations legales</Text>
        <View style={styles.headerSpacer} />
      </View>

      {/* Tab bar */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.tabBarScroll}
        contentContainerStyle={styles.tabBarContent}
      >
        {TABS.map((tab) => (
          <TouchableOpacity
            key={tab.key}
            style={[styles.tab, activeTab === tab.key && styles.tabActive]}
            onPress={() => setActiveTab(tab.key)}
            accessibilityRole="tab"
            accessibilityState={{ selected: activeTab === tab.key }}
          >
            <Text
              style={[
                styles.tabText,
                activeTab === tab.key && styles.tabTextActive,
              ]}
            >
              {tab.label}
            </Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      {/* Content */}
      <ScrollView
        style={styles.content}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.contentContainer}
      >
        {activeTab === 'cgu' && <CGU />}
        {activeTab === 'cgv' && <CGV />}
        {activeTab === 'privacy' && <Privacy />}
        {activeTab === 'mentions' && <MentionsLegales openLink={openLink} />}
        {activeTab === 'mediation' && <Mediation openLink={openLink} />}
      </ScrollView>
    </SafeAreaView>
  );
}

// ---------------------------------------------------------------------------
// Reusable sub-components
// ---------------------------------------------------------------------------

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{title}</Text>
      {children}
    </View>
  );
}

function P({ children }: { children: React.ReactNode }) {
  return <Text style={styles.paragraph}>{children}</Text>;
}

function B({ children }: { children: React.ReactNode }) {
  return <Text style={styles.bold}>{children}</Text>;
}

function LastUpdate() {
  return <Text style={styles.lastUpdate}>Derniere mise a jour : 27 mars 2026</Text>;
}

// ---------------------------------------------------------------------------
// CGU — Conditions Generales d'Utilisation
// ---------------------------------------------------------------------------

function CGU() {
  return (
    <>
      <LastUpdate />

      <Section title="Article 1 — Objet">
        <P>
          Les presentes Conditions Generales d'Utilisation (ci-apres « CGU ») regissent
          l'acces et l'utilisation de l'application mobile Altio (ci-apres « la
          Plateforme »), editee par Altio SAS, societe par actions simplifiee en cours
          d'immatriculation au Registre du Commerce et des Societes de Thonon-les-Bains
          (ci-apres « Altio » ou « l'Editeur »).
          {'\n\n'}
          La Plateforme est accessible sur les systemes iOS et Android. Toute utilisation
          de la Plateforme implique l'acceptation pleine et entiere des presentes CGU.
          Si vous n'acceptez pas ces conditions, vous devez cesser immediatement toute
          utilisation de la Plateforme.
        </P>
      </Section>

      <Section title="Article 2 — Definitions">
        <P>
          <B>« Proprietaire »</B> : toute personne physique ou morale utilisant la
          Plateforme pour gerer ses biens immobiliers en location saisonniere et
          commander des prestations de service.
          {'\n\n'}
          <B>« Prestataire »</B> : tout professionnel independant inscrit sur la
          Plateforme proposant des services de maintenance, reparation, menage,
          conciergerie, plomberie, electricite, serrurerie ou tout autre service
          reference sur la Plateforme.
          {'\n\n'}
          <B>« Mission »</B> : toute prestation de service commandee par un
          Proprietaire a un Prestataire via la Plateforme, qu'elle soit planifiee
          ou declaree en urgence.
          {'\n\n'}
          <B>« Urgence »</B> : demande d'intervention immediate publiee par un
          Proprietaire, attribuee selon le principe du premier prestataire acceptant.
          {'\n\n'}
          <B>« Utilisateur »</B> : toute personne accedant a la Plateforme, qu'elle
          soit Proprietaire ou Prestataire.
          {'\n\n'}
          <B>« Mandat de facturation »</B> : autorisation donnee par le Prestataire a
          Altio d'emettre des factures en son nom et pour son compte, conformement a
          l'article 289-I-2 du Code general des impots.
        </P>
      </Section>

      <Section title="Article 3 — Acces a la Plateforme">
        <P>
          L'acces a la Plateforme est reserve aux personnes majeures (18 ans minimum)
          disposant de la capacite juridique de contracter. L'inscription est effectuee
          par email, numero de telephone ou connexion sociale (Google, Apple).
          {'\n\n'}
          L'Utilisateur est seul responsable de la confidentialite de ses identifiants
          de connexion et de toute activite effectuee depuis son compte. En cas
          d'utilisation non autorisee, l'Utilisateur doit en informer Altio sans delai
          a l'adresse contact@altio.app.
          {'\n\n'}
          Altio se reserve le droit de suspendre ou supprimer tout compte en cas de
          violation des presentes CGU, de fraude ou de comportement portant atteinte
          aux autres Utilisateurs.
        </P>
      </Section>

      <Section title="Article 4 — Role d'Altio — Mandataire">
        <P>
          Altio agit exclusivement en qualite de <B>mandataire et d'intermediaire
          technique</B>. La Plateforme facilite la mise en relation entre Proprietaires
          et Prestataires ainsi que le traitement securise des paiements.
          {'\n\n'}
          Altio <B>n'execute aucune prestation de service</B>. Le Prestataire est un
          professionnel independant, seul responsable de la qualite, de la conformite
          et de l'execution de ses prestations.
          {'\n\n'}
          Le contrat de prestation est conclu directement entre le Proprietaire et le
          Prestataire. Altio n'est pas partie a ce contrat.
        </P>
      </Section>

      <Section title="Article 5 — Services proposes">
        <P>
          La Plateforme permet notamment :{'\n'}
          {'\u2022'} La mise en relation entre Proprietaires et Prestataires locaux{'\n'}
          {'\u2022'} La publication de missions planifiees ou d'urgences{'\n'}
          {'\u2022'} La gestion du cycle de vie complet d'une mission (publication, candidatures, attribution, execution, validation){'\n'}
          {'\u2022'} La messagerie in-app entre Proprietaire et Prestataire assignes{'\n'}
          {'\u2022'} Le paiement securise via Stripe{'\n'}
          {'\u2022'} La generation automatique de factures electroniques conformes{'\n'}
          {'\u2022'} Le systeme de notation et d'avis{'\n'}
          {'\u2022'} La gestion de plusieurs biens immobiliers
        </P>
      </Section>

      <Section title="Article 6 — Obligations des Utilisateurs">
        <P>
          <B>Tout Utilisateur s'engage a :</B>{'\n'}
          {'\u2022'} Fournir des informations exactes, completes et a jour lors de l'inscription et tout au long de l'utilisation{'\n'}
          {'\u2022'} Ne pas utiliser la Plateforme a des fins illicites, frauduleuses ou contraires aux bonnes moeurs{'\n'}
          {'\u2022'} Respecter les autres Utilisateurs dans toute interaction{'\n'}
          {'\u2022'} Ne pas contourner le systeme de paiement de la Plateforme (interdiction de transaction hors plateforme){'\n'}
          {'\u2022'} Ne pas communiquer ses coordonnees personnelles (telephone, email) dans la messagerie avant assignation d'une mission{'\n'}
          {'\u2022'} Signaler tout comportement suspect ou inapproprie a contact@altio.app
          {'\n\n'}
          <B>Le Prestataire s'engage en outre a :</B>{'\n'}
          {'\u2022'} Disposer des qualifications, assurances et autorisations necessaires a l'exercice de son activite{'\n'}
          {'\u2022'} Executer les missions acceptees avec diligence et dans les delais convenus{'\n'}
          {'\u2022'} Accepter le mandat de facturation prevu a l'article 8{'\n'}
          {'\u2022'} Maintenir a jour son profil, ses zones d'intervention et ses categories de competences
        </P>
      </Section>

      <Section title="Article 7 — Paiements et frais de service">
        <P>
          Les paiements sont traites exclusivement par Stripe Payments Europe, Ltd.,
          prestataire de paiement agree et certifie PCI DSS Level 1.
          {'\n\n'}
          Des frais de service sont appliques par Altio sur chaque mission completee :{'\n'}
          {'\u2022'} Le Proprietaire supporte des frais de service de 10% HT du montant de la prestation, factures par Altio{'\n'}
          {'\u2022'} Le Prestataire supporte une commission de 10% HT du montant de la prestation, facturee par Altio
          {'\n\n'}
          Le paiement est declenche uniquement apres validation de l'intervention par
          le Proprietaire. Aucun acompte n'est preleve.
          {'\n\n'}
          Altio ne stocke aucune donnee de carte bancaire. L'ensemble des informations
          de paiement est gere directement par Stripe.
        </P>
      </Section>

      <Section title="Article 8 — Mandat de facturation">
        <P>
          En s'inscrivant sur la Plateforme en qualite de Prestataire, celui-ci accorde
          a Altio un <B>mandat de facturation</B> conformement a l'article 289-I-2 du
          Code general des impots (CGI).
          {'\n\n'}
          Ce mandat autorise Altio a emettre des factures au nom et pour le compte du
          Prestataire a destination des Proprietaires, pour chaque prestation realisee
          via la Plateforme.
          {'\n\n'}
          <B>Conditions du mandat :</B>{'\n'}
          {'\u2022'} Le Prestataire reste seul redevable de la TVA au titre de ses prestations{'\n'}
          {'\u2022'} Chaque facture emise en son nom est notifiee au Prestataire dans l'application{'\n'}
          {'\u2022'} Le Prestataire dispose d'un delai de 7 jours pour contester une facture{'\n'}
          {'\u2022'} L'acceptation est tacite passe ce delai{'\n'}
          {'\u2022'} Le Prestataire peut revoquer le mandat a tout moment, sous reserve d'un preavis de 30 jours
          {'\n\n'}
          Chaque facture emise en mandat porte la mention : « Facture emise par Altio
          SAS (SIREN xxx) au nom et pour le compte de [Prestataire] (SIREN yyy) en
          vertu d'un mandat de facturation ».
        </P>
      </Section>

      <Section title="Article 9 — Droit de retractation">
        <P>
          Conformement a l'article L221-18 du Code de la consommation, le Proprietaire
          dispose d'un delai de <B>14 jours</B> a compter de l'acceptation de la
          commande ou du devis pour exercer son droit de retractation, sans avoir a
          motiver sa decision ni a supporter de penalites.
          {'\n\n'}
          <B>Exceptions (article L221-28 du Code de la consommation) :</B>{'\n'}
          Ce droit ne s'applique pas lorsque :{'\n'}
          {'\u2022'} La prestation de service a ete pleinement executee et que le Proprietaire avait expressement consenti a son execution immediate en renoncant a son droit de retractation{'\n'}
          {'\u2022'} L'execution de la prestation a commence avec l'accord expres du consommateur
          {'\n\n'}
          En cas d'urgence, en demandant une execution immediate, le Proprietaire
          consent expressement a perdre son droit de retractation une fois la prestation
          realisee.
          {'\n\n'}
          En validant une intervention sur Altio, le Proprietaire reconnait que la
          prestation a ete realisee et renonce a exercer son droit de retractation pour
          cette prestation specifique.
          {'\n\n'}
          <B>Formulaire type de retractation</B> (annexe a l'article L221-5 du Code de
          la consommation) :{'\n'}
          « A l'attention d'Altio SAS, contact@altio.app :{'\n'}
          Je notifie par la presente ma retractation du contrat portant sur la prestation
          de service ci-dessous :{'\n'}
          {'\u2022'} Reference de la mission : [numero]{'\n'}
          {'\u2022'} Commandee le : [date]{'\n'}
          {'\u2022'} Nom du consommateur : [nom]{'\n'}
          {'\u2022'} Adresse : [adresse]{'\n'}
          {'\u2022'} Date : [date]{'\n'}
          {'\u2022'} Signature (en cas de notification papier) »
        </P>
      </Section>

      <Section title="Article 10 — Propriete intellectuelle">
        <P>
          L'ensemble des elements constituant la Plateforme (code source, graphismes,
          logo, textes, architecture, bases de donnees) est la propriete exclusive
          d'Altio SAS ou de ses licensors et est protege par le droit francais et
          international de la propriete intellectuelle.
          {'\n\n'}
          Toute reproduction, representation, modification, publication ou adaptation
          totale ou partielle de ces elements, sans l'autorisation prealable et ecrite
          d'Altio SAS, est strictement interdite et constitue une contrefacon
          sanctionnee par les articles L335-2 et suivants du Code de la propriete
          intellectuelle.
        </P>
      </Section>

      <Section title="Article 11 — Responsabilite">
        <P>
          Altio SAS est responsable du bon fonctionnement de la Plateforme de mise en
          relation et du traitement securise des paiements.
          {'\n\n'}
          Altio SAS <B>ne saurait etre tenue responsable</B> :{'\n'}
          {'\u2022'} Des dommages causes par le Prestataire lors de l'execution de la prestation{'\n'}
          {'\u2022'} Des retards ou manquements du Prestataire dans l'execution de sa mission{'\n'}
          {'\u2022'} De la qualite ou de la conformite des travaux realises par le Prestataire{'\n'}
          {'\u2022'} Des litiges directs entre le Proprietaire et le Prestataire portant sur l'execution de la prestation{'\n'}
          {'\u2022'} Des interruptions temporaires de la Plateforme pour maintenance ou mise a jour{'\n'}
          {'\u2022'} De tout prejudice indirect (perte de benefice, perte de donnees, prejudice moral)
          {'\n\n'}
          La responsabilite d'Altio SAS, si elle venait a etre engagee, serait limitee
          au montant des frais de service percus pour la mission concernee.
        </P>
      </Section>

      <Section title="Article 12 — Donnees personnelles">
        <P>
          Les donnees personnelles collectees sont traitees conformement au Reglement
          General sur la Protection des Donnees (RGPD — Reglement UE 2016/679) et a la
          loi Informatique et Libertes du 6 janvier 1978 modifiee.
          {'\n\n'}
          Pour plus de details, consultez notre Politique de confidentialite accessible
          dans l'onglet « RGPD » de la presente section.
        </P>
      </Section>

      <Section title="Article 13 — Resiliation">
        <P>
          L'Utilisateur peut supprimer son compte a tout moment depuis les parametres de
          l'application. La suppression est effective sous 48 heures et entraine la
          suppression de toutes les donnees personnelles conformement au RGPD (article
          17 — droit a l'effacement), a l'exception des donnees dont la conservation est
          imposee par la loi (factures : 10 ans, logs d'audit : 5 ans).
          {'\n\n'}
          Les missions en cours doivent etre completees ou annulees avant la suppression
          du compte.
          {'\n\n'}
          Altio se reserve le droit de resilier le compte d'un Utilisateur en cas de
          manquement grave aux presentes CGU, apres mise en demeure restee sans effet
          pendant 15 jours.
        </P>
      </Section>

      <Section title="Article 14 — Modification des CGU">
        <P>
          Altio se reserve le droit de modifier les presentes CGU a tout moment. Les
          Utilisateurs seront informes de toute modification substantielle par
          notification in-app et/ou par email au moins 30 jours avant l'entree en
          vigueur des nouvelles conditions.
          {'\n\n'}
          La poursuite de l'utilisation de la Plateforme apres l'entree en vigueur des
          modifications vaut acceptation des nouvelles CGU.
        </P>
      </Section>

      <Section title="Article 15 — Droit applicable et litiges">
        <P>
          Les presentes CGU sont soumises au droit francais.
          {'\n\n'}
          En cas de litige, une solution amiable sera recherchee prealablement a toute
          action judiciaire. A defaut d'accord amiable, le litige sera soumis aux
          tribunaux competents conformement aux regles de droit commun.
          {'\n\n'}
          Le Proprietaire consommateur peut recourir gratuitement au mediateur de la
          consommation designe a l'article « Mediation » des presentes.
          {'\n\n'}
          Mediateur : CMAP — Centre de Mediation et d'Arbitrage de Paris{'\n'}
          39, avenue Franklin D. Roosevelt, 75008 Paris{'\n'}
          https://www.cmap.fr
        </P>
      </Section>
    </>
  );
}

// ---------------------------------------------------------------------------
// CGV — Conditions Generales de Vente
// ---------------------------------------------------------------------------

function CGV() {
  return (
    <>
      <LastUpdate />

      <Section title="Article 1 — Objet">
        <P>
          Les presentes Conditions Generales de Vente (ci-apres « CGV ») regissent les
          conditions dans lesquelles Altio SAS fournit aux Proprietaires un service de
          mise en relation avec des Prestataires de services locaux (plomberie,
          electricite, serrurerie, menage, conciergerie, maintenance, etc.) via
          l'application Altio.
          {'\n\n'}
          Altio agit en qualite de <B>mandataire</B> : la Plateforme facilite la mise en
          relation et la transaction, mais n'execute pas les prestations de service. Le
          Prestataire est un professionnel independant, seul responsable de la realisation
          de la prestation.
        </P>
      </Section>

      <Section title="Article 2 — Prix et frais de service">
        <P>
          Le prix de chaque prestation est fixe par le Prestataire ou convenu entre le
          Proprietaire et le Prestataire (via le systeme de devis de la Plateforme).
          {'\n\n'}
          En sus du prix de la prestation, des <B>frais de service</B> sont factures au
          Proprietaire par Altio SAS :{'\n'}
          {'\u2022'} Frais de service : <B>10% HT</B> du montant de la prestation{'\n'}
          {'\u2022'} TVA applicable sur les frais de service : 20%
          {'\n\n'}
          Le montant total affiche dans l'application inclut le prix de la prestation et
          les frais de service Altio.
          {'\n\n'}
          <B>Exemple pour une prestation de 200 euros HT :</B>{'\n'}
          {'\u2022'} Prestation : 200,00 euros HT{'\n'}
          {'\u2022'} Frais de service Altio : 20,00 euros HT (soit 24,00 euros TTC){'\n'}
          {'\u2022'} Total Proprietaire : 220,00 euros HT / 264,00 euros TTC
          {'\n\n'}
          Les prix sont indiques en euros. Le detail est presente sur les factures
          electroniques accessibles dans l'application.
        </P>
      </Section>

      <Section title="Article 3 — Modalites de paiement">
        <P>
          Le paiement s'effectue exclusivement par carte bancaire via <B>Stripe
          Payments Europe, Ltd.</B>, prestataire de paiement agree et certifie PCI DSS
          Level 1.
          {'\n\n'}
          Le paiement est <B>declenche uniquement</B> lorsque le Proprietaire valide
          l'intervention apres son execution par le Prestataire. Aucun acompte n'est
          demande au moment de la commande.
          {'\n\n'}
          En cas de litige ouvert par le Proprietaire, le paiement est suspendu jusqu'a
          resolution du litige.
          {'\n\n'}
          Altio SAS ne stocke aucune donnee de carte bancaire. L'ensemble des
          informations de paiement est gere directement par Stripe dans un environnement
          securise.
        </P>
      </Section>

      <Section title="Article 4 — Facturation electronique">
        <P>
          Chaque mission completee genere <B>trois factures distinctes</B> :{'\n\n'}
          <B>Facture 1 — Prestation (Prestataire vers Proprietaire)</B>{'\n'}
          Emise par Altio au nom et pour le compte du Prestataire en vertu du mandat de
          facturation (article 289-I-2 du CGI). Mentionne le prix de la prestation HT,
          la TVA applicable selon le statut du Prestataire, et le total TTC.{'\n\n'}
          <B>Facture 2 — Frais de service (Altio vers Proprietaire)</B>{'\n'}
          Emise par Altio en son nom propre. Objet : frais de mise en relation et
          service plateforme. Montant : 10% HT du prix de la prestation + TVA 20%.{'\n\n'}
          <B>Facture 3 — Commission plateforme (Altio vers Prestataire)</B>{'\n'}
          Emise par Altio en son nom propre. Objet : commission de service plateforme.
          Montant : 10% HT du prix de la prestation + TVA 20%.
          {'\n\n'}
          Les factures sont generees au format electronique conforme a la reforme de la
          facturation electronique applicable a partir de septembre 2026 (format
          Factur-X / CII / UBL). Elles sont accessibles dans l'application et
          conservees pendant 10 ans conformement aux obligations comptables.
        </P>
      </Section>

      <Section title="Article 5 — Droit de retractation">
        <P>
          Conformement a l'article L221-18 du Code de la consommation, le Proprietaire
          dispose d'un delai de <B>14 jours</B> a compter de l'acceptation du devis ou de
          la commande pour exercer son droit de retractation, sans avoir a motiver sa
          decision.
          {'\n\n'}
          <B>Exception (article L221-28 du Code de la consommation) :</B> lorsque le
          Proprietaire demande une execution immediate de la prestation (notamment en
          cas d'urgence), il reconnait expressement renoncer a son droit de retractation
          une fois la prestation pleinement executee.
          {'\n\n'}
          <B>Formulaire type de retractation</B> (annexe a l'article L221-5 du Code de la
          consommation) :{'\n'}
          « A l'attention d'Altio SAS, contact@altio.app :{'\n'}
          Je notifie par la presente ma retractation du contrat portant sur la prestation
          de service ci-dessous :{'\n'}
          {'\u2022'} Reference de la mission : [numero]{'\n'}
          {'\u2022'} Commandee le : [date]{'\n'}
          {'\u2022'} Nom du consommateur : [nom]{'\n'}
          {'\u2022'} Adresse : [adresse]{'\n'}
          {'\u2022'} Date : [date]{'\n'}
          {'\u2022'} Signature (en cas de notification papier) »
        </P>
      </Section>

      <Section title="Article 6 — Execution du service">
        <P>
          Altio SAS n'execute pas la prestation de service. Son role se limite a la mise
          en relation entre le Proprietaire et le Prestataire, ainsi qu'a la facilitation
          du paiement.
          {'\n\n'}
          Le Prestataire est un professionnel independant inscrit sur la Plateforme. Il
          est seul responsable de la qualite, de la conformite et de l'execution de la
          prestation dans les delais convenus.
          {'\n\n'}
          Altio SAS s'engage a verifier l'identite et les qualifications declarees des
          Prestataires lors de leur inscription, sans que cela ne constitue une garantie
          sur la qualite des prestations fournies.
          {'\n\n'}
          <B>Cycle de vie d'une mission :</B>{'\n'}
          {'\u2022'} Le Proprietaire publie une mission et selectionne un Prestataire parmi les candidats{'\n'}
          {'\u2022'} Le Prestataire accepte confirme le debut de l'intervention{'\n'}
          {'\u2022'} Le Prestataire marque l'intervention comme terminee{'\n'}
          {'\u2022'} Le Proprietaire valide la prestation ou ouvre un litige{'\n'}
          {'\u2022'} Le paiement est declenche apres validation
        </P>
      </Section>

      <Section title="Article 7 — Responsabilite">
        <P>
          Altio SAS est responsable du bon fonctionnement de la Plateforme de mise en
          relation et du traitement securise des paiements.
          {'\n\n'}
          <B>Altio SAS ne saurait etre tenue responsable :</B>{'\n'}
          {'\u2022'} Des dommages causes par le Prestataire lors de l'execution de la prestation{'\n'}
          {'\u2022'} Des retards ou manquements du Prestataire{'\n'}
          {'\u2022'} De la qualite ou de la conformite des travaux realises{'\n'}
          {'\u2022'} Des litiges directs entre le Proprietaire et le Prestataire
          {'\n\n'}
          En cas de litige lie a la prestation, le Proprietaire peut ouvrir un litige via
          l'application. Altio SAS intervient alors en tant que facilitateur pour aider a
          la resolution amiable.
        </P>
      </Section>

      <Section title="Article 8 — Garantie legale de conformite">
        <P>
          Conformement aux articles L217-3 et suivants du Code de la consommation, le
          consommateur beneficie de la garantie legale de conformite pour les services
          fournis par Altio SAS (service de mise en relation).
          {'\n\n'}
          Cette garantie s'applique aux services fournis directement par Altio SAS
          (mise en relation, traitement des paiements) et non aux prestations realisees
          par les Prestataires, qui relevent de la responsabilite contractuelle de ces
          derniers.
        </P>
      </Section>

      <Section title="Article 9 — Reclamations et mediation">
        <P>
          Pour toute reclamation relative aux services Altio, le Proprietaire peut
          contacter le service client a l'adresse <B>contact@altio.app</B>. Un accuse de
          reception sera envoye sous 48 heures et une reponse sous 5 jours ouvres.
          {'\n\n'}
          En cas de litige non resolu, le Proprietaire peut recourir gratuitement au
          mediateur de la consommation :{'\n\n'}
          <B>CMAP — Centre de Mediation et d'Arbitrage de Paris</B>{'\n'}
          39, avenue Franklin D. Roosevelt{'\n'}
          75008 Paris{'\n'}
          https://www.cmap.fr
          {'\n\n'}
          Plateforme europeenne de reglement en ligne des litiges :{'\n'}
          https://ec.europa.eu/consumers/odr
        </P>
      </Section>

      <Section title="Article 10 — Donnees personnelles">
        <P>
          Les donnees personnelles collectees dans le cadre de l'utilisation des services
          Altio sont traitees conformement au Reglement General sur la Protection des
          Donnees (RGPD) et a la loi Informatique et Libertes.
          {'\n\n'}
          Pour plus de details, consultez notre Politique de confidentialite accessible
          dans l'onglet « RGPD » de la presente section.
        </P>
      </Section>

      <Section title="Article 11 — Droit applicable et juridiction competente">
        <P>
          Les presentes CGV sont soumises au droit francais.
          {'\n\n'}
          En cas de litige, une solution amiable sera recherchee prealablement a toute
          action judiciaire. A defaut, les tribunaux competents seront ceux du ressort du
          domicile du defendeur ou, au choix du demandeur consommateur, du lieu de
          livraison effective du service (article R631-3 du Code de la consommation).
        </P>
      </Section>
    </>
  );
}

// ---------------------------------------------------------------------------
// Politique de confidentialite / RGPD
// ---------------------------------------------------------------------------

function Privacy() {
  return (
    <>
      <LastUpdate />

      <Section title="Article 1 — Responsable du traitement">
        <P>
          <B>Altio SAS</B>{'\n'}
          Societe par actions simplifiee en cours d'immatriculation{'\n'}
          Siege social : Morzine, 74110 Haute-Savoie, France{'\n'}
          Email DPO (Delegue a la Protection des Donnees) : dpo@altio.app
          {'\n\n'}
          Altio SAS est responsable du traitement des donnees personnelles collectees
          dans le cadre de l'utilisation de l'application Altio, au sens du Reglement
          General sur la Protection des Donnees (RGPD — Reglement UE 2016/679) et de la
          loi Informatique et Libertes du 6 janvier 1978 modifiee.
        </P>
      </Section>

      <Section title="Article 2 — Donnees collectees">
        <P>
          Nous collectons les categories de donnees suivantes :{'\n\n'}
          <B>Donnees d'identite :</B> nom, prenom, adresse email, numero de telephone,
          photo de profil{'\n\n'}
          <B>Donnees professionnelles (Prestataires) :</B> numero SIREN/SIRET, numero de
          TVA intracommunautaire, adresse de facturation, qualifications et
          certifications, attestation d'assurance{'\n\n'}
          <B>Donnees de localisation :</B> adresse des biens immobiliers (Proprietaires),
          zone d'intervention (Prestataires), geolocalisation en temps reel (uniquement si
          autorisee par l'Utilisateur){'\n\n'}
          <B>Donnees de paiement :</B> gerees exclusivement par Stripe — Altio ne stocke
          jamais les numeros de carte bancaire{'\n\n'}
          <B>Donnees d'activite :</B> missions creees et realisees, photos
          d'intervention, messages echanges via la messagerie in-app, avis et notations,
          historique des connexions{'\n\n'}
          <B>Donnees techniques :</B> adresse IP, type d'appareil, version de l'OS,
          identifiant push notification, logs d'utilisation
        </P>
      </Section>

      <Section title="Article 3 — Finalites du traitement">
        <P>
          Vos donnees sont utilisees pour les finalites suivantes :{'\n'}
          {'\u2022'} <B>Execution du contrat :</B> fournir les services de mise en relation, gerer les missions, traiter les paiements{'\n'}
          {'\u2022'} <B>Facturation :</B> emettre des factures electroniques conformes a la legislation francaise et europeenne{'\n'}
          {'\u2022'} <B>Communication :</B> envoyer des notifications de mission, des confirmations de paiement, des rappels{'\n'}
          {'\u2022'} <B>Securite :</B> prevenir les fraudes, detecter les comportements anormaux, assurer la securite de la Plateforme{'\n'}
          {'\u2022'} <B>Amelioration du service :</B> analyses statistiques anonymisees pour ameliorer l'experience utilisateur{'\n'}
          {'\u2022'} <B>Obligations legales :</B> respect des obligations fiscales, comptables et reglementaires
        </P>
      </Section>

      <Section title="Article 4 — Base legale des traitements">
        <P>
          Les traitements de donnees personnelles reposent sur les bases legales
          suivantes :{'\n\n'}
          <B>Execution du contrat</B> (article 6.1.b du RGPD) : les donnees sont
          necessaires a la fourniture des services Altio et a l'execution des CGU
          acceptees par l'Utilisateur.{'\n\n'}
          <B>Obligation legale</B> (article 6.1.c du RGPD) : conservation des factures
          pendant 10 ans (Code de commerce), obligations fiscales et comptables, lutte
          contre la fraude.{'\n\n'}
          <B>Interet legitime</B> (article 6.1.f du RGPD) : securite de la Plateforme,
          amelioration des services, prevention des abus. Cet interet est mis en balance
          avec vos droits et libertes.{'\n\n'}
          <B>Consentement</B> (article 6.1.a du RGPD) : geolocalisation en temps reel,
          notifications push. Ce consentement peut etre retire a tout moment via les
          parametres de votre appareil.
        </P>
      </Section>

      <Section title="Article 5 — Duree de conservation">
        <P>
          Les donnees sont conservees pour les durees suivantes :{'\n\n'}
          {'\u2022'} <B>Donnees de compte :</B> jusqu'a la suppression du compte par l'Utilisateur, puis 3 ans a compter de la derniere activite (prescription){'\n'}
          {'\u2022'} <B>Factures et donnees comptables :</B> 10 ans (obligation legale — article L123-22 du Code de commerce){'\n'}
          {'\u2022'} <B>Logs d'audit et de securite :</B> 5 ans{'\n'}
          {'\u2022'} <B>Donnees de session et cookies :</B> 30 jours{'\n'}
          {'\u2022'} <B>Messages in-app :</B> 3 ans apres la cloture de la mission associee{'\n'}
          {'\u2022'} <B>Avis et notations :</B> tant que le compte est actif, puis 3 ans apres suppression
          {'\n\n'}
          Au-dela de ces durees, les donnees sont supprimees ou anonymisees de maniere
          irreversible.
        </P>
      </Section>

      <Section title="Article 6 — Vos droits (RGPD)">
        <P>
          Conformement au RGPD (Reglement UE 2016/679) et a la loi Informatique et
          Libertes, vous disposez des droits suivants :{'\n\n'}
          <B>Droit d'acces</B> (article 15) : obtenir la confirmation que vos donnees
          sont traitees et en recevoir une copie.{'\n\n'}
          <B>Droit de rectification</B> (article 16) : corriger vos donnees inexactes
          ou incompletes. Vous pouvez modifier la plupart de vos informations directement
          depuis votre profil dans l'application.{'\n\n'}
          <B>Droit a l'effacement</B> (article 17) : demander la suppression de vos
          donnees personnelles. Un bouton de suppression de compte est disponible dans les
          parametres de l'application. Les donnees dont la conservation est imposee par la
          loi (factures, logs d'audit) seront conservees jusqu'a l'expiration du delai
          legal.{'\n\n'}
          <B>Droit a la portabilite</B> (article 20) : recevoir vos donnees dans un
          format structure, couramment utilise et lisible par machine (export CSV
          disponible dans l'application).{'\n\n'}
          <B>Droit d'opposition</B> (article 21) : vous opposer au traitement de vos
          donnees fonde sur l'interet legitime, notamment a des fins de prospection.{'\n\n'}
          <B>Droit a la limitation</B> (article 18) : demander la limitation du
          traitement de vos donnees dans les cas prevus par le RGPD.{'\n\n'}
          <B>Droit de retirer votre consentement</B> a tout moment pour les traitements
          fondes sur le consentement (geolocalisation, notifications push).{'\n\n'}
          <B>Directives post-mortem</B> : vous pouvez definir des directives relatives
          au sort de vos donnees apres votre deces (loi pour une Republique numerique,
          article 40-1 de la loi Informatique et Libertes).
          {'\n\n'}
          <B>Pour exercer vos droits :</B> envoyez un email a dpo@altio.app en precisant
          votre identite et le droit que vous souhaitez exercer. Reponse sous 30 jours
          maximum.
          {'\n\n'}
          En cas de difficulte, vous pouvez introduire une reclamation aupres de la CNIL
          (Commission Nationale de l'Informatique et des Libertes) : www.cnil.fr
        </P>
      </Section>

      <Section title="Article 7 — Cookies et traceurs">
        <P>
          L'application mobile Altio n'utilise pas de cookies au sens de la directive
          ePrivacy.
          {'\n\n'}
          Les tokens de session sont stockes de maniere securisee dans le Keychain iOS
          ou le Keystore Android. Ces tokens sont necessaires au fonctionnement de
          l'application et ne constituent pas des traceurs publicitaires.
          {'\n\n'}
          Aucun traceur publicitaire tiers n'est integre dans l'application.
        </P>
      </Section>

      <Section title="Article 8 — Destinataires des donnees">
        <P>
          Vos donnees peuvent etre communiquees aux categories de destinataires
          suivantes :{'\n\n'}
          {'\u2022'} <B>Les autres Utilisateurs de la Plateforme :</B> dans le cadre d'une mission (profil du Prestataire visible par le Proprietaire, adresse du bien partagee apres acceptation de la mission){'\n'}
          {'\u2022'} <B>Stripe Payments Europe, Ltd. :</B> pour le traitement des paiements{'\n'}
          {'\u2022'} <B>Supabase Inc. :</B> hebergement des donnees (serveurs EU — Frankfurt){'\n'}
          {'\u2022'} <B>Les autorites competentes :</B> en cas d'obligation legale ou de requisition judiciaire
          {'\n\n'}
          Aucune donnee n'est vendue ou transmise a des tiers a des fins de prospection
          commerciale.
        </P>
      </Section>

      <Section title="Article 9 — Transferts hors Union europeenne">
        <P>
          Vos donnees sont hebergees principalement sur des serveurs situes dans l'Union
          europeenne :{'\n'}
          {'\u2022'} <B>Supabase :</B> serveurs EU — Frankfurt (EU-WEST-1){'\n'}
          {'\u2022'} <B>Stripe :</B> siege europeen a Dublin, certifie PCI DSS Level 1
          {'\n\n'}
          En cas de transfert de donnees vers un pays tiers (notamment les Etats-Unis
          pour certains services techniques), des garanties adequates sont mises en place
          conformement au RGPD : clauses contractuelles types approuvees par la Commission
          europeenne, adequation du cadre EU-US Data Privacy Framework.
        </P>
      </Section>

      <Section title="Article 10 — Securite des donnees">
        <P>
          Altio met en oeuvre les mesures techniques et organisationnelles appropriees
          pour garantir la securite de vos donnees :{'\n\n'}
          {'\u2022'} Chiffrement des donnees en transit (TLS 1.3) et au repos{'\n'}
          {'\u2022'} Authentification securisee (Supabase Auth){'\n'}
          {'\u2022'} Row Level Security (RLS) pour l'isolation des donnees entre utilisateurs{'\n'}
          {'\u2022'} Aucune donnee de carte bancaire stockee (delegue a Stripe, certifie PCI DSS){'\n'}
          {'\u2022'} Journalisation des acces et audit regulier{'\n'}
          {'\u2022'} Politique de mots de passe robustes
        </P>
      </Section>

      <Section title="Article 11 — Contact et reclamation">
        <P>
          Pour toute question relative a la protection de vos donnees personnelles :{'\n\n'}
          <B>Delegue a la Protection des Donnees (DPO)</B>{'\n'}
          Email : dpo@altio.app{'\n\n'}
          Vous pouvez egalement saisir l'autorite de controle competente :{'\n\n'}
          <B>CNIL — Commission Nationale de l'Informatique et des Libertes</B>{'\n'}
          3 Place de Fontenoy, TSA 80715{'\n'}
          75334 Paris Cedex 07{'\n'}
          www.cnil.fr
        </P>
      </Section>
    </>
  );
}

// ---------------------------------------------------------------------------
// Mentions legales
// ---------------------------------------------------------------------------

function MentionsLegales({ openLink }: { openLink: (url: string) => void }) {
  return (
    <>
      <Section title="Editeur de l'application">
        <P>
          <B>Altio SAS</B>{'\n'}
          Societe par actions simplifiee{'\n'}
          SIREN : en cours d'immatriculation{'\n'}
          Capital social : en cours de constitution{'\n'}
          Siege social : Morzine, 74110 Haute-Savoie, France{'\n'}
          RCS : Thonon-les-Bains (en cours){'\n'}
          TVA intracommunautaire : en cours d'attribution{'\n\n'}
          Directeur de la publication : Maxime, President{'\n'}
          Email : contact@altio.app
        </P>
      </Section>

      <Section title="Hebergement">
        <P>
          <B>Hebergement des donnees :</B>{'\n'}
          Supabase Inc.{'\n'}
          Serveurs : Frankfurt, Allemagne (EU-WEST-1){'\n'}
          970 Toa Payoh North, #07-04, Singapore 318992{'\n'}
          https://supabase.com
          {'\n\n'}
          <B>Distribution de l'application :</B>{'\n'}
          Expo (EAS — Expo Application Services){'\n'}
          650 Castro Street, Suite 120-290{'\n'}
          Mountain View, CA 94041, USA{'\n'}
          https://expo.dev
        </P>
      </Section>

      <Section title="Paiement">
        <P>
          <B>Stripe Payments Europe, Ltd.</B>{'\n'}
          1 Grand Canal Street Lower{'\n'}
          Grand Canal Dock, Dublin 2, D02 H210, Irlande{'\n'}
          Certifie PCI DSS Level 1{'\n'}
          https://stripe.com
          {'\n\n'}
          Les paiements sont traites par Stripe Connect. Altio SAS ne stocke aucune
          donnee de carte bancaire.
        </P>
      </Section>

      <Section title="Propriete intellectuelle">
        <P>
          L'ensemble du contenu de l'application Altio — incluant mais sans s'y limiter
          le logo, le design, les textes, le code source, les graphismes, l'architecture
          logicielle et les bases de donnees — est la propriete exclusive d'Altio SAS et
          est protege par le droit francais et international de la propriete
          intellectuelle.
          {'\n\n'}
          Toute reproduction, representation, modification, publication, distribution ou
          adaptation totale ou partielle de ces elements, par quelque moyen que ce soit,
          sans l'autorisation prealable et ecrite d'Altio SAS, est interdite et
          constitue une contrefacon sanctionnee par les articles L335-2 et suivants du
          Code de la propriete intellectuelle.
          {'\n\n'}
          Les marques, logos et noms de domaine d'Altio sont des marques deposees ou en
          cours de depot. Toute utilisation non autorisee est interdite.
        </P>
      </Section>

      <Section title="Credits">
        <P>
          Application developpee avec React Native (Expo){'\n'}
          Design system : PlusJakartaSans (Google Fonts, OFL){'\n'}
          Icones : Ionicons, Lucide (MIT License){'\n'}
        </P>
      </Section>

      <Section title="Mediation de la consommation">
        <P>
          Conformement aux articles L611-1 et R612-1 du Code de la consommation, Altio
          SAS propose a ses Utilisateurs consommateurs le recours gratuit a un mediateur
          de la consommation en cas de litige non resolu par le service client.
          {'\n\n'}
          <B>Mediateur designe :</B>{'\n'}
          CMAP — Centre de Mediation et d'Arbitrage de Paris{'\n'}
          39, avenue Franklin D. Roosevelt{'\n'}
          75008 Paris{'\n'}
          https://www.cmap.fr
          {'\n\n'}
          <B>Plateforme europeenne de reglement en ligne des litiges :</B>{'\n'}
          https://ec.europa.eu/consumers/odr
        </P>
      </Section>

      <Section title="Informations pre-contractuelles">
        <P>
          Conformement aux articles L111-1 et suivants du Code de la consommation,
          Altio SAS met a disposition du consommateur, avant la conclusion du contrat :{'\n'}
          {'\u2022'} Les caracteristiques essentielles du service de mise en relation{'\n'}
          {'\u2022'} Le prix du service et les frais applicables (detailles dans les CGV){'\n'}
          {'\u2022'} Les conditions de paiement et de livraison du service{'\n'}
          {'\u2022'} Les informations relatives au droit de retractation{'\n'}
          {'\u2022'} Les garanties legales applicables{'\n'}
          {'\u2022'} Les coordonnees du mediateur de la consommation
        </P>
      </Section>
    </>
  );
}

// ---------------------------------------------------------------------------
// Mediation de la consommation — Tab dedie
// ---------------------------------------------------------------------------

function Mediation({ openLink }: { openLink: (url: string) => void }) {
  return (
    <>
      <Section title="Votre droit a la mediation">
        <P>
          Conformement aux dispositions des articles L611-1 a L616-3 du Code de la
          consommation relatives au reglement amiable des litiges, Altio SAS adhere au
          service de mediation de la consommation designe ci-dessous.
          {'\n\n'}
          En cas de litige que vous n'avez pas pu resoudre directement avec notre
          service client (contact@altio.app), vous pouvez soumettre votre reclamation
          au mediateur de la consommation. Le recours a la mediation est <B>gratuit</B>{' '}
          pour le consommateur.
        </P>
      </Section>

      <Section title="Mediateur designe">
        <P>
          <B>CMAP — Centre de Mediation et d'Arbitrage de Paris</B>{'\n\n'}
          Adresse : 39, avenue Franklin D. Roosevelt, 75008 Paris, France{'\n'}
          Site internet : https://www.cmap.fr{'\n'}
          Email : cmap@cmap.fr
        </P>
      </Section>

      <Section title="Comment saisir le mediateur">
        <P>
          Avant de saisir le mediateur, vous devez <B>obligatoirement</B> avoir tente
          de resoudre votre litige directement aupres d'Altio SAS en adressant une
          reclamation ecrite a contact@altio.app.
          {'\n\n'}
          <B>Delai :</B> si aucune reponse satisfaisante ne vous a ete apportee dans un
          delai de 2 mois a compter de votre reclamation ecrite, vous pouvez saisir le
          mediateur.
          {'\n\n'}
          <B>Pour saisir le mediateur, vous pouvez :</B>{'\n'}
          {'\u2022'} Remplir le formulaire en ligne sur https://www.cmap.fr{'\n'}
          {'\u2022'} Envoyer un courrier au CMAP a l'adresse ci-dessus{'\n'}
          {'\u2022'} Joindre les justificatifs de votre reclamation prealable aupres d'Altio
          {'\n\n'}
          Le mediateur dispose d'un delai de 90 jours pour rendre sa proposition de
          resolution a compter de la notification de la recevabilite du dossier.
        </P>
      </Section>

      <Section title="Plateforme europeenne de reglement en ligne des litiges">
        <P>
          Conformement au Reglement (UE) n° 524/2013, la Commission europeenne met a
          disposition une plateforme de reglement en ligne des litiges (RLL) :{'\n\n'}
          <B>https://ec.europa.eu/consumers/odr</B>
          {'\n\n'}
          Cette plateforme vous permet de deposer votre reclamation en ligne et de
          trouver un organisme de reglement des litiges agree dans votre pays.
        </P>
        <TouchableOpacity
          style={styles.linkButton}
          onPress={() => openLink('https://ec.europa.eu/consumers/odr')}
          accessibilityRole="link"
        >
          <Ionicons name="open-outline" size={16} color={COLORS.brandPrimary} />
          <Text style={styles.linkButtonText}>
            Acceder a la plateforme europeenne
          </Text>
        </TouchableOpacity>
      </Section>

      <Section title="Contact service client">
        <P>
          Avant toute mediation, contactez notre service client :{'\n\n'}
          <B>Email :</B> contact@altio.app{'\n'}
          <B>Delai de reponse :</B> accuse de reception sous 48h, reponse sous 5 jours
          ouvres{'\n\n'}
          Vous pouvez egalement utiliser la fonction « Signaler un probleme » disponible
          dans le detail de chaque mission sur l'application.
        </P>
      </Section>
    </>
  );
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.paper,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: SPACING.xl,
    paddingVertical: SPACING.lg,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  backBtn: {
    width: 40,
    height: 40,
    justifyContent: 'center',
    alignItems: 'flex-start',
  },
  headerTitle: {
    fontFamily: 'PlusJakartaSans_700Bold',
    fontSize: 18,
    color: COLORS.textPrimary,
  },
  headerSpacer: {
    width: 40,
  },
  tabBarScroll: {
    flexGrow: 0,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  tabBarContent: {
    flexDirection: 'row',
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.sm,
    gap: 6,
  },
  tab: {
    paddingVertical: SPACING.sm,
    paddingHorizontal: SPACING.md,
    borderRadius: RADIUS.sm,
    backgroundColor: COLORS.subtle,
  },
  tabActive: {
    backgroundColor: COLORS.brandPrimary,
  },
  tabText: {
    ...FONTS.bodySmall,
    color: COLORS.textSecondary,
    fontWeight: '600',
  },
  tabTextActive: {
    color: COLORS.textInverse,
    fontWeight: '700',
  },
  content: {
    flex: 1,
  },
  contentContainer: {
    paddingHorizontal: SPACING.xl,
    paddingBottom: 80,
  },
  lastUpdate: {
    ...FONTS.caption,
    color: COLORS.textTertiary,
    marginTop: SPACING.lg,
    marginBottom: SPACING.xl,
  },
  section: {
    marginBottom: SPACING.xxl,
  },
  sectionTitle: {
    fontFamily: 'PlusJakartaSans_700Bold',
    fontSize: 15,
    color: COLORS.textPrimary,
    marginBottom: SPACING.sm,
    lineHeight: 22,
  },
  paragraph: {
    ...FONTS.body,
    color: COLORS.textSecondary,
    lineHeight: 22,
  },
  bold: {
    fontFamily: 'PlusJakartaSans_700Bold',
    color: COLORS.textPrimary,
  },
  linkButton: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: SPACING.md,
    paddingVertical: SPACING.md,
    paddingHorizontal: SPACING.lg,
    backgroundColor: COLORS.infoSoft,
    borderRadius: RADIUS.sm,
    gap: 8,
  },
  linkButtonText: {
    ...FONTS.bodySmall,
    color: COLORS.brandPrimary,
    fontWeight: '600',
  },
});
