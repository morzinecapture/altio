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
import { useRouter, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { COLORS, FONTS, SPACING, RADIUS } from '../src/theme';
import { LEGAL_CONFIG } from '../src/config/legal';

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
  // ?tab=cgu|cgv|privacy|mentions|mediation — permet d'ouvrir directement la bonne section
  const { tab } = useLocalSearchParams<{ tab?: string }>();
  const initialTab = TABS.some((t) => t.key === tab) ? (tab as Tab) : 'cgu';
  const [activeTab, setActiveTab] = useState<Tab>(initialTab);

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
  return <Text style={styles.lastUpdate}>Dernière mise à jour : 11 octobre 2026</Text>;
}

// ---------------------------------------------------------------------------
// CGU — Conditions Generales d'Utilisation
// ---------------------------------------------------------------------------

function CGU() {
  const router = useRouter();
  return (
    <>
      <LastUpdate />

      <Section title="Article 1 — Objet">
        <P>{`Les présentes conditions encadrent l’utilisation de la plateforme Altio, exploitée par ${LEGAL_CONFIG.COMPANY_NAME}, par les propriétaires et les prestataires professionnels. Les coordonnées complètes de l’exploitante figurent dans l’onglet « Mentions ».\n\nLes CGU concernent l’accès à la plateforme ; les CGV précisent les prix et paiements. Les dispositions impératives applicables aux consommateurs prévalent. Un propriétaire n’est pas automatiquement un consommateur : sa qualité dépend du but, professionnel ou non, de la commande.`}</P>
      </Section>

      <Section title="Article 2 — Definitions">
        <P>{"Le Propriétaire commande des prestations pour un bien dont il assure la gestion. Le Prestataire est un professionnel indépendant proposant ses services. Une Mission désigne une prestation planifiée ou urgente. Une Urgence est une demande signalée comme telle par le propriétaire ; cette qualification dans l’application ne suffit pas à établir une urgence au sens du droit de la consommation. L’attribution dépend du parcours proposé : candidature, offre ou demande ciblée.\n\nLe mandat de facturation autorise Altio à établir les factures au nom et pour le compte du prestataire dans les conditions de l’article 8."}</P>
      </Section>

      <Section title="Article 3 — Acces a la Plateforme">
        <P>
          L'acces a la Plateforme est reserve aux personnes majeures (18 ans minimum)
          disposant de la capacite juridique de contracter. L'inscription est effectuee
          par email, numero de telephone ou connexion sociale (Google, Apple).
          {'\n\n'}
          L’Utilisateur protège ses identifiants et signale tout accès suspect. L’utilisation de son compte par un tiers ne le rend pas automatiquement responsable de toute opération, notamment en cas de défaillance de sécurité non imputable à l’utilisateur. En cas
          d'utilisation non autorisee, l'Utilisateur doit en informer Altio sans delai
          a l'adresse morzinecapture@gmail.com.
          {'\n\n'}
          Altio se reserve le droit de suspendre ou supprimer tout compte en cas de
          violation des presentes CGU, de fraude ou de comportement portant atteinte
          aux autres Utilisateurs.
        </P>
      </Section>

      <Section title="Article 4 — Role d'Altio — Mandataire">
        <P>{"Altio fournit un service de mise en relation et facilite le suivi des missions, la facturation et les paiements via Stripe. Le contrat d’exécution de la prestation lie le propriétaire au prestataire identifié dans la commande. Altio ne réalise pas les travaux.\n\nLe prestataire organise son activité et répond de ses prestations. Altio reste responsable de ses propres obligations ; sa qualité d’intermédiaire ne supprime ni les responsabilités ni les protections légales applicables. Le mandat de facturation ne transfère pas à Altio les obligations fiscales du prestataire."}</P>
      </Section>

      <Section title="Article 5 — Services proposes">
        <P>
          La Plateforme permet notamment :{'\n'}
          {'\u2022'} La mise en relation entre Proprietaires et Prestataires locaux{'\n'}
          {'\u2022'} La publication de missions planifiees ou d'urgences{'\n'}
          {'\u2022'} La gestion du cycle de vie complet d'une mission (publication, candidatures, attribution, execution, validation){'\n'}
          {'\u2022'} La messagerie in-app entre Proprietaire et Prestataire assignes{'\n'}
          {'\u2022'} Le paiement securise via Stripe{'\n'}
          {'\u2022'} La mise à disposition de documents de facturation{'\n'}
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
          {'\u2022'} Signaler tout comportement suspect ou inapproprie a morzinecapture@gmail.com
          {'\n\n'}
          <B>Le Prestataire s'engage en outre a :</B>{'\n'}
          {'\u2022'} Disposer des qualifications, assurances et autorisations necessaires a l'exercice de son activite{'\n'}
          {'\u2022'} Executer les missions acceptees avec diligence et dans les delais convenus{'\n'}
          {'\u2022'} Accepter le mandat de facturation prevu a l'article 8{'\n'}
          {'\u2022'} Maintenir a jour son profil, ses zones d'intervention et ses categories de competences
        </P>
      </Section>

      <Section title="Article 7 — Paiements et frais de service">
        <P>{"Les prix sont exprimés en euros. Les frais Altio comprennent la TVA applicable : ils ne correspondent pas à une majoration de 10 % HT à laquelle une TVA serait ensuite ajoutée. Les modalités, exemples et arrondis figurent à l’article 2 des CGV. Le total à payer doit être présenté avant l’engagement.\n\nLe paiement est traité par Stripe. Selon le parcours, une autorisation bancaire peut être demandée avant l’intervention, certains frais de déplacement ou de diagnostic peuvent être encaissés séparément, et le solde peut être encaissé après validation. Une autorisation bancaire n’est pas un débit définitif. Altio ne conserve pas les numéros complets de carte bancaire."}</P>
      </Section>

      <Section title="Article 8 — Mandat de facturation">
        <P>{"Le prestataire qui accepte le mandat autorise Altio à établir les factures au nom et pour son compte pour les prestations réalisées via la plateforme, conformément à l’article 289, I, 2 du CGI. L’accord doit précéder l’émission des factures.\n\nLe prestataire fournit une identité professionnelle, une adresse et des informations fiscales exactes, notamment son régime de TVA. Il reste responsable de ses obligations fiscales et de la vérification des factures. Il doit pouvoir accéder aux documents émis en son nom et en conserver une copie.\n\nLe délai contractuel de contestation est de 7 jours à compter de la mise à disposition et de l’information du prestataire. À défaut d’observation, la facture est acceptée tacitement. Cela ne fait pas obstacle à la correction ultérieure d’une erreur, à l’émission d’un avoir ou aux droits légaux des parties. Le prestataire peut révoquer le mandat par écrit à morzinecapture@gmail.com avec un préavis de 30 jours, sans préjudice de ses droits impératifs. La révocation concerne les émissions futures ; elle n’efface pas les obligations relatives aux opérations antérieures."}</P>
      </Section>

      <Section title="Article 9 — Droit de retractation">
        <TouchableOpacity onPress={() => router.push('/withdrawal')}><Text style={{color: COLORS.brandPrimary, fontWeight: '600'}}>Renoncer au contrat ici</Text></TouchableOpacity>
        <P>{"Le consommateur dispose en principe de 14 jours à compter de la conclusion d’un contrat de service à distance pour se rétracter. Il peut notifier sa décision au professionnel cocontractant par une déclaration non équivoque ou utiliser le formulaire ci-dessous ; morzinecapture@gmail.com reçoit les demandes relatives au service Altio et peut transmettre celles relatives à une prestation au prestataire identifié.\n\nSi le consommateur demande expressément un début d’exécution avant la fin du délai, le seul commencement du service ne fait pas disparaître son droit. En cas de rétractation, seule la part proportionnelle du service déjà fourni peut être due, lorsque les conditions d’information et de demande expresse prévues par l’article L221-25 sont remplies. À défaut, aucune somme n’est due à ce titre.\n\nLa perte du droit pour une prestation entièrement exécutée suppose les conditions de l’article L221-28, 1° : accord préalable exprès pour commencer et reconnaissance de la perte du droit après exécution complète. L’acceptation générale des CGU ou la simple validation de fin de mission ne remplace pas ces exigences.\n\nL’exception pour travaux urgents d’entretien ou de réparation ne concerne que ceux expressément sollicités au domicile du consommateur et strictement nécessaires à l’urgence, dans les limites de l’article L221-28, 8°. Elle ne s’applique pas automatiquement à toute demande appelée « urgence » dans Altio, notamment pour un logement exploité à titre professionnel.\n\nLes sommes remboursables sont restituées sans retard injustifié, au plus tard dans les 14 jours suivant l’information du professionnel, avec le même moyen de paiement sauf accord exprès sans frais, sous réserve des sommes légalement dues pour l’exécution anticipée.\n\nPour les contrats concernés, l’article L221-21 prévoit également une fonctionnalité gratuite de rétractation en ligne. Le formulaire « Renoncer au contrat ici » est accessible depuis les CGU et les CGV dans l’application. Votre déclaration peut également être adressée à morzinecapture@gmail.com en conservant une copie de l’envoi. Les modalités propres à votre commande et au professionnel concerné figurent dans son récapitulatif.\n\nFormulaire : À l’attention de [professionnel cocontractant, adresse et email figurant dans la commande]. Je vous notifie ma rétractation du contrat de prestation suivant : [référence et description], commandé le [date]. Nom et adresse du consommateur : [à renseigner]. Date : [à renseigner]. Signature uniquement pour un envoi papier."}</P>
      </Section>

      <Section title="Article 10 — Propriete intellectuelle">
        <P>
          L'ensemble des elements constituant la Plateforme (code source, graphismes,
          logo, textes, architecture, bases de donnees) est la propriete exclusive
          d'Altio ou de ses licensors et est protege par le droit francais et
          international de la propriete intellectuelle.
          {'\n\n'}
          Toute reproduction, representation, modification, publication ou adaptation
          totale ou partielle de ces elements, sans l'autorisation prealable et ecrite
          d'Altio, est strictement interdite et constitue une contrefacon
          sanctionnee par les articles L335-2 et suivants du Code de la propriete
          intellectuelle.
        </P>
      </Section>

      <Section title="Article 11 — Responsabilite">
        <P>{"Altio répond des manquements à ses propres obligations dans les conditions du droit applicable. Le prestataire répond de l’exécution de son intervention, de ses fautes et des assurances obligatoires liées à son activité.\n\nAucune clause ne supprime ou ne réduit le droit à réparation du consommateur en cas de manquement d’Altio à ses obligations. Aucun plafond automatique limité aux frais de service n’est opposé au consommateur. Les garanties légales, la responsabilité pour faute lourde ou dolosive et les droits impératifs demeurent applicables.\n\nUne maintenance ou un incident peut affecter temporairement l’accès ; cela n’exonère pas automatiquement Altio de toute responsabilité. Une qualification ou une assurance déclarée par un prestataire ne constitue pas une garantie absolue de la qualité des travaux."}</P>
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
        <P>{"L’utilisateur peut demander la fermeture de son compte depuis l’application ou à morzinecapture@gmail.com. La fermeture du compte ne fait pas disparaître les obligations issues des commandes antérieures. Les missions, paiements ou litiges restant ouverts sont traités séparément et ne justifient pas la conservation indéfinie de toutes les données.\n\nLes demandes d’effacement sont examinées selon le RGPD et les obligations de conservation applicables. Les pièces comptables à conserver et les éléments nécessaires à un litige peuvent être archivés avec un accès restreint ; aucune durée légale générale de 5 ans n’est affirmée pour tous les journaux techniques.\n\nUne restriction du compte peut être décidée pour fraude, contenu illicite ou manquement aux obligations. Elle doit être motivée, proportionnée et contestable auprès de morzinecapture@gmail.com, sauf restriction légalement justifiée de l’information. Lorsque le règlement (UE) 2019/1150 s’applique, les droits de l’entreprise utilisatrice, notamment la motivation sur support durable et le préavis de principe de 30 jours en cas de résiliation totale, sont respectés sous réserve des exceptions prévues par ce règlement."}</P>
      </Section>

      <Section title="Article 14 — Modification des CGU">
        <P>{"Les modifications substantielles sont communiquées sur un support permettant leur conservation, avec un préavis de principe de 30 jours et un délai plus long si nécessaire pour les adaptations requises, sous réserve des exceptions légales. Elles ne modifient pas rétroactivement les commandes déjà conclues.\n\nL’utilisateur peut refuser les nouvelles conditions et mettre fin à l’utilisation pour l’avenir. Lorsque son accord exprès est nécessaire, son silence ou la seule poursuite de l’utilisation ne le remplace pas. Les règles impératives, notamment celles du règlement (UE) 2019/1150 lorsqu’il s’applique aux prestataires, prévalent."}</P>
      </Section>

      <Section title="Article 15 — Droit applicable et litiges">
        <P>{`Le droit français s’applique, sans priver un consommateur des dispositions impératives protectrices dont il bénéficie, notamment dans son pays de résidence lorsque celles-ci sont applicables. Les juridictions compétentes sont déterminées par les règles légales ; aucune compétence territoriale exclusive n’est imposée au consommateur.\n\nUne réclamation peut être adressée à ${LEGAL_CONFIG.COMPANY_EMAIL}. Après une réclamation écrite préalable restée sans solution, le consommateur peut saisir gratuitement ${LEGAL_CONFIG.MEDIATOR_NAME}. La recherche d’une solution amiable et la médiation restent facultatives et ne privent pas du droit de saisir un juge.`}</P>
      </Section>
      <Section title="Article 16 — Référencement, classement et avis">
        <P>{"La plateforme met en relation des propriétaires avec des professionnels inscrits. Les offres accessibles peuvent dépendre du type de service, de la zone, des disponibilités et des choix du propriétaire. Les notes ne constituent pas une garantie de résultat.\n\nL’annuaire peut être filtré par spécialité et la carte utilise la position renseignée des professionnels. Aucun ordre de pertinence n’est garanti dans la liste générale. Le catalogue des partenaires est classé par nom. Les favoris sont sélectionnés par le propriétaire ; une demande ciblée désigne le professionnel choisi. Aucun placement payant n’est proposé. Les avis affichés sur un profil sont présentés du plus récent au plus ancien, dans la limite des vingt derniers avis chargés. Un avis peut être signalé et le professionnel peut y répondre ; les avis ne font pas l’objet d’une certification indépendante. Les prestataires accèdent à leurs missions, échanges et documents depuis leur compte et peuvent exercer leurs droits auprès du support après clôture."}</P>
      </Section>

      <Section title="Article 17 — Contenus et signalements">
        <P>{"Les utilisateurs ne doivent pas publier de contenus illicites, frauduleux, discriminatoires, menaçants ou portant atteinte aux droits d’autrui. Un signalement peut être adressé à morzinecapture@gmail.com en précisant le contenu concerné, sa référence, les motifs et les éléments utiles. Les informations transmises doivent être exactes et fournies de bonne foi.\n\nLes mesures de modération doivent être proportionnées et tenir compte du contexte et des droits des personnes. Une décision peut être contestée auprès de ce même contact. Le point de contact pour les utilisateurs et les autorités est morzinecapture@gmail.com. Les signalements sont examinés par l’exploitante. Lorsqu’une restriction est décidée, la personne concernée reçoit les motifs et peut demander un réexamen à cette adresse, sauf obligation légale contraire. Le signalement d’un danger immédiat doit être adressé aux services de secours compétents."}</P>
      </Section>

      <Section title="Article 18 — Obligations fiscales et sociales">
        <P>{"Les prestataires demeurent responsables de leurs obligations fiscales et sociales. Les informations officielles sont accessibles sur impots.gouv.fr et urssaf.fr. Les obligations de collecte, d’information et de déclaration applicables aux opérateurs de plateforme, notamment DPI-DAC7 pour les activités concernées, ne sont pas transférées aux prestataires par ces CGU.\n\nLorsqu’une obligation déclarative s’applique à une activité réalisée sur la plateforme, Altio collecte les informations requises et informe les prestataires concernés des données transmises et des corrections possibles. Les informations déclaratives demandées doivent être exactes et tenues à jour. Un relevé de plateforme ne dispense pas de la déclaration des revenus ni du paiement des cotisations applicables."}</P>
      </Section>

    </>
  );
}

