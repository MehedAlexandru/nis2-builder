import type {
  DocumentChecklistItem,
  DocumentField,
  DocumentFieldOption,
  DocumentFieldType,
  DocumentSection,
  DocumentTableColumn,
  DocumentTemplate,
  DocumentTemplateCatalog,
  LocalizedText,
} from '../../schemas/documents';
import { documentTemplateCatalogSchema } from '../../schemas/documents';

/**
 * The Romanian template catalogue (English + Romanian). Templates are data:
 * the form renderer, progress calculator and export pipeline never branch on
 * a document key. Adding a document means adding an entry here, not a form.
 */

const l = (en: string, ro: string): LocalizedText => ({ en, ro });

type FieldExtra = Omit<Partial<DocumentField>, 'key' | 'type' | 'label'>;

function field(
  type: DocumentFieldType,
  key: string,
  en: string,
  ro: string,
  extra: FieldExtra = {},
): DocumentField {
  const { required, weight, export: exportMapping, ...rest } = extra;
  return {
    key,
    type,
    label: l(en, ro),
    required: required ?? false,
    weight: weight ?? 2,
    export: exportMapping ?? { kind: type === 'richText' ? 'paragraph' : 'definition_row' },
    ...rest,
  };
}

function text(key: string, en: string, ro: string, extra: FieldExtra = {}): DocumentField {
  return field('text', key, en, ro, extra);
}

function rich(key: string, en: string, ro: string, extra: FieldExtra = {}): DocumentField {
  return field('richText', key, en, ro, { weight: 3, ...extra });
}

function date(key: string, en: string, ro: string, extra: FieldExtra = {}): DocumentField {
  return field('date', key, en, ro, extra);
}

function yesNo(key: string, en: string, ro: string, extra: FieldExtra = {}): DocumentField {
  return field('yesNo', key, en, ro, extra);
}

function options(rows: Array<[string, string, string]>): DocumentFieldOption[] {
  return rows.map(([value, en, ro]) => ({ value, label: l(en, ro) }));
}

function select(
  key: string,
  en: string,
  ro: string,
  choices: DocumentFieldOption[],
  extra: FieldExtra = {},
): DocumentField {
  return field('select', key, en, ro, { options: choices, ...extra });
}

function multi(
  key: string,
  en: string,
  ro: string,
  choices: DocumentFieldOption[],
  extra: FieldExtra = {},
): DocumentField {
  return field('multiSelect', key, en, ro, { options: choices, ...extra });
}

function people(key: string, en: string, ro: string, extra: FieldExtra = {}): DocumentField {
  return field('peoplePicker', key, en, ro, extra);
}

function table(
  key: string,
  en: string,
  ro: string,
  columns: DocumentTableColumn[],
  extra: FieldExtra = {},
): DocumentField {
  return field('table', key, en, ro, {
    weight: 3,
    columns,
    export: { kind: 'table' },
    validation: { minRows: 1, ...extra.validation },
    ...extra,
  });
}

function cols(rows: Array<[string, string, string, boolean?]>): DocumentTableColumn[] {
  return rows.map(([key, en, ro, required]) => ({
    key,
    label: l(en, ro),
    type: 'text',
    required: required ?? false,
  }));
}

function checklist(
  key: string,
  en: string,
  ro: string,
  items: Array<[string, string, string]>,
  extra: FieldExtra = {},
): DocumentField {
  return field('checklist', key, en, ro, {
    weight: 3,
    items: items.map(([itemKey, itemEn, itemRo]): DocumentChecklistItem => ({
      key: itemKey,
      label: l(itemEn, itemRo),
      required: true,
    })),
    ...extra,
  });
}

function signature(key: string, en: string, ro: string, extra: FieldExtra = {}): DocumentField {
  return field('signature', key, en, ro, { weight: 2, export: { kind: 'signature' }, ...extra });
}

function section(
  key: string,
  en: string,
  ro: string,
  fields: DocumentField[],
  description?: [string, string],
): DocumentSection {
  return {
    key,
    title: l(en, ro),
    description: description ? l(description[0], description[1]) : undefined,
    fields,
  };
}

const templates: DocumentTemplate[] = [
  {
    key: 'governance_registration',
    version: 1,
    category: 'governance',
    applicability: 'BOTH',
    ownerRole: 'Management body',
    reviewFrequencyMonths: 12,
    legalReference: 'NIS2 Art. 3(4), Art. 27',
    sortOrder: 1,
    title: l(
      'Entity registration and authority contacts',
      'Inregistrarea entitatii si contactele autoritatii',
    ),
    shortDescription: l(
      'Registration data, contact points and the list of services notified to DNSC.',
      'Datele de inregistrare, punctele de contact si lista serviciilor notificate la DNSC.',
    ),
    description: l(
      'Keep the registration record current and verify the national registration deadline with DNSC before submitting.',
      'Mentineti registrul actualizat si verificati termenul national de inregistrare la DNSC inainte de depunere.',
    ),
    sections: [
      section('entity', 'Entity details', 'Datele entitatii', [
        text('legalName', 'Legal name', 'Denumirea legala', {
          required: true,
          weight: 3,
          prefillKey: 'legalName',
        }),
        text('registrationNumber', 'Trade register number', 'Numarul registrului comertului', {
          required: true,
          prefillKey: 'registrationNumber',
        }),
        text('vatNumber', 'VAT / CUI', 'CUI / TVA', { prefillKey: 'vatNumber' }),
        text('registeredAddress', 'Registered address', 'Adresa sediului social', {
          required: true,
          prefillKey: 'addressLine1',
        }),
        text('countryCode', 'Country', 'Tara', { required: true, prefillKey: 'countryCode' }),
        text('website', 'Website', 'Site web', { prefillKey: 'website' }),
      ]),
      section('contacts', 'Contact points', 'Puncte de contact', [
        text('primaryContactName', 'Primary contact name', 'Numele contactului principal', {
          required: true,
        }),
        text('primaryContactEmail', 'Primary contact email', 'Emailul contactului principal', {
          required: true,
          prefillKey: 'contactEmail',
        }),
        text('primaryContactPhone', 'Primary contact phone', 'Telefonul contactului principal'),
        text('dpoName', 'DPO name', 'Numele DPO', { prefillKey: 'dpo.name' }),
        text('cisoName', 'CISO / security lead', 'CISO / responsabil securitate', {
          prefillKey: 'ciso.name',
        }),
      ]),
      section('services', 'Services and registration', 'Servicii si inregistrare', [
        table(
          'services',
          'Services in scope',
          'Servicii in domeniu',
          cols([
            ['service', 'Service', 'Serviciu', true],
            ['description', 'Description', 'Descriere'],
            ['memberState', 'Member state', 'Stat membru'],
            ['criticality', 'Criticality', 'Criticitate'],
          ]),
        ),
        text('registrationAuthority', 'Registration authority', 'Autoritatea de inregistrare', {
          required: true,
          help: l(
            'DNSC is the Romanian competent authority. Confirm the current registration channel.',
            'DNSC este autoritatea competenta in Romania. Confirmati canalul actual de inregistrare.',
          ),
        }),
        date('registrationDate', 'Registration date', 'Data inregistrarii'),
        date(
          'nextRegistrationReview',
          'Next registration review',
          'Urmatoarea revizuire a inregistrarii',
          { prefillKey: undefined },
        ),
      ]),
    ],
  },
  {
    key: 'management_approval_training',
    version: 1,
    category: 'governance',
    applicability: 'BOTH',
    ownerRole: 'Management body',
    reviewFrequencyMonths: 12,
    legalReference: 'NIS2 Art. 20(1)-(2)',
    sortOrder: 2,
    title: l(
      'Management approval and training record',
      'Aprobarea conducerii si registrul de instruire',
    ),
    shortDescription: l(
      'Accountability record for the management body and its cybersecurity training log.',
      'Registrul responsabilitatii conducerii si jurnalul de instruire in securitate cibernetica.',
    ),
    description: l(
      'The management body approves and oversees the measures. Record the approval and keep evidence of training.',
      'Conducerea aproba si supravegheaza masurile. Documentati aprobarea si pastrati dovezile instruirii.',
    ),
    sections: [
      section('approval', 'Approval and accountability', 'Aprobare si responsabilitate', [
        date('approvalDate', 'Approval date', 'Data aprobarii', { required: true }),
        text(
          'approvalReference',
          'Decision / minute reference',
          'Referinta deciziei / procesului-verbal',
          { required: true },
        ),
        people('approvedBy', 'Approved by', 'Aprobat de', { required: true }),
        rich('decisionSummary', 'Decision summary', 'Rezumatul deciziei', {
          required: true,
          help: l(
            'State what was approved, the scope and the resources assigned.',
            'Precizati ce a fost aprobat, domeniul si resursele alocate.',
          ),
        }),
        rich(
          'accountabilityStatement',
          'Accountability statement',
          'Declaratia de responsabilitate',
          {
            required: true,
            help: l(
              'Describe how the management body monitors and can be held accountable for the measures.',
              'Descrieti modul in care conducerea monitorizeaza si raspunde pentru masuri.',
            ),
          },
        ),
        signature(
          'managementSignature',
          'Management approval signature',
          'Semnatura de aprobare a conducerii',
        ),
      ]),
      section('training', 'Management training log', 'Jurnalul de instruire al conducerii', [
        date('trainingDate', 'Training date', 'Data instruirii', { required: true }),
        text('trainingProvider', 'Provider / trainer', 'Furnizor / formator', { required: true }),
        table(
          'participants',
          'Participants',
          'Participanti',
          cols([
            ['name', 'Name', 'Nume', true],
            ['role', 'Role', 'Functie', true],
            ['topics', 'Topics covered', 'Subiecte acoperite'],
            ['evidence', 'Evidence reference', 'Referinta dovada'],
          ]),
        ),
        text('nextTrainingDate', 'Next training due', 'Urmatoarea instruire', {
          prefillKey: undefined,
        }),
        field('attachment', 'trainingEvidence', 'Training evidence', 'Dovezi de instruire', {
          help: l(
            'Attendance sheets, certificates or links to the learning platform.',
            'Foi de prezenta, certificate sau linkuri catre platforma de invatare.',
          ),
          export: { kind: 'definition_row' },
        }),
      ]),
    ],
  },
  {
    key: 'information_security_policy',
    version: 1,
    category: 'governance',
    applicability: 'BOTH',
    ownerRole: 'CISO',
    reviewFrequencyMonths: 12,
    legalReference: 'NIS2 Art. 21(1), Art. 21(2)(a)',
    sortOrder: 3,
    title: l('Information security policy', 'Politica de securitate a informatiei'),
    shortDescription: l(
      'Top-level policy, scope, objectives, roles and responsibilities (RACI).',
      'Politica de nivel inalt, domeniu, obiective, roluri si responsabilitati (RACI).',
    ),
    sections: [
      section('policy', 'Policy statement', 'Declaratia politicii', [
        rich('purpose', 'Purpose', 'Scop', { required: true }),
        rich('scope', 'Scope', 'Domeniu de aplicare', { required: true }),
        rich('objectives', 'Security objectives', 'Obiective de securitate', { required: true }),
        date('approvalDate', 'Approval date', 'Data aprobarii', { required: true }),
        date('reviewDate', 'Next review date', 'Urmatoarea revizuire', { required: true }),
      ]),
      section('roles', 'Roles and responsibilities', 'Roluri si responsabilitati', [
        table(
          'raci',
          'RACI matrix',
          'Matricea RACI',
          cols([
            ['activity', 'Activity', 'Activitate', true],
            ['responsible', 'Responsible', 'Responsabil', true],
            ['accountable', 'Accountable', 'Responsabil final'],
            ['consulted', 'Consulted', 'Consultati'],
            ['informed', 'Informed', 'Informati'],
          ]),
        ),
        text('policyOwner', 'Policy owner', 'Proprietarul politicii', { required: true }),
      ]),
    ],
  },
  {
    key: 'risk_management_policy',
    version: 1,
    category: 'risk',
    applicability: 'BOTH',
    ownerRole: 'CISO',
    reviewFrequencyMonths: 12,
    legalReference: 'NIS2 Art. 21(2)(a)',
    sortOrder: 4,
    title: l(
      'Risk analysis methodology and register',
      'Metodologia de analiza a riscurilor si registrul',
    ),
    shortDescription: l(
      'Method, risk criteria and a maintained risk register with treatment owners.',
      'Metoda, criterii de risc si registru de risc actualizat cu responsabili de tratare.',
    ),
    sections: [
      section('method', 'Methodology', 'Metodologie', [
        rich('methodology', 'Risk analysis method', 'Metoda de analiza a riscurilor', {
          required: true,
        }),
        text('riskCriteria', 'Risk acceptance criteria', 'Criterii de acceptare a riscului', {
          required: true,
        }),
        text('reviewCycle', 'Review cycle', 'Ciclul de revizuire', { required: true }),
      ]),
      section('register', 'Risk register', 'Registrul de risc', [
        table(
          'riskRegister',
          'Risks',
          'Riscuri',
          cols([
            ['asset', 'Asset / process', 'Activ / proces', true],
            ['threat', 'Threat', 'Amenintare', true],
            ['likelihood', 'Likelihood', 'Probabilitate'],
            ['impact', 'Impact', 'Impact'],
            ['treatment', 'Treatment', 'Tratare'],
            ['owner', 'Owner', 'Responsabil'],
            ['dueDate', 'Due date', 'Termen'],
          ]),
          { required: true, validation: { minRows: 3 } },
        ),
        field('riskMatrix', 'residualRisk', 'Residual risk heat map', 'Harta riscului rezidual', {
          help: l(
            'Select the likelihood and impact after treatment.',
            'Selectati probabilitatea si impactul dupa tratare.',
          ),
          export: { kind: 'risk_matrix' },
        }),
      ]),
    ],
  },
  {
    key: 'asset_inventory',
    version: 1,
    category: 'assets',
    applicability: 'BOTH',
    ownerRole: 'IT Operations',
    reviewFrequencyMonths: 6,
    legalReference: 'NIS2 Art. 21(2)(a), (i)',
    sortOrder: 5,
    title: l('Asset inventory policy and register', 'Politica si registrul inventarului de active'),
    shortDescription: l(
      'Inventory method, ownership and the register of information assets.',
      'Metoda de inventariere, proprietatea si registrul activelor informationale.',
    ),
    sections: [
      section('policy', 'Inventory policy', 'Politica de inventariere', [
        text('inventoryOwner', 'Inventory owner', 'Proprietarul inventarului', { required: true }),
        text('inventoryMethod', 'Inventory method', 'Metoda de inventariere', { required: true }),
        select(
          'reviewFrequency',
          'Review frequency',
          'Frecventa de revizuire',
          options([
            ['monthly', 'Monthly', 'Lunar'],
            ['quarterly', 'Quarterly', 'Trimestrial'],
            ['annual', 'Annual', 'Anual'],
          ]),
          { required: true },
        ),
      ]),
      section('register', 'Asset register', 'Registrul activelor', [
        table(
          'assets',
          'Assets',
          'Active',
          cols([
            ['name', 'Name', 'Denumire', true],
            ['type', 'Type', 'Tip', true],
            ['owner', 'Owner', 'Proprietar'],
            ['location', 'Location', 'Locatie'],
            ['criticality', 'Criticality', 'Criticitate'],
            ['dataClassification', 'Data classification', 'Clasificarea datelor'],
          ]),
          { validation: { minRows: 3 } },
        ),
      ]),
    ],
  },
  {
    key: 'incident_response_plan',
    version: 1,
    category: 'incident',
    applicability: 'BOTH',
    ownerRole: 'CISO',
    reviewFrequencyMonths: 12,
    legalReference: 'NIS2 Art. 21(2)(b)',
    sortOrder: 6,
    title: l('Incident handling plan', 'Planul de gestionare a incidentelor'),
    shortDescription: l(
      'Detection, triage, classification, escalation and lessons-learned procedures.',
      'Proceduri de detectare, triere, clasificare, escaladare si lectii invatate.',
    ),
    sections: [
      section('governance', 'Plan governance', 'Guvernanta planului', [
        text('planOwner', 'Plan owner', 'Proprietarul planului', { required: true }),
        rich('scope', 'Scope', 'Domeniu de aplicare', { required: true }),
        table(
          'escalationContacts',
          'Escalation contacts',
          'Contacte de escaladare',
          cols([
            ['name', 'Name', 'Nume', true],
            ['role', 'Role', 'Rol'],
            ['phone', 'Phone', 'Telefon'],
            ['email', 'Email', 'Email'],
          ]),
        ),
      ]),
      section('lifecycle', 'Incident lifecycle', 'Ciclul de viata al incidentului', [
        rich('detection', 'Detection', 'Detectare', { required: true }),
        rich('triage', 'Triage and classification', 'Triere si clasificare', { required: true }),
        rich('containment', 'Containment and eradication', 'Limitare si eliminare', {
          required: true,
        }),
        rich('recovery', 'Recovery', 'Recuperare', { required: true }),
        rich('lessonsLearned', 'Lessons learned', 'Lectii invatate', { required: true }),
        date('lastTestDate', 'Last exercise date', 'Data ultimului exercitiu'),
      ]),
    ],
  },
  {
    key: 'incident_reporting_procedure',
    version: 1,
    category: 'incident',
    applicability: 'BOTH',
    ownerRole: 'CISO',
    reviewFrequencyMonths: 12,
    legalReference: 'NIS2 Art. 23(1)-(4)',
    sortOrder: 7,
    title: l('Incident reporting procedure', 'Procedura de raportare a incidentelor'),
    shortDescription: l(
      '24-hour early warning, 72-hour notification, intermediate reports and the one-month final report.',
      'Avertizarea initiala in 24 de ore, notificarea in 72 de ore, rapoarte intermediare si raportul final intr-o luna.',
    ),
    description: l(
      'Confirm the current DNSC reporting channel and any national form before an incident occurs.',
      'Confirmati canalul actual de raportare DNSC si formularul national inainte de producerea unui incident.',
    ),
    sections: [
      section('obligations', 'Reporting obligations', 'Obligatii de raportare', [
        text('earlyWarning', 'Early warning (24 hours)', 'Avertizare initiala (24 de ore)', {
          required: true,
          help: l(
            'Who sends it, to whom, and what it must contain.',
            'Cine o trimite, catre cine si ce trebuie sa contina.',
          ),
        }),
        text(
          'incidentNotification',
          'Incident notification (72 hours)',
          'Notificare incident (72 de ore)',
          { required: true },
        ),
        text('finalReport', 'Final report (one month)', 'Raport final (o luna)', {
          required: true,
        }),
        text('intermediateReports', 'Intermediate reports', 'Rapoarte intermediare'),
        text('authorityContact', 'Authority contact', 'Contactul autoritatii', { required: true }),
      ]),
      section('process', 'Operational process', 'Proces operational', [
        table(
          'reportingRoles',
          'Reporting roles',
          'Roluri de raportare',
          cols([
            ['role', 'Role', 'Rol', true],
            ['name', 'Name', 'Nume'],
            ['responsibility', 'Responsibility', 'Responsabilitate'],
          ]),
        ),
        rich('reportTemplate', 'Report template', 'Sablon de raport', {
          required: true,
          help: l(
            'Include facts, affected services, cross-border impact, initial measures and contact details.',
            'Includeti fapte, servicii afectate, impact transfrontalier, masuri initiale si date de contact.',
          ),
        }),
        table(
          'contactTree',
          'Contact tree',
          'Arbore de contact',
          cols([
            ['level', 'Level', 'Nivel', true],
            ['contact', 'Contact', 'Contact', true],
            ['channel', 'Channel', 'Canal'],
          ]),
        ),
        date('lastDrillDate', 'Last reporting drill', 'Ultimul exercitiu de raportare'),
      ]),
    ],
  },
  {
    key: 'business_continuity_plan',
    version: 1,
    category: 'continuity',
    applicability: 'BOTH',
    ownerRole: 'Business continuity lead',
    reviewFrequencyMonths: 12,
    legalReference: 'NIS2 Art. 21(2)(c)',
    sortOrder: 8,
    title: l(
      'Business continuity and crisis management',
      'Continuitatea afacerii si gestionarea crizelor',
    ),
    shortDescription: l(
      'Business impact analysis, recovery objectives, crisis team and tested continuity arrangements.',
      'Analiza de impact, obiective de recuperare, echipa de criza si masuri de continuitate testate.',
    ),
    sections: [
      section('scope', 'Critical services', 'Servicii critice', [
        table(
          'criticalServices',
          'Critical services',
          'Servicii critice',
          cols([
            ['service', 'Service', 'Serviciu', true],
            ['owner', 'Owner', 'Proprietar'],
            ['rtoHours', 'RTO (hours)', 'RTO (ore)'],
            ['rpoHours', 'RPO (hours)', 'RPO (ore)'],
            ['dependencies', 'Dependencies', 'Dependente'],
          ]),
        ),
        date('biaDate', 'Last business impact analysis', 'Ultima analiza de impact'),
      ]),
      section('response', 'Crisis response', 'Raspuns la criza', [
        table(
          'crisisTeam',
          'Crisis team',
          'Echipa de criza',
          cols([
            ['name', 'Name', 'Nume', true],
            ['role', 'Role', 'Rol', true],
            ['contact', 'Contact', 'Contact'],
          ]),
        ),
        rich('backupStrategy', 'Backup strategy', 'Strategia de backup', { required: true }),
        rich('disasterRecovery', 'Disaster recovery', 'Recuperare dupa dezastru', {
          required: true,
        }),
        date('lastTestDate', 'Last continuity test', 'Ultimul test de continuitate'),
        rich('lastTestResult', 'Last test result', 'Rezultatul ultimului test'),
      ]),
    ],
  },
  {
    key: 'supply_chain_security',
    version: 1,
    category: 'supply_chain',
    applicability: 'BOTH',
    ownerRole: 'Procurement',
    reviewFrequencyMonths: 12,
    legalReference: 'NIS2 Art. 21(2)(d), Art. 22',
    sortOrder: 9,
    title: l(
      'Supply chain security and supplier register',
      'Securitatea lantului de aprovizionare si registrul furnizorilor',
    ),
    shortDescription: l(
      'Supplier risk criteria, due diligence, contractual requirements and the supplier register.',
      'Criterii de risc, diligenta, cerinte contractuale si registrul furnizorilor.',
    ),
    sections: [
      section('policy', 'Supply chain policy', 'Politica lantului de aprovizionare', [
        rich('riskCriteria', 'Supplier risk criteria', 'Criterii de risc pentru furnizori', {
          required: true,
        }),
        rich('dueDiligence', 'Due diligence process', 'Procesul de diligenta', { required: true }),
        rich(
          'contractRequirements',
          'Contractual security requirements',
          'Cerinte contractuale de securitate',
          { required: true },
        ),
        text('reviewCycle', 'Review cycle', 'Ciclul de revizuire', { required: true }),
      ]),
      section('register', 'Supplier register', 'Registrul furnizorilor', [
        table(
          'suppliers',
          'Suppliers',
          'Furnizori',
          cols([
            ['supplier', 'Supplier', 'Furnizor', true],
            ['service', 'Service', 'Serviciu', true],
            ['dataAccess', 'Data access', 'Acces la date'],
            ['riskRating', 'Risk rating', 'Nivel de risc'],
            ['lastAssessment', 'Last assessment', 'Ultima evaluare'],
            ['contractReviewDate', 'Contract review', 'Revizuire contract'],
          ]),
        ),
      ]),
    ],
  },
  {
    key: 'secure_development_policy',
    version: 1,
    category: 'development',
    applicability: 'BOTH',
    ownerRole: 'Engineering lead',
    reviewFrequencyMonths: 12,
    legalReference: 'NIS2 Art. 21(2)(e)',
    sortOrder: 10,
    title: l(
      'Secure acquisition, development and maintenance',
      'Achizitie, dezvoltare si mentenanta securizata',
    ),
    shortDescription: l(
      'Secure SDLC, code review, dependency management, vulnerability handling and disclosure.',
      'SDLC securizat, revizuire de cod, gestionarea dependentelor, tratarea vulnerabilitatilor si divulgare.',
    ),
    sections: [
      section('lifecycle', 'Secure lifecycle', 'Ciclul de viata securizat', [
        rich('secureSdlc', 'Secure development lifecycle', 'Ciclul de dezvoltare securizat', {
          required: true,
        }),
        rich('codeReview', 'Code review and testing', 'Revizuire de cod si testare', {
          required: true,
        }),
        rich(
          'dependencyManagement',
          'Dependency and SBOM management',
          'Gestionarea dependentelor si SBOM',
          { required: true },
        ),
        rich('releaseApproval', 'Release approval', 'Aprobarea lansarii', { required: true }),
      ]),
      section('vulnerabilities', 'Vulnerability handling', 'Tratarea vulnerabilitatilor', [
        rich('disclosurePolicy', 'Disclosure policy', 'Politica de divulgare', { required: true }),
        text('remediationSla', 'Remediation SLA', 'SLA de remediere', { required: true }),
        text('sbomLocation', 'SBOM location', 'Locatia SBOM'),
      ]),
    ],
  },
  {
    key: 'audit_testing',
    version: 1,
    category: 'assurance',
    applicability: 'BOTH',
    ownerRole: 'Security assurance lead',
    reviewFrequencyMonths: 12,
    legalReference: 'NIS2 Art. 21(2)(f)',
    sortOrder: 11,
    title: l(
      'Effectiveness assessment and security audit',
      'Evaluarea eficacitatii si auditul de securitate',
    ),
    shortDescription: l(
      'KPIs, audit schedule, testing programme and evidence that controls work.',
      'KPI, program de audit, program de testare si dovezi privind functionarea controalelor.',
    ),
    sections: [
      section('assurance', 'Assurance programme', 'Programul de asigurare', [
        table(
          'kpis',
          'Security KPIs',
          'KPI de securitate',
          cols([
            ['kpi', 'KPI', 'KPI', true],
            ['target', 'Target', 'Tinta'],
            ['frequency', 'Frequency', 'Frecventa'],
            ['owner', 'Owner', 'Responsabil'],
          ]),
        ),
        table(
          'auditSchedule',
          'Audit schedule',
          'Programul de audit',
          cols([
            ['audit', 'Audit', 'Audit', true],
            ['scope', 'Scope', 'Domeniu'],
            ['date', 'Date', 'Data'],
            ['auditor', 'Auditor', 'Auditor'],
          ]),
        ),
        date('lastAuditDate', 'Last audit date', 'Data ultimului audit'),
        rich(
          'findingsProcess',
          'Findings and remediation process',
          'Procesul de constatari si remediere',
          { required: true },
        ),
      ]),
    ],
  },
  {
    key: 'security_awareness_training',
    version: 1,
    category: 'training',
    applicability: 'BOTH',
    ownerRole: 'HR / Security awareness lead',
    reviewFrequencyMonths: 12,
    legalReference: 'NIS2 Art. 20(2), Art. 21(2)(g)',
    sortOrder: 12,
    title: l(
      'Cyber hygiene and awareness training',
      'Igiena cibernetica si instruirea de constientizare',
    ),
    shortDescription: l(
      'Programme, content, frequency and attendance evidence for all staff.',
      'Program, continut, frecventa si dovezi de participare pentru tot personalul.',
    ),
    sections: [
      section('programme', 'Training programme', 'Programul de instruire', [
        text('policyOwner', 'Programme owner', 'Proprietarul programului', { required: true }),
        select(
          'frequency',
          'Frequency',
          'Frecventa',
          options([
            ['quarterly', 'Quarterly', 'Trimestrial'],
            ['annual', 'Annual', 'Anual'],
            ['biannual', 'Twice a year', 'De doua ori pe an'],
          ]),
          { required: true },
        ),
        multi(
          'topics',
          'Topics',
          'Subiecte',
          options([
            ['phishing', 'Phishing', 'Phishing'],
            ['passwords', 'Passwords and MFA', 'Parole si MFA'],
            ['incident', 'Incident reporting', 'Raportarea incidentelor'],
            ['data', 'Data protection', 'Protejarea datelor'],
            ['remote', 'Remote working', 'Munca la distanta'],
          ]),
          { required: true },
        ),
        text('deliveryMethod', 'Delivery method', 'Metoda de livrare'),
        text('completionTarget', 'Completion target', 'Tinta de finalizare'),
      ]),
      section('records', 'Attendance evidence', 'Dovezi de participare', [
        table(
          'attendance',
          'Attendance log',
          'Registrul de participare',
          cols([
            ['name', 'Name', 'Nume', true],
            ['role', 'Role', 'Rol'],
            ['date', 'Date', 'Data'],
            ['result', 'Result', 'Rezultat'],
          ]),
        ),
        yesNo('phishingSimulation', 'Phishing simulation run', 'Simulare de phishing derulata'),
        date('nextCampaignDate', 'Next campaign', 'Urmatoarea campanie'),
      ]),
    ],
  },
  {
    key: 'cryptography_policy',
    version: 1,
    category: 'cryptography',
    applicability: 'BOTH',
    ownerRole: 'CISO',
    reviewFrequencyMonths: 12,
    legalReference: 'NIS2 Art. 21(2)(h)',
    sortOrder: 13,
    title: l('Cryptography and encryption policy', 'Politica de criptografie si criptare'),
    shortDescription: l(
      'Approved algorithms, key management, TLS requirements and data protection in transit and at rest.',
      'Algoritmi aprobati, gestionarea cheilor, cerinte TLS si protectia datelor in tranzit si in repaus.',
    ),
    sections: [
      section('policy', 'Cryptography policy', 'Politica de criptografie', [
        text('cryptoStandard', 'Crypto standard', 'Standard criptografic', { required: true }),
        multi(
          'approvedAlgorithms',
          'Approved algorithms',
          'Algoritmi aprobati',
          options([
            ['aes256', 'AES-256', 'AES-256'],
            ['rsa', 'RSA', 'RSA'],
            ['ecdsa', 'ECDSA', 'ECDSA'],
            ['sha256', 'SHA-256', 'SHA-256'],
          ]),
          { required: true },
        ),
        rich('keyManagement', 'Key management', 'Gestionarea cheilor', { required: true }),
        text('tlsRequirement', 'TLS requirement', 'Cerinta TLS', { required: true }),
        rich('dataAtRest', 'Data at rest', 'Date in repaus', { required: true }),
        rich('dataInTransit', 'Data in transit', 'Date in tranzit', { required: true }),
      ]),
      section('exceptions', 'Exceptions and review', 'Exceptii si revizuire', [
        rich('exceptionProcess', 'Exception process', 'Procesul de exceptii'),
        date('lastReviewDate', 'Last review date', 'Data ultimei revizuiri'),
      ]),
    ],
  },
  {
    key: 'hr_security',
    version: 1,
    category: 'hr',
    applicability: 'BOTH',
    ownerRole: 'HR lead',
    reviewFrequencyMonths: 12,
    legalReference: 'NIS2 Art. 21(2)(i)',
    sortOrder: 14,
    title: l('Human resources security', 'Securitatea resurselor umane'),
    shortDescription: l(
      'Joiners, movers and leavers controls, screening, access reviews and disciplinary process.',
      'Controlul angajarilor, schimbarilor si plecarilor, verificari, revizuirea accesului si procesul disciplinar.',
    ),
    sections: [
      section('lifecycle', 'Employment lifecycle', 'Ciclul de viata al angajarii', [
        rich('screening', 'Screening and vetting', 'Verificare si evaluare', { required: true }),
        checklist('onboardingChecklist', 'Onboarding controls', 'Controale la angajare', [
          [
            'contract',
            'Signed confidentiality and security obligations',
            'Obligatii de confidentialitate si securitate semnate',
          ],
          [
            'training',
            'Security awareness training completed',
            'Instruirea de securitate finalizata',
          ],
          ['access', 'Least-privilege access approved', 'Acces cu privilegii minime aprobat'],
          ['assets', 'Assets issued and recorded', 'Active predate si inregistrate'],
        ]),
        rich('roleChangeProcess', 'Role change process', 'Procesul de schimbare a rolului'),
        checklist('offboardingChecklist', 'Offboarding controls', 'Controale la plecare', [
          ['revoke', 'Access revoked', 'Acces revocat'],
          ['assets', 'Assets returned', 'Active returnate'],
          ['handover', 'Knowledge handover completed', 'Predarea cunostintelor finalizata'],
          ['records', 'Records retained per policy', 'Inregistrari pastrate conform politicii'],
        ]),
        text('accessReviewFrequency', 'Access review frequency', 'Frecventa revizuirii accesului'),
        rich('disciplinaryProcess', 'Disciplinary process', 'Procesul disciplinar'),
      ]),
    ],
  },
  {
    key: 'mfa_secure_communications',
    version: 1,
    category: 'access',
    applicability: 'BOTH',
    ownerRole: 'CISO',
    reviewFrequencyMonths: 12,
    legalReference: 'NIS2 Art. 21(2)(j)',
    sortOrder: 15,
    title: l(
      'MFA, authentication and secure communications',
      'MFA, autentificare si comunicatii securizate',
    ),
    shortDescription: l(
      'Multi-factor authentication, privileged access and secured voice, video, text and emergency communications.',
      'Autentificare multifactor, acces privilegiat si comunicatii securizate voce, video, text si urgenta.',
    ),
    sections: [
      section('authentication', 'Authentication', 'Autentificare', [
        multi(
          'mfaCoverage',
          'MFA coverage',
          'Acoperirea MFA',
          options([
            ['all', 'All users', 'Toti utilizatorii'],
            ['privileged', 'Privileged accounts', 'Conturi privilegiate'],
            ['remote', 'Remote access', 'Acces de la distanta'],
            ['admin', 'Administrative consoles', 'Console administrative'],
          ]),
          { required: true },
        ),
        multi(
          'mfaMethods',
          'Approved MFA methods',
          'Metode MFA aprobate',
          options([
            ['totp', 'Authenticator app (TOTP)', 'Aplicatie de autentificare (TOTP)'],
            ['hardware', 'Hardware token', 'Token hardware'],
            ['passkey', 'Passkey / FIDO2', 'Passkey / FIDO2'],
          ]),
          { required: true },
        ),
        yesNo(
          'privilegedMfa',
          'MFA enforced for privileged accounts',
          'MFA obligatoriu pentru conturi privilegiate',
          { required: true },
        ),
        rich('passwordPolicy', 'Password policy', 'Politica de parole', { required: true }),
      ]),
      section('communications', 'Secure communications', 'Comunicatii securizate', [
        rich('secureVoice', 'Secure voice', 'Comunicatii vocale securizate'),
        rich('secureVideo', 'Secure video', 'Comunicatii video securizate'),
        rich('secureText', 'Secure text and chat', 'Text si chat securizat'),
        rich('emergencyComms', 'Emergency communications', 'Comunicatii de urgenta'),
        rich('exceptions', 'Exceptions', 'Exceptii'),
      ]),
    ],
  },
  {
    key: 'patch_change_management',
    version: 1,
    category: 'vulnerabilities',
    applicability: 'BOTH',
    ownerRole: 'IT Operations',
    reviewFrequencyMonths: 6,
    legalReference: 'NIS2 Art. 21(2)(e)',
    sortOrder: 16,
    title: l('Patch and change management', 'Gestionarea corectiilor si a schimbarilor'),
    shortDescription: l(
      'Patch SLAs, testing, change approval, emergency changes and the change log.',
      'SLA pentru corectii, testare, aprobarea schimbarilor, schimbari de urgenta si jurnalul schimbarilor.',
    ),
    sections: [
      section('patching', 'Patch management', 'Gestionarea corectiilor', [
        rich('patchPolicy', 'Patch policy', 'Politica de corectii', { required: true }),
        text('criticalPatchSla', 'Critical patch SLA', 'SLA pentru corectii critice', {
          required: true,
        }),
        rich('patchTesting', 'Patch testing', 'Testarea corectiilor'),
        text('patchInventory', 'Patch inventory source', 'Sursa inventarului de corectii'),
      ]),
      section('changes', 'Change management', 'Gestionarea schimbarilor', [
        rich('changeProcess', 'Change process', 'Procesul de schimbare', { required: true }),
        rich('emergencyChange', 'Emergency change', 'Schimbare de urgenta'),
        table(
          'changeLog',
          'Change log',
          'Jurnalul schimbarilor',
          cols([
            ['change', 'Change', 'Schimbare', true],
            ['date', 'Date', 'Data'],
            ['owner', 'Owner', 'Responsabil'],
            ['risk', 'Risk', 'Risc'],
            ['approval', 'Approval', 'Aprobare'],
          ]),
        ),
      ]),
    ],
  },
  {
    key: 'network_security_segmentation',
    version: 1,
    category: 'network',
    applicability: 'BOTH',
    ownerRole: 'Network lead',
    reviewFrequencyMonths: 12,
    legalReference: 'NIS2 Art. 21(2)(e), (i)',
    sortOrder: 17,
    title: l('Network security and segmentation', 'Securitatea retelei si segmentarea'),
    shortDescription: l(
      'Network zones, boundary controls, remote access and segmentation review.',
      'Zone de retea, controale de granita, acces la distanta si revizuirea segmentarii.',
    ),
    sections: [
      section('architecture', 'Architecture', 'Arhitectura', [
        field('attachment', 'networkDiagram', 'Network diagram', 'Diagrama retelei', {
          help: l(
            'Attach the current diagram; the audit module will also generate one in a later phase.',
            'Atasati diagrama actuala; modulul de audit va genera una intr-o faza ulterioara.',
          ),
        }),
        table(
          'zones',
          'Zones',
          'Zone',
          cols([
            ['zone', 'Zone', 'Zona', true],
            ['purpose', 'Purpose', 'Scop'],
            ['systems', 'Systems', 'Sisteme'],
            ['controls', 'Controls', 'Controale'],
          ]),
        ),
        rich('boundaryControls', 'Boundary controls', 'Controale de granita', { required: true }),
        rich('remoteAccess', 'Remote access', 'Acces la distanta', { required: true }),
        date('lastReviewDate', 'Last segmentation review', 'Ultima revizuire a segmentarii'),
      ]),
    ],
  },
  {
    key: 'logging_monitoring',
    version: 1,
    category: 'operations',
    applicability: 'BOTH',
    ownerRole: 'SOC / IT Operations',
    reviewFrequencyMonths: 12,
    legalReference: 'NIS2 Art. 21(2)(b), (f)',
    sortOrder: 18,
    title: l('Logging and monitoring', 'Jurnalizare si monitorizare'),
    shortDescription: l(
      'Log sources, retention, protection, alerting and monitoring review.',
      'Surse de jurnal, retentie, protectie, alertare si revizuirea monitorizarii.',
    ),
    sections: [
      section('logging', 'Logging', 'Jurnalizare', [
        multi(
          'logSources',
          'Log sources',
          'Surse de jurnal',
          options([
            ['identity', 'Identity and access', 'Identitate si acces'],
            ['endpoint', 'Endpoints', 'Statiuni'],
            ['network', 'Network devices', 'Echipamente de retea'],
            ['cloud', 'Cloud services', 'Servicii cloud'],
            ['applications', 'Applications', 'Aplicatii'],
          ]),
          { required: true },
        ),
        text('retention', 'Retention period', 'Perioada de retentie', { required: true }),
        yesNo('timeSync', 'Time synchronisation', 'Sincronizare temporala', { required: true }),
        rich('logProtection', 'Log protection', 'Protectia jurnalelor', { required: true }),
      ]),
      section('monitoring', 'Monitoring and response', 'Monitorizare si raspuns', [
        rich('alertingProcess', 'Alerting process', 'Procesul de alertare', { required: true }),
        text('socContact', 'Monitoring contact', 'Contact monitorizare'),
        text('reviewCadence', 'Review cadence', 'Cadența revizuirii'),
        date('lastReviewDate', 'Last review date', 'Data ultimei revizuiri'),
      ]),
    ],
  },
  {
    key: 'statement_of_applicability',
    version: 1,
    category: 'governance',
    applicability: 'VOLUNTARY',
    ownerRole: 'CISO',
    reviewFrequencyMonths: 12,
    legalReference: 'NIS2 Art. 21(1)-(2); ISO/IEC 27001 Annex A',
    sortOrder: 19,
    title: l(
      'Statement of Applicability and control mapping',
      'Declaratia de aplicabilitate si maparea controalelor',
    ),
    shortDescription: l(
      'Optional mapping of NIS2 measures to ISO 27001 Annex A or CIS Controls.',
      'Mapare optionala a masurilor NIS2 la ISO 27001 Anexa A sau CIS Controls.',
    ),
    sections: [
      section('mapping', 'Scope and mapping', 'Domeniu si mapare', [
        multi(
          'frameworks',
          'Reference frameworks',
          'Cadre de referinta',
          options([
            ['iso27001', 'ISO/IEC 27001 Annex A', 'ISO/IEC 27001 Anexa A'],
            ['cis', 'CIS Controls', 'CIS Controls'],
            ['internal', 'Internal control framework', 'Cadru intern de control'],
          ]),
        ),
        rich('scope', 'Scope', 'Domeniu de aplicare', { required: true }),
        table(
          'mapping',
          'Control mapping',
          'Maparea controalelor',
          cols([
            ['control', 'Control', 'Control', true],
            ['nis2Measure', 'NIS2 measure', 'Masura NIS2', true],
            ['status', 'Status', 'Status'],
            ['evidence', 'Evidence', 'Dovezi'],
            ['owner', 'Owner', 'Responsabil'],
          ]),
          { validation: { minRows: 3 } },
        ),
        rich('exceptions', 'Exclusions and justification', 'Excluderi si justificare'),
        date('approvalDate', 'Approval date', 'Data aprobarii'),
      ]),
    ],
  },
  {
    key: 'access_control_policy',
    version: 1,
    category: 'access',
    applicability: 'BOTH',
    ownerRole: 'IT Security',
    reviewFrequencyMonths: 12,
    legalReference: 'NIS2 Art. 21(2)(i), (j)',
    sortOrder: 20,
    title: l(
      'Access control and identity management',
      'Controlul accesului si gestionarea identitatilor',
    ),
    shortDescription: l(
      'Least privilege, privileged access, joiner/mover/leaver controls and access reviews.',
      'Privilegii minime, acces privilegiat, controlul angajarilor/schimbarilor/plecarilor si revizuiri de acces.',
    ),
    sections: [
      section('policy', 'Access policy', 'Politica de acces', [
        rich('accessPolicy', 'Access control policy', 'Politica de control al accesului', {
          required: true,
        }),
        yesNo('leastPrivilege', 'Least privilege enforced', 'Privilegii minime aplicate', {
          required: true,
        }),
        rich(
          'privilegedAccess',
          'Privileged access management',
          'Gestionarea accesului privilegiat',
          { required: true },
        ),
        rich('joinerMoverLeaver', 'Joiner, mover, leaver', 'Angajare, schimbare, plecare', {
          required: true,
        }),
        text('accessReviewFrequency', 'Access review frequency', 'Frecventa revizuirii accesului'),
      ]),
      section('privileged', 'Privileged accounts', 'Conturi privilegiate', [
        table(
          'privilegedAccounts',
          'Privileged accounts',
          'Conturi privilegiate',
          cols([
            ['account', 'Account', 'Cont', true],
            ['owner', 'Owner', 'Proprietar'],
            ['purpose', 'Purpose', 'Scop'],
            ['mfa', 'MFA enabled', 'MFA activat'],
            ['lastReview', 'Last review', 'Ultima revizuire'],
          ]),
        ),
      ]),
    ],
  },
  {
    key: 'vulnerability_management',
    version: 1,
    category: 'vulnerabilities',
    applicability: 'BOTH',
    ownerRole: 'IT Security',
    reviewFrequencyMonths: 6,
    legalReference: 'NIS2 Art. 21(2)(e)',
    sortOrder: 21,
    title: l('Vulnerability management', 'Gestionarea vulnerabilitatilor'),
    shortDescription: l(
      'Scanning cadence, severity SLAs, disclosure and exception handling.',
      'Cadența de scanare, SLA pe severitate, divulgare si gestionarea exceptiilor.',
    ),
    sections: [
      section('process', 'Vulnerability process', 'Procesul de vulnerabilitati', [
        select(
          'scanningFrequency',
          'Scanning frequency',
          'Frecventa scanarii',
          options([
            ['weekly', 'Weekly', 'Saptamanal'],
            ['monthly', 'Monthly', 'Lunar'],
            ['quarterly', 'Quarterly', 'Trimestrial'],
          ]),
          { required: true },
        ),
        text('scanner', 'Scanner / tooling', 'Scanner / instrumente', { required: true }),
        table(
          'severitySla',
          'Remediation SLAs',
          'SLA de remediere',
          cols([
            ['severity', 'Severity', 'Severitate', true],
            ['remediationDays', 'Days to remediate', 'Zile pentru remediere', true],
            ['owner', 'Owner', 'Responsabil'],
          ]),
        ),
        rich('disclosurePolicy', 'Disclosure policy', 'Politica de divulgare'),
        rich('exceptionProcess', 'Exception process', 'Procesul de exceptii'),
        date('lastScanDate', 'Last scan date', 'Data ultimei scanari'),
      ]),
    ],
  },
  {
    key: 'physical_security',
    version: 1,
    category: 'physical',
    applicability: 'BOTH',
    ownerRole: 'Facilities / Security',
    reviewFrequencyMonths: 12,
    legalReference: 'NIS2 Art. 21(2)(i)',
    sortOrder: 22,
    title: l('Physical and environmental security', 'Securitate fizica si de mediu'),
    shortDescription: l(
      'Sites, physical access, environmental controls, visitors and review evidence.',
      'Locatii, acces fizic, controale de mediu, vizitatori si dovezi de revizuire.',
    ),
    sections: [
      section('sites', 'Sites and controls', 'Locatii si controale', [
        table(
          'sites',
          'Sites',
          'Locatii',
          cols([
            ['site', 'Site', 'Locatie', true],
            ['address', 'Address', 'Adresa'],
            ['controls', 'Security controls', 'Controale de securitate'],
            ['owner', 'Owner', 'Responsabil'],
          ]),
        ),
        rich('accessControl', 'Physical access control', 'Controlul accesului fizic', {
          required: true,
        }),
        rich('environmentalControls', 'Environmental controls', 'Controale de mediu', {
          required: true,
        }),
        rich('visitorProcess', 'Visitor process', 'Procesul pentru vizitatori'),
        date('lastReviewDate', 'Last review date', 'Data ultimei revizuiri'),
      ]),
    ],
  },
  {
    key: 'backup_recovery',
    version: 1,
    category: 'backup',
    applicability: 'BOTH',
    ownerRole: 'IT Operations',
    reviewFrequencyMonths: 6,
    legalReference: 'NIS2 Art. 21(2)(c)',
    sortOrder: 23,
    title: l('Backup and recovery', 'Copii de siguranta si recuperare'),
    shortDescription: l(
      'Backup scope, retention, encryption, offline copies and restore testing.',
      'Domeniul backup-ului, retentia, criptarea, copiile offline si testarea restaurarii.',
    ),
    sections: [
      section('backup', 'Backup management', 'Gestionarea copiilor de siguranta', [
        rich('backupScope', 'Backup scope', 'Domeniul backup-ului', { required: true }),
        text('backupFrequency', 'Backup frequency', 'Frecventa backup-ului', { required: true }),
        text('retention', 'Retention', 'Retentie', { required: true }),
        yesNo('encryption', 'Backups encrypted', 'Copii criptate', { required: true }),
        yesNo('offsite', 'Offsite / offline copy', 'Copie offsite / offline'),
      ]),
      section('recovery', 'Recovery testing', 'Testarea recuperarii', [
        table(
          'rtoRpo',
          'Service objectives',
          'Obiective pe serviciu',
          cols([
            ['service', 'Service', 'Serviciu', true],
            ['rto', 'RTO', 'RTO'],
            ['rpo', 'RPO', 'RPO'],
          ]),
        ),
        rich('drPlan', 'Disaster recovery plan', 'Planul de recuperare dupa dezastru', {
          required: true,
        }),
        date('lastRestoreTest', 'Last restore test', 'Ultimul test de restaurare'),
        rich('testResult', 'Last test result', 'Rezultatul ultimului test'),
      ]),
    ],
  },
  {
    key: 'management_reporting',
    version: 1,
    category: 'governance',
    applicability: 'BOTH',
    ownerRole: 'Management body',
    reviewFrequencyMonths: 12,
    legalReference: 'NIS2 Art. 20(1)-(2), Art. 21(1)',
    sortOrder: 24,
    title: l('Management reporting and review', 'Raportarea si revizuirea de catre conducere'),
    shortDescription: l(
      'Reporting cadence, KPIs, risk updates and management decisions.',
      'Cadența raportarii, KPI, actualizari de risc si decizii ale conducerii.',
    ),
    sections: [
      section('reporting', 'Management review', 'Revizuirea conducerii', [
        text('reportingCadence', 'Reporting cadence', 'Cadența raportarii', { required: true }),
        people('boardMember', 'Management body member', 'Membru al conducerii', { required: true }),
        table(
          'kpiSummary',
          'KPI summary',
          'Rezumat KPI',
          cols([
            ['metric', 'Metric', 'Metrica', true],
            ['target', 'Target', 'Tinta'],
            ['actual', 'Actual', 'Actual'],
            ['trend', 'Trend', 'Tendinta'],
          ]),
        ),
        rich('riskUpdates', 'Risk updates', 'Actualizari de risc', { required: true }),
        rich('decisions', 'Decisions and actions', 'Decizii si actiuni', { required: true }),
        date('nextReviewDate', 'Next review date', 'Urmatoarea revizuire'),
      ]),
    ],
  },
];

export const roDocumentTemplateCatalog: DocumentTemplateCatalog =
  documentTemplateCatalogSchema.parse({
    code: 'RO',
    version: 1,
    templates,
  });

export function getDocumentTemplates(): DocumentTemplate[] {
  return roDocumentTemplateCatalog.templates;
}

export function getDocumentTemplate(key: string): DocumentTemplate | undefined {
  return roDocumentTemplateCatalog.templates.find((template) => template.key === key);
}