// ---------------------------------------------------------------------------
// CGV — Conditions Generales de Vente
// ---------------------------------------------------------------------------

function CGV() {
  const router = useRouter();
  return (
    <>
      <LastUpdate />

      <Section title="Article 1 — Objet">
        <P>{`Ces conditions régissent le service d’intermédiation Altio exploité par ${LEGAL_CONFIG.COMPANY_NAME} et décrivent les modalités des commandes et paiements effectués via la plateforme. Les prestations matérielles sont exécutées par le professionnel identifié dans la commande.\n\nLes conditions particulières acceptées avant la commande précisent la prestation, sa date ou son délai d’exécution, son prix, les frais et l’identité du professionnel. Une prestation supplémentaire exige un accord préalable ; le signalement d’une urgence ne vaut pas autorisation illimitée de travaux. Les droits impératifs du consommateur prévalent sur les présentes conditions.`}</P>
      </Section>

      <Section title="Article 2 — Prix et frais de service">
        <P>{"Les prix et totaux destinés au consommateur sont exprimés en euros toutes taxes comprises. La TVA de la prestation dépend du régime fiscal du prestataire. Lorsqu’un devis présente des lignes HT, la TVA applicable est intégrée au sous-total TTC avant le calcul des frais Altio.\n\nLes frais propriétaire sont calculés sur la base d’une majoration de 10 % du prix TTC de la prestation ; la TVA applicable aux frais Altio est incluse dans ces frais, et non ajoutée une seconde fois. Pour les missions au forfait, le total majoré est arrondi à l’euro le plus proche ; les frais correspondent à la différence entre ce total et le prix TTC de la prestation. Pour les devis et frais de visite, le calcul est effectué au centime.\n\nExemple : prestation de 100 € TTC, total propriétaire de 110 € TTC, frais propriétaire de 10 € TTC. Sur cette opération, la commission prestataire est de 10 € TTC et le prestataire reçoit 90 € avant ses propres charges et impôts.\n\nPour les paiements répartis automatiquement, les frais totaux de plateforme correspondent à 2/11 du montant encaissé, arrondis au centime. La commission prestataire est la différence entre ces frais totaux et les frais propriétaire ; elle peut donc légèrement différer de 10 % du prix de la prestation en raison des arrondis. Exemple au forfait : 99,99 € TTC de prestation, 110 € payés, 10,01 € de frais propriétaire et 9,99 € de commission prestataire.\n\nLe détail de la prestation, des frais, de la TVA et du total doit être communiqué avant l’engagement. Aucune somme non annoncée ou aucun supplément non accepté ne peut être ajouté par la seule application de ces CGV."}</P>
      </Section>

      <Section title="Article 3 — Modalites de paiement">
        <P>{"Les paiements par carte sont traités via Stripe. Les modalités dépendent de la commande et doivent être indiquées avant sa confirmation. Pour une mission au forfait, le paiement intervient après validation par le propriétaire. Pour un devis, une autorisation peut être prise avant exécution et capturée ensuite. Pour une urgence ou une visite, le déplacement et le diagnostic peuvent faire l’objet d’un paiement distinct, notamment lors de l’acceptation de l’offre ou au stade prévu dans le parcours d’intervention.\n\nUne empreinte bancaire réserve un montant sans constituer à elle seule un encaissement ; sa libération dépend aussi des délais bancaires. Les travaux supplémentaires nécessitent un devis ou un prix expressément accepté.\n\nUn signalement de litige ne garantit pas le blocage d’un paiement déjà exécuté. La contestation et un éventuel remboursement sont examinés au regard de la prestation, des sommes réellement encaissées et des droits applicables. Ces CGV ne restreignent pas les recours légaux auprès du professionnel ou du prestataire de paiement."}</P>
      </Section>

      <Section title="Article 4 — Facturation electronique">
        <P>{"La facturation distingue la prestation du professionnel au propriétaire, les frais Altio facturés au propriétaire et la commission Altio facturée au prestataire. Les factures de prestation peuvent être établies par Altio au nom et pour le compte du prestataire dans le cadre du mandat accepté. Les taxes sont détaillées selon le statut fiscal applicable.\n\nLa production d’un PDF ou d’un fichier XML ne suffit pas à garantir, à elle seule, la conformité à la réforme française de facturation électronique. Les opérations entrant dans son champ doivent respecter le calendrier applicable et les exigences de transmission par une plateforme agréée. Aucune immatriculation d’Altio comme plateforme agréée ni connexion opérationnelle à une telle plateforme n’est affirmée ici.\n\nLes professionnels conservent leurs pièces comptables pendant la durée légale applicable. Les documents proposés par Altio ne remplacent pas leurs obligations fiscales et comptables."}</P>
      </Section>

      <Section title="Article 5 — Droit de retractation">
        <TouchableOpacity onPress={() => router.push('/withdrawal')}><Text style={{color: COLORS.brandPrimary, fontWeight: '600'}}>Renoncer au contrat ici</Text></TouchableOpacity>
        <P>{"Le consommateur dispose en principe de 14 jours à compter de la conclusion d’un contrat de service à distance pour se rétracter. Il peut notifier sa décision au professionnel cocontractant par une déclaration non équivoque ou utiliser le formulaire ci-dessous ; morzinecapture@gmail.com reçoit les demandes relatives au service Altio et peut transmettre celles relatives à une prestation au prestataire identifié.\n\nSi le consommateur demande expressément un début d’exécution avant la fin du délai, le seul commencement du service ne fait pas disparaître son droit. En cas de rétractation, seule la part proportionnelle du service déjà fourni peut être due, lorsque les conditions d’information et de demande expresse prévues par l’article L221-25 sont remplies. À défaut, aucune somme n’est due à ce titre.\n\nLa perte du droit pour une prestation entièrement exécutée suppose les conditions de l’article L221-28, 1° : accord préalable exprès pour commencer et reconnaissance de la perte du droit après exécution complète. L’acceptation générale des CGU ou la simple validation de fin de mission ne remplace pas ces exigences.\n\nL’exception pour travaux urgents d’entretien ou de réparation ne concerne que ceux expressément sollicités au domicile du consommateur et strictement nécessaires à l’urgence, dans les limites de l’article L221-28, 8°. Elle ne s’applique pas automatiquement à toute demande appelée « urgence » dans Altio, notamment pour un logement exploité à titre professionnel.\n\nLes sommes remboursables sont restituées sans retard injustifié, au plus tard dans les 14 jours suivant l’information du professionnel, avec le même moyen de paiement sauf accord exprès sans frais, sous réserve des sommes légalement dues pour l’exécution anticipée.\n\nPour les contrats concernés, l’article L221-21 prévoit également une fonctionnalité gratuite de rétractation en ligne. Le formulaire « Renoncer au contrat ici » est accessible depuis les CGU et les CGV dans l’application. Votre déclaration peut également être adressée à morzinecapture@gmail.com en conservant une copie de l’envoi. Les modalités propres à votre commande et au professionnel concerné figurent dans son récapitulatif.\n\nFormulaire : À l’attention de [professionnel cocontractant, adresse et email figurant dans la commande]. Je vous notifie ma rétractation du contrat de prestation suivant : [référence et description], commandé le [date]. Nom et adresse du consommateur : [à renseigner]. Date : [à renseigner]. Signature uniquement pour un envoi papier."}</P>
      </Section>

      <Section title="Article 6 — Execution du service">
        <P>{"Le prestataire réalise la mission selon le contenu, le prix et le délai convenus. Il fournit les justificatifs professionnels, qualifications et assurances requis par son activité. Les informations ou badges du profil ne dispensent pas le propriétaire de consulter les justificatifs utiles et ne garantissent pas l’absence de défaut de la prestation.\n\nLe propriétaire fournit des informations exactes sur le besoin et les conditions d’accès. La réception ou la validation de la mission ne vaut pas renonciation aux recours pour défaut, inexécution ou dommage. Une demande d’annulation, d’interruption ou de remboursement peut être adressée au cocontractant et à morzinecapture@gmail.com. Les conditions particulières et les dispositions légales applicables déterminent les sommes éventuellement dues ; aucune pénalité forfaitaire nouvelle n’est créée par le présent texte."}</P>
      </Section>

      <Section title="Article 7 — Responsabilite">
        <P>{"Chaque intervenant répond de ses propres obligations : le prestataire pour l’exécution de la prestation, Altio pour son service de plateforme et ses autres engagements. La qualité d’intermédiaire ne constitue pas une exonération générale.\n\nAucune clause ne limite les droits impératifs du consommateur ni sa réparation en cas de manquement d’Altio. Une réclamation relative à la mission peut être transmise via l’application ou à morzinecapture@gmail.com, sans que cette démarche soit une condition obligatoire préalable à tout recours judiciaire."}</P>
      </Section>

      <Section title="Article 8 — Garantie legale de conformite">
        <P>{"Les garanties et recours légaux applicables restent ouverts. Ils dépendent de la nature du contrat : prestation de services, vente de biens, travaux ou service numérique. Les règles relatives à la garantie de conformité des biens ne sont pas présentées comme automatiquement applicables à toute mise en relation. Lorsque le service numérique fourni entre dans le champ des articles L224-25-1 et suivants du Code de la consommation, les protections correspondantes s’appliquent. Le prestataire reste soumis aux garanties propres à son activité, notamment en matière de travaux lorsque leurs conditions sont réunies."}</P>
      </Section>

      <Section title="Article 9 — Reclamations et mediation">
        <P>{`Les réclamations relatives à Altio peuvent être adressées à ${LEGAL_CONFIG.COMPANY_EMAIL}, en précisant la mission, les faits et la solution demandée, sans communiquer de données bancaires complètes.\n\nAprès une réclamation écrite préalable non résolue, le consommateur peut saisir gratuitement ${LEGAL_CONFIG.MEDIATOR_NAME}, ${LEGAL_CONFIG.MEDIATOR_ADDRESS}, sur ${LEGAL_CONFIG.MEDIATOR_URL}, selon ses conditions de recevabilité. La médiation ne supprime pas la possibilité de saisir un juge. La plateforme européenne RLL/ODR ayant fermé en 2025, son ancien lien n’est plus proposé.`}</P>
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
        <P>{"Le droit français s’applique sous réserve des règles impératives de protection du consommateur et des règles de droit international privé. Les juridictions compétentes sont déterminées conformément aux textes applicables, sans clause de compétence exclusive défavorable au consommateur. Une réclamation ou médiation amiable n’est pas une condition obligatoire préalable à l’exercice d’un recours judiciaire."}</P>
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
        <P>{`Le responsable du traitement est ${LEGAL_CONFIG.COMPANY_NAME}, ${LEGAL_CONFIG.COMPANY_FORM}, ${LEGAL_CONFIG.COMPANY_ADDRESS}. Contact pour les données personnelles : ${LEGAL_CONFIG.COMPANY_EMAIL}. La désignation d’un délégué à la protection des données n’est pas affirmée en l’absence de confirmation.\n\nLes durées opérationnelles de conservation, la liste des sous-traitants activés et les garanties de transfert sont précisées et mises à jour selon les traitements réellement utilisés.`}</P>
      </Section>

      <Section title="Article 2 — Donnees collectees">
        <P>{"Selon les fonctionnalités utilisées : identité et coordonnées, photo de profil ; informations professionnelles et fiscales, qualifications et attestations d’assurance ; adresses et informations d’accès aux logements ; zones d’intervention et position lorsque la fonctionnalité de localisation est utilisée ; missions, réservations, messages, photos, avis et réclamations.\n\nDes références de paiement, statuts de transaction et informations de facturation sont traités par Altio ; les numéros complets de carte sont traités par Stripe. Les connexions facultatives à des calendriers impliquent les données nécessaires à leur synchronisation et les autorisations associées.\n\nLes données techniques peuvent inclure les informations de session, l’adresse IP, le type d’appareil, les jetons de notification et les rapports d’erreur. Les champs nécessaires au compte ou à une commande permettent leur traitement ; leur absence peut empêcher la fonctionnalité correspondante. Les fonctions facultatives ne rendent pas toutes les données obligatoires."}</P>
      </Section>

      <Section title="Article 3 — Finalites du traitement">
        <P>{"Les données servent à gérer les comptes et commandes, mettre en relation les parties, suivre les missions, échanger les messages, traiter les paiements et établir les documents de facturation. Elles permettent aussi les notifications de service, les intégrations demandées, l’assistance et le traitement des réclamations.\n\nLa prévention des abus, la sécurité et le diagnostic des erreurs poursuivent des finalités distinctes. Une éventuelle prospection commerciale requiert le fondement juridique approprié et un moyen d’opposition. Aucune collecte facultative n’est autorisée par la seule acceptation globale des CGU."}</P>
      </Section>

      <Section title="Article 4 — Base legale des traitements">
        <P>{"L’exécution du contrat fonde les traitements nécessaires au service demandé. Les obligations légales fondent notamment les traitements comptables et fiscaux applicables. L’intérêt légitime peut fonder des mesures proportionnées de sécurité et de prévention des abus, sous réserve des droits des personnes.\n\nLorsqu’un consentement est nécessaire, notamment pour certains accès au terminal, traceurs ou usages facultatifs, il doit être spécifique, éclairé et révocable. Une permission donnée à iOS ou Android ne constitue pas à elle seule un consentement RGPD valable pour toute réutilisation. Les notifications de service et les communications publicitaires doivent être distinguées ; refuser la prospection ne prive pas de l’accès au service."}</P>
      </Section>

      <Section title="Article 5 — Duree de conservation">
        <P>{"Les données du compte sont utilisées pendant la relation de service. Après clôture, seules les données nécessaires à une obligation légale, à la preuve ou à la gestion d’un litige peuvent être conservées pour la durée justifiée, avec accès restreint. Les pièces comptables sont soumises à leur durée légale de conservation, notamment 10 ans pour les documents comptables concernés.\n\nIl n’existe pas de durée légale uniforme de 5 ans applicable à tous les journaux techniques. Leur conservation doit être proportionnée ; la CNIL recommande généralement de 6 à 12 mois pour la journalisation de sécurité, sous réserve de besoins particuliers documentés.\n\nLes coordonnées et informations de profil sont conservées pendant la vie du compte. Les informations de logement restent nécessaires tant que le logement est géré dans Altio. Les échanges, photographies et pièces de mission sont conservés pour le suivi de la prestation, puis seulement lorsque leur maintien est nécessaire à une réclamation ou à la preuve d’un droit. Une demande de suppression déclenche l’examen des éléments à effacer, anonymiser ou conserver séparément ; la réponse précise les motifs de conservation résiduelle. Les factures sont conservées dix ans à compter de la clôture de l’exercice concerné. Les données conservées pour un contentieux sont limitées à ce contentieux et à sa durée. Les copies de sauvegarde ne servent pas à réactiver un compte supprimé ; en cas de restauration, les demandes d’effacement doivent être réappliquées avant reprise du service."}</P>
      </Section>

      <Section title="Article 6 — Vos droits (RGPD)">
        <P>{"Dans les conditions prévues par le RGPD, vous pouvez demander l’accès, la rectification, l’effacement, la limitation et la portabilité de vos données, ainsi que vous opposer à certains traitements. Le droit à l’effacement n’est pas absolu, notamment lorsqu’une conservation est légalement nécessaire. La portabilité concerne les traitements et données qui remplissent ses conditions légales.\n\nVous pouvez retirer un consentement sans remettre en cause les traitements antérieurs licites et vous opposer à la prospection. Vous pouvez également communiquer des directives relatives au sort de vos données après votre décès.\n\nAdressez votre demande à morzinecapture@gmail.com. Une vérification proportionnée de l’identité peut être nécessaire en cas de doute raisonnable. Une réponse est due dans les meilleurs délais et au plus tard sous un mois ; ce délai peut être prolongé de deux mois compte tenu de la complexité ou du nombre de demandes, avec information motivée pendant le premier mois.\n\nVous pouvez déposer une réclamation auprès de la CNIL : https://www.cnil.fr. Aucun export CSV disponible dans l’application n’est promis sans vérification de cette fonctionnalité."}</P>
      </Section>

      <Section title="Article 7 — Cookies et traceurs">
        <P>{"Les applications mobiles et leurs composants peuvent accéder à des informations stockées sur le terminal, même sans utiliser des cookies de navigateur. Les éléments strictement nécessaires à l’authentification ou à un service demandé sont distingués des traceurs soumis au consentement.\n\nLes sessions sont persistées selon l’environnement technique. La présence d’un mécanisme de stockage sécurisé ne justifie pas une promesse de stockage exclusif dans le Keychain ou le Keystore dans toutes les versions.\n\nSupabase assure les sessions et l’authentification. Expo et les services Apple ou Google utilisent un jeton d’installation pour acheminer les notifications autorisées. Stripe traite les informations de paiement et les interactions nécessaires à son fonctionnement, à ses analyses et à la prévention des fraudes. Aucun SDK de publicité ni placement publicitaire payant n’est intégré à cette version. Sentry n’est actif que dans les versions où le diagnostic est configuré ; il peut alors recevoir des rapports techniques et le contexte utile à la résolution d’une erreur. Les permissions de localisation, de caméra, de photothèque et de notifications restent modifiables dans les réglages de l’appareil."}</P>
      </Section>

      <Section title="Article 8 — Destinataires des donnees">
        <P>{"Les destinataires sont, selon leurs besoins : les personnes habilitées de l’exploitant, les parties aux missions, les fournisseurs techniques et les autorités légalement compétentes. Les informations du profil destinées à l’annuaire sont distinctes des données privées. Les informations d’accès au logement ne doivent être partagées que dans la mesure nécessaire à l’intervention.\n\nLes services utilisés ou intégrés comprennent Supabase pour les données et l’authentification, Stripe pour les paiements, les services Expo/Apple/Google pour les fonctions mobiles et notifications, les fournisseurs de calendrier lorsque l’utilisateur les connecte, ainsi que Sentry lorsque le diagnostic d’erreurs est activé. Leur rôle et leurs traitements dépendent de la configuration.\n\nLa base Altio est hébergée sur Supabase dans la région eu-west-1 (Europe, Irlande), contrôlée le 11 octobre 2026. Supabase publie ses conditions et son accord de traitement sur supabase.com/legal. Le site est hébergé par Vercel Inc. Les services de paiement sont fournis par Stripe ; ses conditions de confidentialité sont accessibles sur stripe.com/privacy. Expo et les boutiques Apple/Google interviennent pour les fonctions mobiles ; une connexion à un calendrier tiers est optionnelle. Pour obtenir les informations relatives aux fournisseurs utilisés dans votre situation, écrivez à morzinecapture@gmail.com."}</P>
      </Section>

      <Section title="Article 9 — Transferts hors Union europeenne">
        <P>{"La localisation d’une base de données en Europe ne garantit pas l’absence de tout accès ou transfert hors de l’Espace économique européen. Les lieux de traitement, d’assistance et de sauvegarde dépendent des fournisseurs et de leurs sous-traitants.\n\nLa base principale est située dans la région européenne eu-west-1. Certains fournisseurs peuvent traiter des données techniques ou assurer leur assistance hors de l’Espace économique européen, notamment aux États-Unis et à Singapour. Les mécanismes publiés par les fournisseurs comprennent, selon le destinataire et le service, les décisions d’adéquation applicables et les clauses contractuelles types de la Commission européenne. Les documents de référence sont accessibles sur supabase.com/legal, vercel.com/legal et stripe.com/privacy. Vous pouvez demander les informations et garanties applicables à vos données à morzinecapture@gmail.com."}</P>
      </Section>

      <Section title="Article 10 — Securite des donnees">
        <P>{"La protection des données repose notamment sur l’authentification, les contrôles d’accès et la limitation des droits. Les mesures doivent être adaptées aux risques et régulièrement vérifiées. Aucun mécanisme ne garantit une sécurité absolue.\n\nLes numéros complets de carte ne sont pas enregistrés dans la base métier Altio. Les utilisateurs doivent protéger leurs identifiants et signaler tout incident à morzinecapture@gmail.com. Les caractéristiques techniques précises non vérifiées, comme une version unique de TLS ou le chiffrement de tous les supports, ne sont pas garanties par cette politique."}</P>
      </Section>

      <Section title="Article 11 — Contact et reclamation">
        <P>{"Contact relatif aux données personnelles : morzinecapture@gmail.com. Les coordonnées d’un éventuel DPO seront publiées si sa désignation est confirmée.\n\nAutorité de contrôle : CNIL, 3 place de Fontenoy, TSA 80715, 75334 Paris Cedex 07 — https://www.cnil.fr."}</P>
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
        <P>{`Exploitante de la marque Altio : ${LEGAL_CONFIG.COMPANY_NAME}\nForme juridique : ${LEGAL_CONFIG.COMPANY_FORM}\nSIREN : ${LEGAL_CONFIG.COMPANY_SIREN}\nSIRET : ${LEGAL_CONFIG.COMPANY_SIRET}\n${LEGAL_CONFIG.COMPANY_RCS}\nAdresse : ${LEGAL_CONFIG.COMPANY_ADDRESS}\nTVA non applicable, franchise en base de TVA\nDirectrice de publication : Manon Freuchet, exploitante\nEmail : ${LEGAL_CONFIG.COMPANY_EMAIL}`}</P>
      </Section>

      <Section title="Hebergement">
        <P>{"Site : Vercel Inc., 440 N Barranca Avenue #4133, Covina, CA 91723, États-Unis — https://vercel.com/contact. Contact légal publié : +1 559 288 7060 (service de signalement de droits d’auteur).\n\nDonnées et authentification : Supabase, région eu-west-1 (Europe, Irlande). Coordonnées publiées de Supabase Pte. Ltd : 65 Chulia Street #38-02/03, OCBC Centre, Singapore 049513 — privacy@supabase.io. Construction et distribution technique de l’application : Expo et Apple/Google."}</P>
      </Section>

      <Section title="Paiement">
        <P>{"Les paiements utilisent Stripe Connect. Les conditions du prestataire de paiement sont consultables sur https://stripe.com/fr/legal et sa politique de confidentialité sur https://stripe.com/privacy. Altio ne conserve pas les numéros complets de carte bancaire. Les références et statuts de transaction nécessaires au service restent traités par la plateforme."}</P>
      </Section>

      <Section title="Propriete intellectuelle">
        <P>{"Les droits sur la marque, les textes et les éléments originaux d’Altio appartiennent à leurs titulaires respectifs. Les bibliothèques, polices et éléments tiers restent soumis à leurs licences. Les utilisations nécessitant une autorisation doivent respecter ces droits, sans préjudice des exceptions légales.\n\nAucun dépôt ou enregistrement de marque n’est affirmé en l’absence de justificatif."}</P>
      </Section>

      <Section title="Credits">
        <P>
          Application developpee avec React Native (Expo){'\n'}
          Design system : PlusJakartaSans (Google Fonts, OFL){'\n'}
          Icones : Ionicons, Lucide (MIT License){'\n'}
        </P>
      </Section>

      <Section title="Mediation de la consommation">
        <P>{`Le consommateur peut recourir gratuitement à un médiateur compétent après une réclamation écrite préalable restée sans solution, dans les conditions légales de recevabilité. La médiation est facultative et n’empêche pas l’accès au juge.\n\n${LEGAL_CONFIG.MEDIATOR_NAME}\n${LEGAL_CONFIG.MEDIATOR_ADDRESS}`}</P>
        <TouchableOpacity onPress={() => openLink(LEGAL_CONFIG.MEDIATOR_URL)} accessibilityRole="link">
          <Text style={styles.link}>{LEGAL_CONFIG.MEDIATOR_URL}</Text>
        </TouchableOpacity>
      </Section>

      <Section title="Informations pre-contractuelles">
        <P>{"Avant l’engagement, le consommateur doit disposer des informations légalement requises, notamment l’identité du cocontractant, les caractéristiques et délais du service, le prix total et les frais, les modalités de paiement, les garanties et les règles de rétractation et de réclamation.\n\nLa présence de ces conditions ne démontre pas que chaque écran de commande fournit effectivement toutes ces informations. Cette vérification reste nécessaire avant ouverture commerciale."}</P>
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
        <P>{"Le consommateur peut recourir gratuitement à CM2C après une réclamation écrite préalable restée sans solution, dans les conditions légales de recevabilité. La médiation est gratuite pour le consommateur, facultative et n’empêche pas l’accès au juge."}</P>
      </Section>

      <Section title="Mediateur designe">
        <P>{`${LEGAL_CONFIG.MEDIATOR_NAME}\n${LEGAL_CONFIG.MEDIATOR_ADDRESS}`}</P>
        <TouchableOpacity onPress={() => openLink(LEGAL_CONFIG.MEDIATOR_URL)} accessibilityRole="link">
          <Text style={styles.link}>{LEGAL_CONFIG.MEDIATOR_URL}</Text>
        </TouchableOpacity>
      </Section>

      <Section title="Comment saisir le mediateur">
        <P>{`Adressez d’abord une réclamation écrite au professionnel concerné. Pour le service Altio : ${LEGAL_CONFIG.COMPANY_EMAIL}. Conservez les justificatifs de la commande et de la réclamation.\n\nLa demande auprès de CM2C doit notamment être présentée dans l’année suivant la réclamation écrite au professionnel et ne pas concerner un litige déjà examiné ou en cours d’examen par un autre médiateur ou un tribunal.\n\nL’issue de la médiation intervient en principe dans les 90 jours suivant la notification de la saisine recevable, avec possibilité de prolongation pour un litige complexe. Les parties restent libres d’accepter ou de refuser la proposition.`}</P>
      </Section>

      <Section title="Plateforme europeenne de reglement en ligne des litiges">
        <P>{"La plateforme européenne de règlement en ligne des litiges (RLL/ODR) a cessé de fonctionner en 2025 conformément au règlement (UE) 2024/3228. Son ancien lien ne permet plus de déposer une réclamation. La saisine de CM2C s’effectue à partir de son site indiqué ci-dessus."}</P>
      </Section>

      <Section title="Contact service client">
        <P>{`Contact : ${LEGAL_CONFIG.COMPANY_EMAIL}. Précisez la référence de la mission, la difficulté rencontrée et la solution sollicitée. Le traitement d’une réclamation ne suspend ni les délais légaux ni les droits du consommateur. Aucun délai opérationnel d’accusé de réception ou de résolution non vérifié n’est garanti par ce texte.`}</P>
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
  link: {
    ...FONTS.body,
    color: COLORS.brandPrimary,
    fontWeight: '600',
    lineHeight: 22,
    textDecorationLine: 'underline',
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
