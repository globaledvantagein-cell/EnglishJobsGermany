import fetch from 'node-fetch';
import { StripHtml, SanitizeHtml } from '../utils.js';
import { GERMAN_CITIES, isGermanyString, normalizeWorkplaceType, normalizeEmploymentType } from '../core/locationPrefilters.js';
import { normalizeArray } from '../core/jobExtractor.js';
import { loadScrapeStates, saveScrapeStatesBulk, computeContentHash, stateKey } from '../core/scrapeState.js';


// --- Germany location matching -------------------------------------------------

function hasGermanyLocation(job) {
    // Check locationsText first (most companies populate this)
    const locationsText = (typeof job === 'string') ? job : (job.locationsText || '');
    if (locationsText && isGermanyString(locationsText)) return true;

    // Fallback: check bulletFields (some companies like Europcar store country/city here)
    // bulletFields format: ['Germany', 'Hamburg', 'JR108514'] � country in [0], city in [1]
    if (typeof job === 'object' && Array.isArray(job.bulletFields)) {
        const bfText = job.bulletFields.map(b => String(b)).join(' ');
        if (isGermanyString(bfText)) return true;
    }

    return false;
}

// --- Company list -------------------------------------------------------------
//
// Format: { company, instance, site, name }
// URL:    https://{company}.{instance}.myworkdayjobs.com/wday/cxs/{company}/{site}/jobs
//
// To find a company's Workday slug, visit their careers page � if it's hosted on
// Workday it will redirect to a myworkdayjobs.com URL. The instance (wd1/wd3/wd5)
// and site path are visible in the URL.
//
// Comment format: // ~N Germany jobs | ~M total

const companyBoards = [

    // -- Original verified companies --
    { company: 'leidos', instance: 'wd5', site: 'External', name: 'Leidos' },
    { company: 'cadence', instance: 'wd1', site: 'External_Careers', name: 'Cadence' },
    { company: 'redhat', instance: 'wd5', site: 'Jobs', name: 'Red Hat' },
    { company: 'paypal', instance: 'wd1', site: 'Jobs', name: 'PayPal' },
    { company: 'nxp', instance: 'wd3', site: 'Careers', name: 'NXP' },
    { company: 'astrazeneca', instance: 'wd3', site: 'Careers', name: 'AstraZeneca' },
    { company: 'takeda', instance: 'wd3', site: 'External', name: 'Takeda' },
    { company: 'analogdevices', instance: 'wd1', site: 'External', name: 'Analog Devices' },
    { company: 'kone', instance: 'wd3', site: 'Careers', name: 'KONE' },
    { company: 'equinix', instance: 'wd1', site: 'External', name: 'Equinix' },
    { company: 'trendmicro', instance: 'wd3', site: 'External', name: 'Trend Micro' },
    { company: 'broadridge', instance: 'wd5', site: 'Careers', name: 'Broadridge' },
    { company: 'thales', instance: 'wd3', site: 'Careers', name: 'Thales' },
    { company: 'dupont', instance: 'wd5', site: 'Jobs', name: 'DuPont' },
    { company: 'mars', instance: 'wd3', site: 'External', name: 'Mars' },
    { company: 'dell', instance: 'wd1', site: 'External', name: 'Dell' },
    { company: 'intel', instance: 'wd1', site: 'External', name: 'Intel' },
    { company: 'globalfoundries', instance: 'wd1', site: 'External', name: 'GlobalFoundries' },
    { company: 'micron', instance: 'wd1', site: 'External', name: 'Micron' },
    { company: 'shell', instance: 'wd3', site: 'ShellCareers', name: 'Shell' },

    // -- New from dorking --
    { company: 'mufgub', instance: 'wd3', site: 'MUFG-Careers', name: 'MUFG' },
    { company: 'gsk', instance: 'wd5', site: 'GSKCareers', name: 'GSK' },
    { company: 'illumina', instance: 'wd1', site: 'illumina-careers', name: 'Illumina' },
    { company: 'fastretailing', instance: 'wd3', site: 'graduates_eu_Uniqlo', name: 'Uniqlo' },
    { company: 'aresmgmt', instance: 'wd1', site: 'External', name: 'Ares Management' },
    { company: 'tmhcc', instance: 'wd108', site: 'External', name: 'Tokio Marine HCC' },
    { company: 'sabre', instance: 'wd1', site: 'SabreJobs', name: 'Sabre' },
    { company: 'maersk', instance: 'wd3', site: 'Maersk_Careers', name: 'Maersk' },
    { company: 'philips', instance: 'wd3', site: 'jobs-and-careers', name: 'Philips' },
    { company: 'bdx', instance: 'wd1', site: 'EXTERNAL_CAREER_SITE_GERMANY', name: 'BD (Becton Dickinson)' },
    { company: 'alcon', instance: 'wd5', site: 'careers_alcon', name: 'Alcon' },
    { company: 'sandvik', instance: 'wd3', site: 'walter-jobs', name: 'Walter (Sandvik)' },
    { company: 'condenast', instance: 'wd5', site: 'CondeCareers', name: 'Cond� Nast' },
    { company: 'freseniusglobal', instance: 'wd3', site: 'FK_Careers', name: 'Fresenius Kabi' },
    { company: 'solenis', instance: 'wd1', site: 'Solenis', name: 'Solenis' },
    { company: 'athora', instance: 'wd3', site: 'athora-careers', name: 'Athora' },
    { company: 'alantra', instance: 'wd3', site: 'Alantra', name: 'Alantra' },
    { company: 'aesop', instance: 'wd3', site: 'aesopcareers', name: 'Aesop' },
    { company: 'bb', instance: 'wd3', site: 'BlackBerry', name: 'BlackBerry' },
    { company: 'novanta', instance: 'wd5', site: 'Novanta-Careers', name: 'Novanta' },
    { company: 'airliquidehr', instance: 'wd3', site: 'AirLiquideExternalCareer', name: 'Air Liquide' },
    { company: 'covestro', instance: 'wd3', site: 'cov_external', name: 'Covestro' },
    { company: 'galileo', instance: 'wd3', site: 'global_education_germany_career_site', name: 'Galileo Global Education' },
    { company: 'insulet', instance: 'wd5', site: 'insuletcareers', name: 'Insulet (Omnipod)' },
    { company: 'ossur', instance: 'wd3', site: 'ossurcareersglobal', name: '�ssur' },
    { company: 'rentschler', instance: 'wd3', site: 'Rentschler_Career', name: 'Rentschler Biopharma' },
    { company: 'raymondjames', instance: 'wd1', site: 'RaymondJamesCareers', name: 'Raymond James' },
    { company: 'brenntag', instance: 'wd3', site: 'brenntag_jobs', name: 'Brenntag' },
    { company: 'unilever', instance: 'wd3', site: 'Unilever_Experienced_Professionals', name: 'Unilever' },
    { company: 'iberdrola', instance: 'wd3', site: 'Iberdrola', name: 'Iberdrola' },
    { company: 'hl', instance: 'wd1', site: 'Campus', name: 'Houlihan Lokey' },
    { company: 'bf', instance: 'wd5', site: 'International', name: 'Brown-Forman' },
    { company: 'wilhelmsen', instance: 'wd3', site: 'Wilhelmsen', name: 'Wilhelmsen' },
    { company: 'europcar', instance: 'wd103', site: 'EuropcarCareerPage', name: 'Europcar' },
    { company: 'db', instance: 'wd3', site: 'DBWebsite', name: 'Deutsche Bank' },
    { company: 'pae', instance: 'wd1', site: 'Amentum_Careers', name: 'Amentum' },
    { company: 'villeroyboch', instance: 'wd3', site: 'careers', name: 'Villeroy & Boch' },
    { company: 'holmanautogroup', instance: 'wd1', site: 'HolmanEnterprisesCareers', name: 'Holman' },
    { company: 'kbr', instance: 'wd5', site: 'KBR_Careers', name: 'KBR' },
    { company: 'movadogroup', instance: 'wd1', site: 'Careers', name: 'Movado Group' },
    { company: 'barrywehmiller', instance: 'wd1', site: 'BWCareers', name: 'Barry-Wehmiller' },
    { company: 'skechers', instance: 'wd5', site: 'One-career-site', name: 'Skechers' },
    { company: 'otis', instance: 'wd5', site: 'REC_Ext_Gateway', name: 'Otis' },
    { company: 'esab', instance: 'wd5', site: 'esabcareers', name: 'ESAB' },
    { company: 'ttiemea', instance: 'wd3', site: 'TTI', name: 'TTI (Techtronic Industries)' },
    { company: 'jm', instance: 'wd103', site: 'External', name: 'Johnson Matthey' },
    { company: 'faro', instance: 'wd1', site: 'FARO', name: 'FARO Technologies' },
    { company: 'cw', instance: 'wd1', site: 'External', name: 'Curtiss-Wright' },
    { company: 'livanova', instance: 'wd5', site: 'Search', name: 'LivaNova' },
    { company: 'relx', instance: 'wd3', site: 'ReedExhibitions', name: 'RELX (Reed Exhibitions)' },
    { company: 'zuehlke', instance: 'wd3', site: 'Zuhlke-Careers', name: 'Z�hlke' },
    // --- DISCOVERY 2026-09-15 (web search + API verified: >=1 job in Germany) ---
    { company: 'ag', instance: 'wd3', site: 'Airbus', name: 'Airbus' },  // Added via discovery — 572 DE / 2000 total
    { company: 'kiongroup', instance: 'wd3', site: 'KIONGroup', name: 'KION Group' },  // Added via discovery — 151 DE / 969 total
    { company: 'levistraussandco', instance: 'wd5', site: 'External', name: 'Levi Strauss & Co.' },  // Added via discovery — 141 DE / 1303 total
    { company: 'abbott', instance: 'wd5', site: 'abbottcareers', name: 'Abbott' },  // Added via discovery — 107 DE / 2000 total
    { company: 'stryker', instance: 'wd1', site: 'StrykerCareers', name: 'Stryker' },  // Added via discovery — 94 DE / 1462 total
    { company: 'mango', instance: 'wd3', site: 'Mango_Work_Your_Passion', name: 'Mango' },  // Added via discovery — 85 DE / 1647 total
    { company: 'circlek', instance: 'wd3', site: 'CircleKStoreJobs', name: 'Circle K' },  // Added via discovery — 54 DE / 2000 total
    { company: 'motorolasolutions', instance: 'wd5', site: 'Careers', name: 'Motorola Solutions' },  // Added via discovery — 33 DE / 865 total
    { company: 'amgen', instance: 'wd1', site: 'Careers', name: 'Amgen' },  // Added via discovery — 21 DE / 1764 total
    { company: 'agilent', instance: 'wd5', site: 'agilent_careers', name: 'Agilent' },  // Added via discovery — 17 DE / 366 total
    { company: 'fortrea', instance: 'wd1', site: 'Fortrea', name: 'Fortrea' },  // Added via discovery — 10 DE / 360 total
    { company: 'vfc', instance: 'wd5', site: 'vfc_careers', name: 'VF Corporation' },  // Added via discovery — 9 DE / 1300 total
    { company: 'ur', instance: 'wd1', site: 'UnitedRentals-Germany', name: 'United Rentals' },  // Added via discovery — 6 DE / 6 total
    { company: 'caa', instance: 'wd1', site: 'Careers', name: 'Creative Artists Agency' },  // Added via discovery — 5 DE / 110 total
    { company: 'wework', instance: 'wd1', site: 'WeWork', name: 'WeWork' },  // Added via discovery — 5 DE / 68 total
    { company: 'argenx', instance: 'wd3', site: 'External_Careers', name: 'argenx' },  // Added via discovery — 2 DE / 89 total
    { company: 'modernatx', instance: 'wd1', site: 'M_tx', name: 'Moderna' },  // Added via discovery — 2 DE / 189 total
    { company: 'fticonsulting', instance: 'wd108', site: 'CompassLexeconCareers', name: 'Compass Lexecon (FTI)' },  // Added via discovery — 2 DE / 12 total
    { company: 'icg', instance: 'wd3', site: 'external_careers', name: 'ICG' },  // Added via discovery — 1 DE / 16 total
    { company: 'biomarpeople', instance: 'wd3', site: 'biomar', name: 'BioMar' },  // Added via discovery — 1 DE / 27 total
    // --- DISCOVERY 2026-09-15 (web search + API verified: >=1 job in Germany) ---
    { company: 'bernergroup', instance: 'wd3', site: 'Careers_Berner_Group', name: 'Berner Group' },  // Added via discovery — 144 DE / 318 total
    { company: 'freshfields', instance: 'wd3', site: 'FBD_101', name: 'Freshfields Bruckhaus Deringer' },  // Added via discovery — 62 DE / 175 total
    { company: 'galileo', instance: 'wd3', site: 'macromedia_university_career_site', name: 'Macromedia University (Galileo)' },  // Added via discovery — 21 DE / 21 total
    { company: 'aig', instance: 'wd1', site: 'aig', name: 'AIG' },  // Added via discovery — 13 DE / 498 total
    { company: 'djeholdings', instance: 'wd5', site: 'edelman-careers-E200', name: 'Edelman' },  // Added via discovery — 6 DE / 115 total
    // --- DISCOVERY 2026-09-15 (web search + API verified: >=1 job in Germany) ---
    { company: 'salesforce', instance: 'wd12', site: 'External_Career_Site', name: 'Salesforce' },  // Added via discovery — 43 DE / 1456 total
    { company: 'sec', instance: 'wd3', site: 'Samsung_Careers', name: 'Samsung' },  // Added via discovery — 9 DE / 691 total
    // --- DISCOVERY 2026-09-15 (web search + API verified: >=1 job in Germany) ---
    { company: 'fielmann', instance: 'wd3', site: 'external', name: 'Fielmann' },  // Added via discovery — 1659 DE / 1879 total
    { company: 'debeka', instance: 'wd3', site: 'karriere', name: 'debeka' },  // Added via discovery — 844 DE / 846 total
    { company: 'goldbeck', instance: 'wd103', site: 'goldbeck-jobs', name: 'Goldbeck' },  // Added via discovery — 658 DE / 791 total
    { company: 'zeissgroup', instance: 'wd3', site: 'external', name: 'Zeiss Group' },  // Added via discovery — 479 DE / 836 total
    { company: 'rhe', instance: 'wd3', site: 'R1111', name: 'Rhe (1989)' },  // Added via discovery — 382 DE / 935 total
    { company: 'sulzer', instance: 'wd502', site: 'SulzerJobs', name: 'Sulzer' },  // Added via discovery — 341 DE / 341 total
    { company: 'zeppelin', instance: 'wd3', site: 'careers', name: 'Zeppelin Group' },  // Added via discovery — 276 DE / 315 total
    { company: 'abb', instance: 'wd3', site: 'External_Career_Page', name: 'Abb' },  // Added via discovery — 207 DE / 2000 total
    { company: 'belron', instance: 'wd3', site: 'Carglass_Deutschland', name: 'Safelite' },  // Added via discovery — 198 DE / 198 total
    { company: 'freudenberg', instance: 'wd3', site: 'freudenberg-group', name: 'Freudenberg' },  // Added via discovery — 182 DE / 715 total
    { company: 'cgm', instance: 'wd3', site: 'cgm', name: 'CGM' },  // Added via discovery — 180 DE / 281 total
    { company: 'freseniusmedicalcare', instance: 'wd3', site: 'fme', name: 'Freseniusmedicalcare' },  // Added via discovery — 169 DE / 2000 total
    { company: 'hcmportal', instance: 'wd5', site: 'search', name: 'Hcmportal' },  // Added via discovery — 168 DE / 1512 total
    { company: 'michelinhr', instance: 'wd3', site: 'michelin', name: 'Michelin' },  // Added via discovery — 167 DE / 713 total
    { company: 'stark', instance: 'wd3', site: 'STARK-Germany', name: 'Karriär på Beijer' },  // Added via discovery — 163 DE / 163 total
    { company: 'kenvue', instance: 'wd5', site: 'kenvue', name: 'Kenvue' },  // Added via discovery — 153 DE / 155 total
    { company: 'evonik', instance: 'wd3', site: 'external_careers', name: 'Evonik' },  // Added via discovery — 149 DE / 352 total
    { company: 'mmc', instance: 'wd1', site: 'mmc', name: 'Mmc' },  // Added via discovery — 149 DE / 1973 total
    { company: 'carrier', instance: 'wd5', site: 'jobs', name: 'Carrier' },  // Added via discovery — 148 DE / 1053 total
    { company: 'miele', instance: 'wd3', site: 'miele-jobs', name: 'Miele' },  // Added via discovery — 144 DE / 295 total
    { company: 'hellmann', instance: 'wd103', site: 'hellmannexternaljobs', name: 'Hellmann' },  // Added via discovery — 141 DE / 333 total
    { company: 'heidelbergmaterials', instance: 'wd3', site: 'global_hm_career_site', name: 'Heidelbergmaterials' },  // Added via discovery — 133 DE / 852 total
    { company: 'jci', instance: 'wd5', site: 'jci', name: 'Jci' },  // Added via discovery — 128 DE / 2636 total
    { company: 'db', instance: 'wd3', site: 'PBWebsite', name: 'DWS' },  // Added via discovery — 125 DE / 125 total
    { company: 'magna', instance: 'wd3', site: 'magna', name: 'Magna' },  // Added via discovery — 120 DE / 1432 total
    { company: 'puma', instance: 'wd502', site: 'jobs_at_puma', name: 'PUMA' },  // Added via discovery — 113 DE / 644 total
    { company: 'trumpf', instance: 'wd3', site: 'trumpf_graduates_and_professionals', name: 'TRUMPF Graduates and Professionals' },  // Added via discovery — 103 DE / 265 total
    { company: 'santander', instance: 'wd3', site: 'santandercareers', name: 'Santander' },  // Added via discovery — 103 DE / 1003 total
    { company: 'abercrombie', instance: 'wd108', site: 'anf', name: 'Abercrombie' },  // Added via discovery — 99 DE / 2539 total
    { company: 'arcticwolf', instance: 'wd1', site: 'external', name: 'Arctic Wolf' },  // Added via discovery — 98 DE / 106 total
    { company: 'lonza', instance: 'wd3', site: 'lonza_careers', name: 'Lonza' },  // Added via discovery — 97 DE / 669 total
    { company: 'harman', instance: 'wd3', site: 'harman', name: 'harman' },  // Added via discovery — 93 DE / 549 total
    { company: 'hoganlovells', instance: 'wd3', site: 'search', name: 'Hogan Lovells' },  // Added via discovery — 89 DE / 221 total
    { company: 'outsystems', instance: 'wd503', site: 'outsystems', name: 'OutSystems' },  // Added via discovery — 88 DE / 88 total
    { company: 'thermofisher', instance: 'wd5', site: 'thermofishercareers', name: 'Thermofisher' },  // Added via discovery — 87 DE / 2883 total
    { company: 'linklaters', instance: 'wd3', site: 'linklaters', name: 'Linklaters' },  // Added via discovery — 82 DE / 196 total
    { company: 'ggwgroup', instance: 'wd103', site: 'GGWGroup', name: 'Ggwgroup' },  // Added via discovery — 77 DE / 90 total
    { company: 'misterspex', instance: 'wd103', site: 'Mister_Spex_Careers', name: 'Mister Spex' },  // Added via discovery — 77 DE / 81 total
    { company: 'kpluss', instance: 'wd3', site: 'career-kpluss', name: 'Kpluss' },  // Added via discovery — 73 DE / 84 total
    { company: 'kardex', instance: 'wd103', site: 'kardex', name: 'kardex' },  // Added via discovery — 72 DE / 118 total
    { company: 'linklaters', instance: 'wd3', site: 'DE_Linklaters', name: 'Linklaters' },  // Added via discovery — 72 DE / 73 total
    { company: 'sbdinc', instance: 'wd1', site: 'stanley_black_decker_career_site', name: 'Sbdinc' },  // Added via discovery — 70 DE / 658 total
    { company: 'techem', instance: 'wd3', site: 'techemgermanyexternalcareersitealljobs', name: 'Techem (TechemGermanyCareerApprentice)' },  // Added via discovery — 68 DE / 68 total
    { company: 'valeo', instance: 'wd3', site: 'valeo_jobs', name: 'Valeo' },  // Added via discovery — 68 DE / 1013 total
    { company: 'basicfit', instance: 'wd103', site: 'BasicFit_Career_Site_DE', name: 'Basicfit' },  // Added via discovery — 67 DE / 67 total
    { company: 'datev', instance: 'wd3', site: 'Datev_Careers', name: 'Datev (Datev Careers)' },  // Added via discovery — 67 DE / 68 total
    { company: 'hengeler', instance: 'wd502', site: 'HM-Careers-Legal', name: 'Hengeler (HM Candidate Events)' },  // Added via discovery — 65 DE / 66 total
    { company: 'synthomer', instance: 'wd3', site: 'synthomercareers', name: 'Synthomer plc' },  // Added via discovery — 64 DE / 73 total
    { company: 'essity', instance: 'wd3', site: 'job_opportunities', name: 'Essity' },  // Added via discovery — 64 DE / 324 total
    { company: 'nexperia', instance: 'wd3', site: 'careers', name: 'Nexperia' },  // Added via discovery — 61 DE / 237 total
    { company: 'dssmith', instance: 'wd3', site: 'careers', name: 'Dssmith' },  // Added via discovery — 61 DE / 227 total
    { company: 'mmc', instance: 'wd1', site: 'careers', name: 'Mmc' },  // Added via discovery — 59 DE / 689 total
    { company: 'sanofi', instance: 'wd3', site: 'sanoficareers', name: 'Sanofi' },  // Added via discovery — 57 DE / 825 total
    { company: 'juliusbaer', instance: 'wd3', site: 'external', name: 'Wealth Managers' },  // Added via discovery — 57 DE / 185 total
    { company: 'fastretailing', instance: 'wd3', site: 'store_staff_eu_uniqlo', name: 'UNIQLO' },  // Added via discovery — 56 DE / 109 total
    { company: 'myhr', instance: 'wd3', site: 'planseegroup_career', name: 'Myhr' },  // Added via discovery — 54 DE / 203 total
    { company: 'spectris', instance: 'wd3', site: 'hbk_careers', name: 'Spectris' },  // Added via discovery — 54 DE / 91 total
    { company: 'dentsuaegis', instance: 'wd3', site: 'dan_global', name: 'Dentsuaegis' },  // Added via discovery — 53 DE / 907 total
    { company: 'wk', instance: 'wd3', site: 'external', name: 'Wk' },  // Added via discovery — 53 DE / 446 total
    { company: 'woodward', instance: 'wd5', site: 'woodward', name: 'Woodward' },  // Added via discovery — 52 DE / 181 total
    { company: 'georgfischer', instance: 'wd103', site: 'GeorgFischer_Careers', name: 'Georgfischer' },  // Added via discovery — 51 DE / 342 total
    { company: 'wts', instance: 'wd3', site: 'wts', name: 'wts' },  // Added via discovery — 51 DE / 51 total
    { company: 'henryschein', instance: 'wd1', site: 'external_careers', name: 'Henryschein' },  // Added via discovery — 51 DE / 263 total
    { company: 'avnet', instance: 'wd1', site: 'external', name: 'Avnet' },  // Added via discovery — 50 DE / 272 total
    { company: 'cat', instance: 'wd5', site: 'CaterpillarCareers', name: 'Cat (CaterpillarCareers)' },  // Added via discovery — 50 DE / 906 total
    { company: 'pg', instance: 'wd5', site: '1000', name: 'P&G' },  // Added via discovery — 50 DE / 791 total
    { company: 'jj', instance: 'wd5', site: 'jj', name: 'Jj' },  // Added via discovery — 49 DE / 1738 total
    { company: 'tenbrinke', instance: 'wd3', site: 'tenbrinke', name: 'tenbrinke' },  // Added via discovery — 46 DE / 73 total
    { company: '4flow', instance: 'wd3', site: '4flow', name: '4Flow' },  // Added via discovery — 46 DE / 80 total
    { company: 'amat', instance: 'wd1', site: 'external', name: 'Applied Materials' },  // Added via discovery — 46 DE / 2000 total
    { company: 'edenpeople', instance: 'wd3', site: 'edenred_careers', name: 'edenpeople' },  // Added via discovery — 45 DE / 375 total
    { company: 'estrel', instance: 'wd103', site: 'estrel', name: 'Estrel' },  // Added via discovery — 44 DE / 44 total
    { company: 'trumpf', instance: 'wd3', site: 'TRUMPF_Apprenticeships', name: 'TRUMPF Graduates and Professionals' },  // Added via discovery — 44 DE / 57 total
    { company: 'prysmiangroup', instance: 'wd3', site: 'careers', name: 'Prysmian' },  // Added via discovery — 44 DE / 613 total
    { company: 'ayvens', instance: 'wd3', site: 'ayvenscareers', name: 'Ayvens' },  // Added via discovery — 43 DE / 268 total
    { company: 'globalhr', instance: 'wd5', site: 'rec_rtx_ext_gateway', name: 'RTX' },  // Added via discovery — 42 DE / 4731 total
    { company: 'elanco', instance: 'wd5', site: 'external_career', name: 'Elanco' },  // Added via discovery — 42 DE / 364 total
    { company: 'clarios', instance: 'wd5', site: 'clarioscareers', name: 'Clarios' },  // Added via discovery — 42 DE / 232 total
    { company: 'icon', instance: 'wd3', site: 'broadbean_external', name: 'ICON' },  // Added via discovery — 42 DE / 877 total
    { company: 'tranetechnologies', instance: 'wd12', site: 'Trane_Technologies_Careers', name: 'Trane Technologies' },  // Added via discovery — 42 DE / 1650 total
    { company: 'vossloh', instance: 'wd3', site: 'vossloh_external_careers', name: 'Vossloh' },  // Added via discovery — 40 DE / 93 total
    { company: 'swarovski', instance: 'wd3', site: 'swarovski', name: 'Swarovski' },  // Added via discovery — 40 DE / 506 total
    { company: 'lindtspruengli', instance: 'wd103', site: 'LindtSpruengliGroupCareers', name: 'lindtspruengli' },  // Added via discovery — 40 DE / 327 total
    { company: 'aveva', instance: 'wd3', site: 'rib_careers', name: 'Aveva' },  // Added via discovery — 40 DE / 71 total
    { company: 'dyson', instance: 'wd3', site: 'dyson_careers', name: 'Dyson' },  // Added via discovery — 40 DE / 427 total
    { company: 'ayvens', instance: 'wd3', site: 'SG-Ayvens', name: 'Ayvens' },  // Added via discovery — 40 DE / 253 total
    { company: 'husqvarnagroup', instance: 'wd3', site: 'external_career_site', name: 'Husqvarnagroup' },  // Added via discovery — 38 DE / 143 total
    { company: 'rohlig', instance: 'wd103', site: 'Rohlig_Careers', name: 'Rohlig' },  // Added via discovery — 37 DE / 51 total
    { company: 'rosennxt', instance: 'wd103', site: 'rosenxt', name: 'rosennxt' },  // Added via discovery — 37 DE / 47 total
    { company: 'grpr', instance: 'wd3', site: 'parques_reunidos', name: 'Grpr' },  // Added via discovery — 37 DE / 114 total
    { company: 'rollsroyce', instance: 'wd3', site: 'Intern_Graduate', name: 'Rollsroyce' },  // Added via discovery — 37 DE / 88 total
    { company: 'carharttwip', instance: 'wd103', site: 'carharttwip', name: 'Carhartt WIP' },  // Added via discovery — 36 DE / 59 total
    { company: 'cisco', instance: 'wd5', site: 'cisco_careers', name: 'Cisco' },  // Added via discovery — 36 DE / 1319 total
    { company: 'bpinternational', instance: 'wd3', site: 'bpCareers', name: 'Bpinternational (bpCareers)' },  // Added via discovery — 36 DE / 344 total
    { company: 'flaschenpost', instance: 'wd103', site: 'flaschenpost', name: 'Flaschenpost' },  // Added via discovery — 35 DE / 35 total
    { company: 'getec', instance: 'wd103', site: 'external_careers', name: 'getec' },  // Added via discovery — 35 DE / 59 total
    { company: 'ingrammicro', instance: 'wd5', site: 'ingrammicro', name: 'Ingrammicro' },  // Added via discovery — 35 DE / 506 total
    { company: 'xylem', instance: 'wd5', site: 'xylem-careers', name: 'Xylem' },  // Added via discovery — 35 DE / 548 total
    { company: 'mabanaft', instance: 'wd3', site: 'Mabanaft', name: 'Mabanaft' },  // Added via discovery — 34 DE / 35 total
    { company: 'luxexperience', instance: 'wd103', site: 'luxexperience_careers', name: 'luxexperience' },  // Added via discovery — 33 DE / 52 total
    { company: 'avisbudget', instance: 'wd1', site: 'abg_careers', name: 'Avisbudget' },  // Added via discovery — 33 DE / 614 total
    { company: 'hpe', instance: 'wd5', site: 'acjobsite', name: 'Hpe' },  // Added via discovery — 33 DE / 1302 total
    { company: 'adtran', instance: 'wd3', site: 'ADTRAN', name: 'Adtran (ADTRAN)' },  // Added via discovery — 32 DE / 90 total
    { company: 'nttlimited', instance: 'wd3', site: 'ntt_careers', name: 'Nttlimited' },  // Added via discovery — 32 DE / 844 total
    { company: 'takkt', instance: 'wd3', site: 'takkt', name: 'Takkt' },  // Added via discovery — 32 DE / 51 total
    { company: 'autodesk', instance: 'wd1', site: 'ext', name: 'Autodesk' },  // Added via discovery — 32 DE / 399 total
    { company: 'lowell', instance: 'wd3', site: 'lowellgroup_careers2', name: 'Broadbean' },  // Added via discovery — 31 DE / 39 total
    { company: 'resmed', instance: 'wd3', site: 'resmed_external_careers', name: 'Resmed' },  // Added via discovery — 30 DE / 232 total
    { company: 'syneoshealth', instance: 'wd12', site: 'syneos_health_external_site', name: 'Syneoshealth' },  // Added via discovery — 30 DE / 679 total
    { company: 'aptiv', instance: 'wd5', site: 'aptiv_careers', name: 'Aptiv' },  // Added via discovery — 29 DE / 729 total
    { company: 'gartner', instance: 'wd5', site: 'ext', name: 'Gartner' },  // Added via discovery — 29 DE / 761 total
    { company: 'fticonsulting', instance: 'wd108', site: 'FTIConsultingCareers', name: 'Fticonsulting (CompassLexeconCareers)' },  // Added via discovery — 28 DE / 221 total
    { company: 'aureliusinvest', instance: 'wd3', site: 'AURELIUS', name: 'aureliusinvest' },  // Added via discovery — 28 DE / 35 total
    { company: 'evotecgroup', instance: 'wd3', site: 'evotec_career_site', name: 'Evotec' },  // Added via discovery — 28 DE / 72 total
    { company: 'ppg', instance: 'wd5', site: 'ppg_careers', name: 'ppg' },  // Added via discovery — 28 DE / 688 total
    { company: 'meiningerhotels', instance: 'wd103', site: 'meiningerhotelscareers', name: 'MEININGER' },  // Added via discovery — 27 DE / 84 total
    { company: 'bpinternational', instance: 'wd3', site: 'bpcwcareerssite', name: 'Bpinternational (bpCareers)' },  // Added via discovery — 27 DE / 136 total
    { company: 'mitel', instance: 'wd3', site: 'mitelcareers', name: 'Mitel' },  // Added via discovery — 27 DE / 67 total
    { company: 'synnex', instance: 'wd5', site: 'tdsynnexcareers', name: 'Synnex' },  // Added via discovery — 27 DE / 752 total
    { company: 'leonardocompany', instance: 'wd3', site: 'leonardocareersite', name: 'Leonardocompany' },  // Added via discovery — 26 DE / 706 total
    { company: 'microchiphr', instance: 'wd5', site: 'external', name: 'Microchip' },  // Added via discovery — 26 DE / 496 total
    { company: 'lego', instance: 'wd103', site: 'lego_external', name: 'LEGO' },  // Added via discovery — 25 DE / 448 total
    { company: 'mksinst', instance: 'wd1', site: 'MKSCareersEMEA', name: 'Mksinst' },  // Added via discovery — 25 DE / 119 total
    { company: 'borgwarner', instance: 'wd5', site: 'borgwarner_careers', name: 'BorgWarner' },  // Added via discovery — 25 DE / 305 total
    { company: 'kiongroup', instance: 'wd3', site: 'kion_scs', name: 'Kiongroup' },  // Added via discovery — 25 DE / 370 total
    { company: 'megger', instance: 'wd3', site: 'meggercareers', name: 'megger' },  // Added via discovery — 24 DE / 51 total
    { company: 'accelleron', instance: 'wd3', site: 'accelleron', name: 'Accelleron' },  // Added via discovery — 23 DE / 110 total
    { company: 'forfarmers', instance: 'wd3', site: 'ecs', name: 'forfarmers' },  // Added via discovery — 23 DE / 66 total
    { company: 'hyperiongrp', instance: 'wd3', site: 'hyperion_external', name: 'Hyperiongrp (Broadbean External)' },  // Added via discovery — 23 DE / 330 total
    { company: 'abinbev', instance: 'wd1', site: 'eur', name: 'abinbev' },  // Added via discovery — 23 DE / 104 total
    { company: 'statestreet', instance: 'wd1', site: 'global', name: 'Statestreet' },  // Added via discovery — 23 DE / 1219 total
    { company: 'gafsgi', instance: 'wd5', site: 'bmide', name: 'Gafsgi' },  // Added via discovery — 23 DE / 23 total
    { company: 'jd', instance: 'wd103', site: 'campus_career_site', name: 'Jd' },  // Added via discovery — 22 DE / 69 total
    { company: 'paloaltonetworks', instance: 'wd5', site: 'panwexternalcareers', name: 'Paloaltonetworks' },  // Added via discovery — 22 DE / 1519 total
    { company: 'harriscomputer', instance: 'wd3', site: 'SIV', name: 'Harris' },  // Added via discovery — 22 DE / 23 total
    { company: 'db', instance: 'wd3', site: 'dwswebsite', name: 'DWS' },  // Added via discovery — 22 DE / 90 total
    { company: 'fluenceenergy', instance: 'wd12', site: 'fluenceenergy-jobs', name: 'Fluence Energy' },  // Added via discovery — 22 DE / 114 total
    { company: 'vontobel', instance: 'wd3', site: 'vontobel_external_career', name: 'Vontobel' },  // Added via discovery — 22 DE / 38 total
    { company: '3m', instance: 'wd1', site: 'search', name: '3M' },  // Added via discovery — 22 DE / 690 total
    { company: 'hpe', instance: 'wd5', site: 'jobsathpe', name: 'Hpe' },  // Added via discovery — 22 DE / 1179 total
    { company: 'onelinxens', instance: 'wd3', site: 'external_careers', name: 'Linxens' },  // Added via discovery — 21 DE / 23 total
    { company: 'elobau', instance: 'wd502', site: 'elobau', name: 'elobau' },  // Added via discovery — 21 DE / 21 total
    { company: 'bsigroup', instance: 'wd3', site: 'BSI_Careers', name: 'BSI Group' },  // Added via discovery — 21 DE / 252 total
    { company: 'stageentertainment', instance: 'wd3', site: 'stageentertainment', name: 'stageentertainment' },  // Added via discovery — 21 DE / 23 total
    { company: 'gategroup', instance: 'wd3', site: 'gategroup_external_careers', name: 'Gategroup' },  // Added via discovery — 21 DE / 225 total
    { company: 'lyreco', instance: 'wd3', site: 'lyreco_careers', name: 'Lyreco Group' },  // Added via discovery — 20 DE / 226 total
    { company: 'arianegroup', instance: 'wd3', site: 'externalall', name: 'ArianeGroup' },  // Added via discovery — 20 DE / 106 total
    { company: 'armacell', instance: 'wd3', site: 'career-armacell', name: 'armacell' },  // Added via discovery — 20 DE / 63 total
    { company: 'mdlz', instance: 'wd3', site: 'external', name: 'Mdlz' },  // Added via discovery — 20 DE / 1331 total
    { company: 'gevernova', instance: 'wd5', site: 'vernova_externalsite', name: 'Gevernova' },  // Added via discovery — 19 DE / 2119 total
    { company: 'upm', instance: 'wd103', site: 'careers', name: 'upm' },  // Added via discovery — 19 DE / 56 total
    { company: 'chtgroup', instance: 'wd3', site: 'CHT-jobs', name: 'Chtgroup' },  // Added via discovery — 19 DE / 20 total
    { company: 'springernature', instance: 'wd3', site: 'springernaturecareers', name: 'Springernature' },  // Added via discovery — 19 DE / 63 total
    { company: 'strada', instance: 'wd12', site: 'careers', name: 'Strada' },  // Added via discovery — 19 DE / 100 total
    { company: 'healthcare', instance: 'wd1', site: 'search', name: 'Healthcare' },  // Added via discovery — 19 DE / 405 total
    { company: 'bah', instance: 'wd1', site: 'bah_jobs', name: 'Bah' },  // Added via discovery — 19 DE / 2000 total
    { company: 'tapestry', instance: 'wd108', site: 'Tapestry_Careers', name: 'Tapestry' },  // Added via discovery — 18 DE / 2000 total
    { company: 'slihrms', instance: 'wd3', site: 'linxon', name: 'Linxon' },  // Added via discovery — 18 DE / 158 total
    { company: 'littelfuse', instance: 'wd1', site: 'littelfuse-careers', name: 'Littelfuse' },  // Added via discovery — 18 DE / 187 total
    { company: 'seminolehardrock', instance: 'wd503', site: 'seminolehardrockcareers', name: 'seminolehardrock' },  // Added via discovery — 18 DE / 1042 total
    { company: 'fastretailing', instance: 'wd3', site: 'headquarters_eu_uniqlo', name: 'UNIQLO' },  // Added via discovery — 17 DE / 21 total
    { company: 'alsglobal', instance: 'wd103', site: 'external', name: 'ALS' },  // Added via discovery — 17 DE / 529 total
    { company: 'beigene', instance: 'wd5', site: 'beigene', name: 'Beigene' },  // Added via discovery — 17 DE / 274 total
    { company: 'galderma', instance: 'wd3', site: 'external', name: 'Galderma' },  // Added via discovery — 17 DE / 354 total
    { company: 'velux', instance: 'wd3', site: 'velux_residential', name: 'velux' },  // Added via discovery — 17 DE / 115 total
    { company: 'catalent', instance: 'wd1', site: 'external', name: 'Catalent, Inc' },  // Added via discovery — 17 DE / 290 total
    { company: 'relx', instance: 'wd3', site: 'relx', name: 'LexisNexis® Risk Solutions' },  // Added via discovery — 17 DE / 742 total
    { company: 'myhrabc', instance: 'wd5', site: 'global', name: 'Myhrabc' },  // Added via discovery — 17 DE / 936 total
    { company: 'enovis', instance: 'wd5', site: 'enovis', name: 'enovis' },  // Added via discovery — 17 DE / 139 total
    { company: 'copeland', instance: 'wd5', site: 'copeland_external_careers_page', name: 'Copeland' },  // Added via discovery — 16 DE / 407 total
    { company: 'galileo', instance: 'wd3', site: 'galileo_career_site', name: 'Istituto Marangoni' },  // Added via discovery — 16 DE / 1493 total
    { company: 'sandvik', instance: 'wd3', site: 'sandvik-jobs', name: 'Walter' },  // Added via discovery — 16 DE / 401 total
    { company: 'nttglobaldatacenters', instance: 'wd501', site: 'external', name: 'Data centers' },  // Added via discovery — 16 DE / 227 total
    { company: 'hp', instance: 'wd5', site: 'exteu-ac-careersite', name: 'Hp' },  // Added via discovery — 16 DE / 1169 total
    { company: 'icf', instance: 'wd5', site: 'icfexternal_career_site', name: 'ICF' },  // Added via discovery — 16 DE / 384 total
    { company: 'ing', instance: 'wd3', site: 'icsgblcor', name: 'Ing' },  // Added via discovery — 15 DE / 705 total
    { company: 'alleima', instance: 'wd3', site: 'alleima-jobs', name: 'Alleima (Alleima Jobs)' },  // Added via discovery — 15 DE / 54 total
    { company: 'adient', instance: 'wd3', site: 'external', name: 'Adient' },  // Added via discovery — 15 DE / 200 total
    { company: 'axalta', instance: 'wd1', site: 'axalta', name: 'Axalta' },  // Added via discovery — 15 DE / 216 total
    { company: 'copart', instance: 'wd12', site: 'copart', name: 'Copart' },  // Added via discovery — 15 DE / 405 total
    { company: 'fugro', instance: 'wd3', site: 'careers', name: 'Fugro' },  // Added via discovery — 15 DE / 140 total
    { company: 'cc', instance: 'wd3', site: 'chanelcareers', name: 'Chanel' },  // Added via discovery — 15 DE / 1133 total
    { company: 'viatris', instance: 'wd5', site: 'external', name: 'Viatris' },  // Added via discovery — 15 DE / 364 total
    { company: 'crowdstrike', instance: 'wd5', site: 'crowdstrikecareers', name: 'CrowdStrike' },  // Added via discovery — 15 DE / 376 total
    { company: 'baxter', instance: 'wd1', site: 'baxter', name: 'Baxter' },  // Added via discovery — 15 DE / 525 total
    { company: 'accenture', instance: 'wd103', site: 'avanadecareers', name: 'Avanade' },  // Added via discovery — 14 DE / 588 total
    { company: 'nrf', instance: 'wd3', site: 'external', name: 'Nrf' },  // Added via discovery — 14 DE / 108 total
    { company: 'monolithicpower', instance: 'wd12', site: 'mps_careers', name: 'Power the World' },  // Added via discovery — 14 DE / 247 total
    { company: 'constructoruniversity', instance: 'wd103', site: 'careers', name: 'Constructor University' },  // Added via discovery — 14 DE / 14 total
    { company: 'centricsoftware', instance: 'wd501', site: 'centric', name: 'centricsoftware' },  // Added via discovery — 14 DE / 83 total
    { company: 'allegion', instance: 'wd5', site: 'careers', name: 'Allegion' },  // Added via discovery — 14 DE / 337 total
    { company: 'planet', instance: 'wd3', site: 'planet', name: 'Company Background Planet' },  // Added via discovery — 14 DE / 72 total
    { company: 'logicalis', instance: 'wd3', site: 'logicaliscareers', name: 'logicalis' },  // Added via discovery — 14 DE / 97 total
    { company: 'aareon', instance: 'wd103', site: 'Aareon', name: 'Aareon' },  // Added via discovery — 13 DE / 29 total
    { company: 'embl', instance: 'wd103', site: 'EMBL', name: 'Embl' },  // Added via discovery — 13 DE / 27 total
    { company: 'sumitomoheavyindustries', instance: 'wd103', site: 'external', name: 'Sumitomoheavyindustries' },  // Added via discovery — 13 DE / 20 total
    { company: 'esridech', instance: 'wd103', site: 'ESRI', name: 'esridech' },  // Added via discovery — 13 DE / 14 total
    { company: 'fronius', instance: 'wd3', site: 'job_board', name: 'JOB BOARD' },  // Added via discovery — 13 DE / 123 total
    { company: 'nilfisk', instance: 'wd3', site: 'nilfisk', name: 'Nilfisk' },  // Added via discovery — 13 DE / 103 total
    { company: 'brambles', instance: 'wd5', site: 'brambles_careers', name: 'CHEP Brambles' },  // Added via discovery — 13 DE / 170 total
    { company: 'regalrexnord', instance: 'wd1', site: 'careers', name: 'Regal Rexnord' },  // Added via discovery — 13 DE / 497 total
    { company: 'zoll', instance: 'wd5', site: 'zollmedicalcorp', name: 'ZOLL Medical Corporation' },  // Added via discovery — 13 DE / 233 total
    { company: 'davidlloyd', instance: 'wd3', site: '101', name: 'davidlloyd' },  // Added via discovery — 13 DE / 209 total
    { company: 'pfizer', instance: 'wd1', site: 'pfizercareers', name: 'Pfizer' },  // Added via discovery — 13 DE / 567 total
    { company: 'visa', instance: 'wd5', site: 'visa', name: 'Visa' },  // Added via discovery — 13 DE / 750 total
    { company: 'chubbfiresecurity', instance: 'wd3', site: 'chubbfs', name: 'Chubbfiresecurity' },  // Added via discovery — 12 DE / 263 total
    { company: 'magellanhealth', instance: 'wd5', site: 'magellan_health_careers', name: 'Magellanhealth' },  // Added via discovery — 12 DE / 402 total
    { company: 'fil', instance: 'wd3', site: '001', name: 'Fil' },  // Added via discovery — 12 DE / 100 total
    { company: 'takeaway', instance: 'wd3', site: 'jet-ecs-r', name: 'takeaway' },  // Added via discovery — 12 DE / 108 total
    { company: 'ironmountain', instance: 'wd5', site: 'iron-mountain-jobs', name: 'Iron Mountain' },  // Added via discovery — 12 DE / 362 total
    { company: 'parexel', instance: 'wd1', site: 'parexel_external_careers', name: 'Parexel' },  // Added via discovery — 12 DE / 353 total
    { company: 'columbiasportswearcompany', instance: 'wd5', site: 'csc_careers', name: 'Csc' },  // Added via discovery — 12 DE / 196 total
    { company: 'agcbio', instance: 'wd5', site: 'agcbio_careers', name: 'AGC Biologics' },  // Added via discovery — 12 DE / 25 total
    { company: 'vantagedc', instance: 'wd1', site: 'vantage', name: 'Vantagedc' },  // Added via discovery — 12 DE / 171 total
    { company: 'flextronics', instance: 'wd1', site: 'careers', name: 'Flextronics' },  // Added via discovery — 12 DE / 1604 total
    { company: 'travelhrportal', instance: 'wd1', site: 'jobs', name: 'Travelhrportal' },  // Added via discovery — 11 DE / 179 total
    { company: 'cae', instance: 'wd3', site: 'career', name: 'Cae' },  // Added via discovery — 11 DE / 343 total
    { company: 'erm', instance: 'wd3', site: 'erm_careers', name: 'Erm' },  // Added via discovery — 11 DE / 538 total
    { company: 'asml', instance: 'wd3', site: 'asmlext1', name: 'asml' },  // Added via discovery — 11 DE / 583 total
    { company: 'maersk', instance: 'wd3', site: 'apmt_careers', name: 'A.P. Moller - Maersk' },  // Added via discovery — 11 DE / 134 total
    { company: 'deckers', instance: 'wd5', site: 'deckers', name: 'Deckers' },  // Added via discovery — 11 DE / 419 total
    { company: 'nordsonhcm', instance: 'wd501', site: 'nordsoncareers', name: 'Nordson' },  // Added via discovery — 11 DE / 271 total
    { company: 'vanderlande', instance: 'wd3', site: 'careers', name: 'Vanderlande' },  // Added via discovery — 11 DE / 168 total
    { company: 'adobe', instance: 'wd5', site: 'external_experienced', name: 'Adobe' },  // Added via discovery — 11 DE / 735 total
    { company: 'ingredion', instance: 'wd1', site: 'ingredioncareers', name: 'Ingredion' },  // Added via discovery — 11 DE / 219 total
    { company: 'endurance', instance: 'wd103', site: 'sompointernational', name: 'endurance' },  // Added via discovery — 11 DE / 114 total
    { company: 'juliusbaer', instance: 'wd3', site: 'wealth_managers', name: 'Wealth Managers' },  // Added via discovery — 11 DE / 45 total
    { company: 'johnsonelectric', instance: 'wd3', site: 'career_je', name: 'johnsonelectric' },  // Added via discovery — 11 DE / 266 total
    { company: 'hp', instance: 'wd5', site: 'externalcareersite', name: 'Hp' },  // Added via discovery — 11 DE / 835 total
    { company: 'mesalvo', instance: 'wd103', site: 'Mesalvo', name: 'Mesalvo' },  // Added via discovery — 10 DE / 10 total
    { company: 'astemo', instance: 'wd102', site: 'global_career_site', name: 'Astemo' },  // Added via discovery — 10 DE / 321 total
    { company: 'ardian', instance: 'wd103', site: 'ardiancareers', name: 'Ardian' },  // Added via discovery — 10 DE / 74 total
    { company: 'erm', instance: 'wd3', site: 'erm_experiencedprofessionals', name: 'Erm' },  // Added via discovery — 10 DE / 266 total
    { company: 'fiserv', instance: 'wd5', site: 'ext', name: 'There\'s a reason why Fiserv' },  // Added via discovery — 10 DE / 376 total
    { company: 'cohesity', instance: 'wd5', site: 'cohesity_careers', name: 'Cohesity' },  // Added via discovery — 10 DE / 174 total
    { company: 'revvity', instance: 'wd103', site: 'external', name: 'Revvity' },  // Added via discovery — 10 DE / 130 total
    { company: 'imerys', instance: 'wd3', site: 'imerys-careers', name: 'Imerys' },  // Added via discovery — 10 DE / 111 total
    { company: 'takraf', instance: 'wd103', site: 'takraf_external_careers', name: 'TAKRAF Group' },  // Added via discovery — 10 DE / 37 total
    { company: 'yougov', instance: 'wd103', site: 'yougov_external_careers', name: 'Yougov' },  // Added via discovery — 10 DE / 32 total
    { company: 'mercedesbenztechinnovation', instance: 'wd3', site: 'mbti_jobportal', name: 'mercedesbenztechinnovation' },  // Added via discovery — 10 DE / 10 total
    { company: 'regeneron', instance: 'wd1', site: 'careers', name: 'Regeneron' },  // Added via discovery — 10 DE / 549 total
    { company: 'sailpoint', instance: 'wd1', site: 'sailpoint', name: 'SailPoint' },  // Added via discovery — 10 DE / 116 total
    { company: 'sandvik', instance: 'wd3', site: 'coromant-jobs', name: 'Walter' },  // Added via discovery — 10 DE / 49 total
    { company: 'jabil', instance: 'wd5', site: 'jabil_careers', name: 'Jabil' },  // Added via discovery — 10 DE / 2000 total
    { company: 'astrazeneca', instance: 'wd3', site: 'Alexion', name: 'AstraZeneca' },  // Added via discovery — 9 DE / 108 total
    { company: 'allegion', instance: 'wd5', site: 'careers_SimonsVoss_English', name: 'Allegion' },  // Added via discovery — 9 DE / 9 total
    { company: 'nkg', instance: 'wd103', site: 'nkg', name: 'nkg' },  // Added via discovery — 9 DE / 38 total
    { company: 'globusmedical', instance: 'wd5', site: 'gmed_careers', name: 'Globus Medical' },  // Added via discovery — 9 DE / 317 total
    { company: 'greif', instance: 'wd5', site: 'greif', name: 'Greif' },  // Added via discovery — 9 DE / 278 total
    { company: 'hbfuller', instance: 'wd1', site: 'careers', name: 'hbfuller' },  // Added via discovery — 9 DE / 159 total
    { company: 'smithnephew', instance: 'wd5', site: 'external', name: 'Smith+Nephew' },  // Added via discovery — 9 DE / 328 total
    { company: 'nutreco', instance: 'wd3', site: 'nutreco_external', name: 'Nutreco' },  // Added via discovery — 9 DE / 190 total
    { company: 'zentiva', instance: 'wd3', site: 'zentiva', name: 'zentiva' },  // Added via discovery — 9 DE / 107 total
    { company: 'mastercard', instance: 'wd1', site: 'corporatecareers', name: 'Mastercard' },  // Added via discovery — 9 DE / 1056 total
    { company: 'agilent', instance: 'wd5', site: 'agilent_student_careers', name: 'Agilent' },  // Added via discovery — 8 DE / 37 total
    { company: 'merit', instance: 'wd503', site: 'Merit', name: 'Merit' },  // Added via discovery — 8 DE / 123 total
    { company: 'bridgestone', instance: 'wd5', site: 'wf_external_careers', name: 'Bridgestone' },  // Added via discovery — 8 DE / 22 total
    { company: 'bacardi', instance: 'wd3', site: 'jobs_bacardi', name: 'Bacardi' },  // Added via discovery — 8 DE / 138 total
    { company: 'envista', instance: 'wd1', site: 'envistacareers', name: 'Envista' },  // Added via discovery — 8 DE / 271 total
    { company: 'maersk', instance: 'wd3', site: 'maersk_manual', name: 'A.P. Moller - Maersk' },  // Added via discovery — 8 DE / 885 total
    { company: 'genpact', instance: 'wd108', site: 'External_Careers', name: 'Genpact' },  // Added via discovery — 8 DE / 2000 total
    { company: 'urw', instance: 'wd3', site: 'urw_career_site', name: 'Urw' },  // Added via discovery — 8 DE / 62 total
    { company: 'jda', instance: 'wd5', site: 'jda_careers', name: 'Jda' },  // Added via discovery — 8 DE / 141 total
    { company: 'roche', instance: 'wd3', site: 'roche-ext', name: 'Roche' },  // Added via discovery — 8 DE / 1259 total
    { company: 'peopleservices', instance: 'wd3', site: 'external', name: 'Peopleservices' },  // Added via discovery — 8 DE / 48 total
    { company: 'msamlin', instance: 'wd3', site: 'msigeuropecareers', name: 'MS Amlin' },  // Added via discovery — 8 DE / 25 total
    { company: 'packsize', instance: 'wd108', site: 'packsize_careers', name: 'packsize' },  // Added via discovery — 8 DE / 52 total
    { company: 'itw', instance: 'wd5', site: 'external', name: 'itw' },  // Added via discovery — 8 DE / 782 total
    { company: 'magnitudesoftware', instance: 'wd1', site: 'external', name: 'magnitudesoftware' },  // Added via discovery — 8 DE / 90 total
    { company: 'hiscox', instance: 'wd3', site: 'hiscox_external_site', name: 'Hiscox' },  // Added via discovery — 8 DE / 81 total
    { company: 'solera', instance: 'wd5', site: 'global_career_site', name: 'Solera' },  // Added via discovery — 8 DE / 186 total
    { company: 'veralto', instance: 'wd1', site: 'videojetjobs', name: 'Veralto' },  // Added via discovery — 8 DE / 104 total
    { company: 'hexcel', instance: 'wd5', site: 'HexcelCareers', name: 'Hexcel (EarlyHexcelCareers)' },  // Added via discovery — 7 DE / 180 total
    { company: 'hengeler', instance: 'wd502', site: 'HM-Candidate_Events', name: 'Hengeler (HM Candidate Events)' },  // Added via discovery — 7 DE / 8 total
    { company: 'celltrionhealthcare', instance: 'wd3', site: 'celltrionglobal', name: 'Celltrion Global Website Celltrion Group' },  // Added via discovery — 7 DE / 48 total
    { company: 'alfalaval', instance: 'wd3', site: 'alfa_laval_jobs', name: 'Alfalaval' },  // Added via discovery — 7 DE / 362 total
    { company: 'edwards', instance: 'wd5', site: 'edwardscareers', name: 'Edwards Lifesciences' },  // Added via discovery — 7 DE / 399 total
    { company: 'bristolmyerssquibb', instance: 'wd5', site: 'bms', name: 'Bristolmyerssquibb' },  // Added via discovery — 7 DE / 609 total
    { company: 'alirahealth', instance: 'wd3', site: 'alirahealth', name: 'alirahealth' },  // Added via discovery — 7 DE / 30 total
    { company: 'gdit', instance: 'wd5', site: 'external_career_site', name: 'Gdit' },  // Added via discovery — 7 DE / 1195 total
    { company: 'aquilacapital', instance: 'wd3', site: 'aquilacapital', name: 'aquilacapital' },  // Added via discovery — 7 DE / 9 total
    { company: 'cree', instance: 'wd108', site: 'ext', name: 'Ext' },  // Added via discovery — 7 DE / 148 total
    { company: 'cloudimperiumgames', instance: 'wd503', site: 'cig_global_careers', name: 'Cloud Imperium Games' },  // Added via discovery — 7 DE / 59 total
    { company: 'warnerbros', instance: 'wd5', site: 'global', name: 'Warner Bros. Discovery' },  // Added via discovery — 7 DE / 324 total
    { company: 'pierrefabre', instance: 'wd3', site: 'external_career_site', name: 'Pierre Fabre Laboratories' },  // Added via discovery — 7 DE / 239 total
    { company: 'topcon', instance: 'wd1', site: 'topconpositioningcareers', name: 'topcon' },  // Added via discovery — 7 DE / 49 total
    { company: 'canadiansolar', instance: 'wd5', site: 'canadiansolar', name: 'canadiansolar' },  // Added via discovery — 7 DE / 158 total
    { company: 'columbiasportswearcompany', instance: 'wd5', site: 'retail', name: 'Csc' },  // Added via discovery — 7 DE / 91 total
    { company: 'hengeler', instance: 'wd502', site: 'HM-Careers-Business-Services', name: 'Hengeler (HM Candidate Events)' },  // Added via discovery — 6 DE / 6 total
    { company: 'adtran', instance: 'wd3', site: 'ANS', name: 'Adtran (ADTRAN)' },  // Added via discovery — 6 DE / 6 total
    { company: 'ferring', instance: 'wd3', site: 'ferring', name: 'Ferring' },  // Added via discovery — 6 DE / 65 total
    { company: 'boseallaboutme', instance: 'wd503', site: 'bose_careers', name: 'Boseallaboutme' },  // Added via discovery — 6 DE / 74 total
    { company: 'ipsen', instance: 'wd103', site: 'ipsen_careers', name: 'Ipsen' },  // Added via discovery — 6 DE / 259 total
    { company: 'hl', instance: 'wd1', site: 'lateral', name: 'Lateral' },  // Added via discovery — 6 DE / 96 total
    { company: 'valmet', instance: 'wd103', site: 'external', name: 'Valmet' },  // Added via discovery — 6 DE / 167 total
    { company: 'roquette', instance: 'wd3', site: 'external', name: 'Roquette' },  // Added via discovery — 6 DE / 86 total
    { company: 'suse', instance: 'wd3', site: 'jobsatsuse', name: 'Suse' },  // Added via discovery — 6 DE / 30 total
    { company: 'zalando', instance: 'wd3', site: 'zalandositewd', name: 'Zalando' },  // Added via discovery — 6 DE / 163 total
    { company: 'specialized', instance: 'wd5', site: 'specialized_external_career_site', name: 'Specialized' },  // Added via discovery — 6 DE / 125 total
    { company: 'zrg', instance: 'wd3', site: 'jobs', name: 'zrg' },  // Added via discovery — 6 DE / 6 total
    { company: 'workiva', instance: 'wd503', site: 'careers', name: 'Workiva' },  // Added via discovery — 6 DE / 111 total
    { company: 'wattswater', instance: 'wd5', site: 'external', name: 'Wattswater' },  // Added via discovery — 6 DE / 227 total
    { company: 'iff', instance: 'wd5', site: 'iff_careers', name: 'IFF' },  // Added via discovery — 6 DE / 398 total
    { company: 'darktrace', instance: 'wd3', site: 'darktaceexternal', name: 'darktrace' },  // Added via discovery — 6 DE / 77 total
    { company: 'alkegen', instance: 'wd5', site: 'alkegen', name: 'Alkegen' },  // Added via discovery — 5 DE / 106 total
    { company: 'biotechne', instance: 'wd5', site: 'biotechne', name: 'Biotechne' },  // Added via discovery — 5 DE / 104 total
    { company: 'canadagoose', instance: 'wd3', site: 'canadagoosecareers', name: 'Canada Goose' },  // Added via discovery — 5 DE / 97 total
    { company: 'biibhr', instance: 'wd3', site: 'external', name: 'Biibhr' },  // Added via discovery — 5 DE / 231 total
    { company: 'digitalturbine', instance: 'wd501', site: 'digital_turbine_external_careers', name: 'Digital Turbine' },  // Added via discovery — 5 DE / 39 total
    { company: 'diptyqueparis', instance: 'wd103', site: 'diptyquecareers', name: 'Diptyque' },  // Added via discovery — 5 DE / 170 total
    { company: 'gsknch', instance: 'wd3', site: 'GSKCareers', name: 'Gsknch' },  // Added via discovery — 5 DE / 323 total
    { company: 'pluxee', instance: 'wd3', site: 'pluxee_career_site', name: 'Pluxee' },  // Added via discovery — 5 DE / 181 total
    { company: 'relx', instance: 'wd3', site: 'ElsevierJobs', name: 'LexisNexis® Risk Solutions' },  // Added via discovery — 5 DE / 157 total
    { company: 'tencent', instance: 'wd1', site: 'tencent_careers', name: 'Timi Montreal' },  // Added via discovery — 5 DE / 308 total
    { company: 'logitech', instance: 'wd5', site: 'logitech', name: 'Logitech' },  // Added via discovery — 5 DE / 208 total
    { company: 'prologis', instance: 'wd5', site: 'prologis_external_careers', name: 'Prologis' },  // Added via discovery — 5 DE / 74 total
    { company: 'sandvik', instance: 'wd3', site: 'seco-jobs', name: 'Walter' },  // Added via discovery — 5 DE / 29 total
    { company: 'exfo', instance: 'wd10', site: 'EXFO_Careers', name: 'EXFO' },  // Added via discovery — 5 DE / 60 total
    { company: 'tateandlyle', instance: 'wd3', site: 'tlcareers', name: 'Tl' },  // Added via discovery — 5 DE / 90 total
    { company: 'teamwass', instance: 'wd5', site: 'wassermancareers', name: 'Teamwass' },  // Added via discovery — 5 DE / 108 total
    { company: 'pernodricard', instance: 'wd3', site: 'pernod-ricard', name: 'Pernod Ricard' },  // Added via discovery — 5 DE / 276 total
    { company: 'ms', instance: 'wd5', site: 'external', name: 'Ms' },  // Added via discovery — 5 DE / 1289 total
    { company: 'thinkbrg', instance: 'wd5', site: 'brg_external_career_site', name: 'Thinkbrg' },  // Added via discovery — 5 DE / 141 total
    { company: 'maxon', instance: 'wd103', site: 'maxo', name: 'maxon' },  // Added via discovery — 5 DE / 5 total
    { company: 'exos', instance: 'wd501', site: 'exoscareers', name: 'exos' },  // Added via discovery — 5 DE / 223 total
    { company: 'corteva', instance: 'wd5', site: 'corteva', name: 'corteva' },  // Added via discovery — 5 DE / 117 total
    { company: 'tempurpedic', instance: 'wd108', site: 'tempur-sealy-careers', name: 'tempurpedic' },  // Added via discovery — 5 DE / 216 total
    { company: 'spectris', instance: 'wd3', site: 'malvern_panalytical_careers', name: 'Spectris' },  // Added via discovery — 5 DE / 56 total
    { company: 'northlandpower', instance: 'wd3', site: 'externalcs', name: 'northlandpower' },  // Added via discovery — 5 DE / 21 total
    { company: 'astara', instance: 'wd3', site: 'Career_Site_Astara_External', name: 'Astara' },  // Added via discovery — 4 DE / 60 total
    { company: 'nrf', instance: 'wd3', site: 'Graduates', name: 'Nrf' },  // Added via discovery — 4 DE / 17 total
    { company: 'aggreko', instance: 'wd3', site: 'Aggreko_Careers_1', name: 'Aggreko' },  // Added via discovery — 4 DE / 227 total
    { company: 'acushnetgolf', instance: 'wd12', site: 'acu', name: 'Acushnetgolf' },  // Added via discovery — 4 DE / 66 total
    { company: 'aliaxis', instance: 'wd3', site: 'aliaxis_emea', name: 'IPEX' },  // Added via discovery — 4 DE / 56 total
    { company: 'aliaxis', instance: 'wd3', site: 'aliaxis', name: 'IPEX' },  // Added via discovery — 4 DE / 266 total
    { company: 'albemarle', instance: 'wd5', site: 'external', name: 'Albemarle' },  // Added via discovery — 4 DE / 62 total
    { company: 'disney', instance: 'wd5', site: 'disneycareerdc', name: 'Disney' },  // Added via discovery — 4 DE / 666 total
    { company: 'clydeco', instance: 'wd103', site: 'clydecocareers', name: 'Clydeco' },  // Added via discovery — 4 DE / 179 total
    { company: 'aveva', instance: 'wd3', site: 'aveva_careers', name: 'Aveva' },  // Added via discovery — 4 DE / 252 total
    { company: 'chevron', instance: 'wd5', site: 'jobs', name: 'Chevron Corporation' },  // Added via discovery — 4 DE / 107 total
    { company: 'gehc', instance: 'wd5', site: 'gehc_externalsite', name: 'Gehc' },  // Added via discovery — 4 DE / 986 total
    { company: 'ameriprise', instance: 'wd5', site: 'ameriprise', name: 'Ameriprise' },  // Added via discovery — 4 DE / 258 total
    { company: 'aspentech', instance: 'wd5', site: 'aspentech', name: 'AspenTech' },  // Added via discovery — 4 DE / 139 total
    { company: 'airproducts', instance: 'wd5', site: 'ap0001', name: 'Air Products' },  // Added via discovery — 4 DE / 396 total
    { company: 'disney', instance: 'wd5', site: 'disneycareer', name: 'Disney' },  // Added via discovery — 4 DE / 643 total
    { company: 'relx', instance: 'wd3', site: 'LexisNexisLegal', name: 'LexisNexis® Risk Solutions' },  // Added via discovery — 4 DE / 283 total
    { company: 'intrum', instance: 'wd3', site: 'external', name: 'Intrum' },  // Added via discovery — 4 DE / 60 total
    { company: 'hmhw', instance: 'wd12', site: 'hmh_careers', name: 'HMH' },  // Added via discovery — 4 DE / 62 total
    { company: 'ciena', instance: 'wd5', site: 'careers', name: 'Ciena' },  // Added via discovery — 4 DE / 137 total
    { company: 'wmg', instance: 'wd1', site: 'WMGGERMANY', name: 'Wmg' },  // Added via discovery — 4 DE / 4 total
    { company: 'ilb', instance: 'wd103', site: 'ilb_karriere', name: 'ilb' },  // Added via discovery — 4 DE / 4 total
    { company: 'lhoist', instance: 'wd3', site: 'careers', name: 'Lhoist Group' },  // Added via discovery — 4 DE / 94 total
    { company: 'luminegrp', instance: 'wd3', site: 'vidispine', name: 'Luminegrp' },  // Added via discovery — 4 DE / 8 total
    { company: 'trellix', instance: 'wd1', site: 'enterprisecareers', name: 'Trellix' },  // Added via discovery — 4 DE / 56 total
    { company: 'galileo', instance: 'wd3', site: 'akad_career_site', name: 'Istituto Marangoni' },  // Added via discovery — 4 DE / 4 total
    { company: 'repligen', instance: 'wd108', site: 'repligen_careers', name: 'repligen' },  // Added via discovery — 4 DE / 76 total
    { company: 'pru', instance: 'wd5', site: 'pgim_careers', name: 'PGIM' },  // Added via discovery — 4 DE / 95 total
    { company: 'lighting', instance: 'wd3', site: 'jobs-and-careers', name: 'Lighting' },  // Added via discovery — 4 DE / 219 total
    { company: 'relx', instance: 'wd3', site: 'risksolutions', name: 'LexisNexis® Risk Solutions' },  // Added via discovery — 4 DE / 173 total
    { company: 'allegion', instance: 'wd5', site: 'careers_normbau_germany', name: 'Allegion' },  // Added via discovery — 4 DE / 4 total
    { company: 'pru', instance: 'wd5', site: 'careers', name: 'PGIM' },  // Added via discovery — 4 DE / 181 total
    { company: 'wellington', instance: 'wd5', site: 'external', name: 'Wellington' },  // Added via discovery — 4 DE / 132 total
    { company: 'spscommerce', instance: 'wd108', site: 'sps', name: 'spscommerce' },  // Added via discovery — 4 DE / 33 total
    { company: 'xpel', instance: 'wd5', site: 'xpel_careers', name: 'xpel' },  // Added via discovery — 4 DE / 96 total
    { company: 'covestro', instance: 'wd3', site: 'cov_de_apprentice_external', name: 'Covestro' },  // Added via discovery — 4 DE / 4 total
    { company: 'tel', instance: 'wd3', site: 'tee_careers', name: 'TEL' },  // Added via discovery — 4 DE / 9 total
    { company: 'chemours', instance: 'wd103', site: 'chemours', name: 'Every day Chemours' },  // Added via discovery — 3 DE / 141 total
    { company: 'storaenso', instance: 'wd502', site: 'Stora_Enso_site_opportunities', name: 'Storaenso' },  // Added via discovery — 3 DE / 84 total
    { company: 'talentmanagementsolution', instance: 'wd3', site: 'JonasSoftwareUK', name: 'Jonas' },  // Added via discovery — 3 DE / 18 total
    { company: 'corpay', instance: 'wd103', site: 'ext_001', name: 'Corpay' },  // Added via discovery — 3 DE / 105 total
    { company: 'cerence', instance: 'wd5', site: 'Cerence', name: 'Cerence' },  // Added via discovery — 3 DE / 33 total
    { company: 'axis', instance: 'wd3', site: 'external_career_site', name: 'Axis' },  // Added via discovery — 3 DE / 99 total
    { company: 'azenta', instance: 'wd1', site: 'azentajobs', name: 'Azenta' },  // Added via discovery — 3 DE / 65 total
    { company: 'bydeluxe', instance: 'wd5', site: 'deluxe_external', name: 'Deluxe' },  // Added via discovery — 3 DE / 41 total
    { company: 'bbva', instance: 'wd3', site: 'bbva', name: 'Bbva' },  // Added via discovery — 3 DE / 617 total
    { company: 'rhe', instance: 'wd3', site: '1989', name: 'Rhe (1989)' },  // Added via discovery — 3 DE / 30 total
    { company: 'chrobinson', instance: 'wd5', site: 'chrobinson', name: 'Chrobinson' },  // Added via discovery — 3 DE / 107 total
    { company: 'diageo', instance: 'wd3', site: 'diageo_careers', name: 'Diageo' },  // Added via discovery — 3 DE / 256 total
    { company: 'elekta', instance: 'wd3', site: 'elekta_careers', name: 'Elekta' },  // Added via discovery — 3 DE / 96 total
    { company: 'cloudera', instance: 'wd5', site: 'external_career', name: 'Cloudera' },  // Added via discovery — 3 DE / 69 total
    { company: 'gadventures', instance: 'wd3', site: 'gadventures', name: 'Gadventures' },  // Added via discovery — 3 DE / 56 total
    { company: 'multitude', instance: 'wd103', site: 'careers_multitude', name: 'Multitude' },  // Added via discovery — 3 DE / 37 total
    { company: 'ffive', instance: 'wd5', site: 'f5jobs', name: 'Ffive' },  // Added via discovery — 3 DE / 209 total
    { company: 'guidewire', instance: 'wd5', site: 'external', name: 'Guidewire' },  // Added via discovery — 3 DE / 125 total
    { company: 'rothschildandco', instance: 'wd3', site: 'rothschildandco_lateral', name: 'Rothschildandco' },  // Added via discovery — 3 DE / 110 total
    { company: 'kbi', instance: 'wd5', site: 'kontoor', name: 'Kontoor Brands, Inc. Kontoor Brands' },  // Added via discovery — 3 DE / 141 total
    { company: 'kcura', instance: 'wd1', site: 'external_career_site', name: 'Kcura' },  // Added via discovery — 3 DE / 76 total
    { company: 'markelcorp', instance: 'wd5', site: 'globalcareers', name: 'Markelcorp' },  // Added via discovery — 3 DE / 143 total
    { company: 'lseg', instance: 'wd3', site: 'careers', name: 'Lseg' },  // Added via discovery — 3 DE / 724 total
    { company: 'sensata', instance: 'wd1', site: 'sensata-careers', name: 'Sensata' },  // Added via discovery — 3 DE / 55 total
    { company: 'tritonpartners', instance: 'wd3', site: 'external', name: 'Tritonpartners' },  // Added via discovery — 3 DE / 7 total
    { company: 'starrcompanies', instance: 'wd1', site: 'careers', name: 'Starr' },  // Added via discovery — 3 DE / 162 total
    { company: 'agrana', instance: 'wd3', site: 'careers', name: 'AGRANA' },  // Added via discovery — 3 DE / 66 total
    { company: 'exclusivenetworks', instance: 'wd103', site: 'exclusive-networks-career', name: 'exclusivenetworks' },  // Added via discovery — 3 DE / 134 total
    { company: 'omya', instance: 'wd3', site: 'Omya', name: 'Omya' },  // Added via discovery — 3 DE / 100 total
    { company: 'materion', instance: 'wd5', site: 'materion', name: 'Materion' },  // Added via discovery — 3 DE / 118 total
    { company: 'canadiansolar', instance: 'wd5', site: 'estorage', name: 'canadiansolar' },  // Added via discovery — 3 DE / 82 total
    { company: 'vfc', instance: 'wd5', site: 'timberland_careers', name: 'Vfc' },  // Added via discovery — 3 DE / 103 total
    { company: 'wellington', instance: 'wd5', site: 'efc', name: 'Wellington' },  // Added via discovery — 3 DE / 122 total
    { company: 'cabotcorp', instance: 'wd12', site: 'careers', name: 'cabotcorp' },  // Added via discovery — 3 DE / 92 total
    { company: 'beautyhealth', instance: 'wd12', site: 'BeautyHealthCareer', name: 'Beauty Health' },  // Added via discovery — 3 DE / 36 total
    { company: 'rabobank', instance: 'wd3', site: 'jobs', name: 'Rabobank' },  // Added via discovery — 3 DE / 218 total
    { company: 'uniphar', instance: 'wd3', site: 'uniphar_external_careers', name: 'uniphar' },  // Added via discovery — 3 DE / 137 total
    { company: 'galileo', instance: 'wd3', site: 'macromedia_akademie_career_site', name: 'Istituto Marangoni' },  // Added via discovery — 3 DE / 3 total
    { company: 'namsa', instance: 'wd5', site: 'namsa', name: 'namsa' },  // Added via discovery — 3 DE / 65 total
    { company: 'barcelo', instance: 'wd3', site: 'Barcelo_Careers', name: 'barcelo' },  // Added via discovery — 3 DE / 517 total
    { company: 'vfc', instance: 'wd5', site: 'kipling_careers', name: 'Vfc' },  // Added via discovery — 3 DE / 68 total
    { company: 'allegion', instance: 'wd5', site: 'Careers_Normbau', name: 'Allegion' },  // Added via discovery — 2 DE / 2 total
    { company: 'politico', instance: 'wd108', site: 'POLITICOEU', name: 'Politico (POLITICO)' },  // Added via discovery — 2 DE / 19 total
    { company: 'soterahealth', instance: 'wd501', site: 'External', name: 'Soterahealth' },  // Added via discovery — 2 DE / 126 total
    { company: 'livenation', instance: 'wd503', site: 'tmexternalsite', name: 'Livenation' },  // Added via discovery — 2 DE / 50 total
    { company: 'cochlear', instance: 'wd3', site: 'cochlear_careers', name: 'Cochlear' },  // Added via discovery — 2 DE / 93 total
    { company: 'aveva', instance: 'wd3', site: 'ETAP_Careers', name: 'Aveva' },  // Added via discovery — 2 DE / 64 total
    { company: 'fmc', instance: 'wd12', site: 'fmc', name: 'FMC Corporation' },  // Added via discovery — 2 DE / 76 total
    { company: 'amplity', instance: 'wd1', site: 'amplityhealth', name: 'Amplity' },  // Added via discovery — 2 DE / 54 total
    { company: 'renishaw', instance: 'wd3', site: 'Renishaw', name: 'Renishaw' },  // Added via discovery — 2 DE / 82 total
    { company: 'goto', instance: 'wd5', site: 'gotocareers', name: 'GoTo' },  // Added via discovery — 2 DE / 13 total
    { company: 'helenoftroy', instance: 'wd503', site: 'main_hot', name: 'Helenoftroy' },  // Added via discovery — 2 DE / 59 total
    { company: 'electrolux', instance: 'wd3', site: 'electroluxcareersite', name: 'Electrolux Group' },  // Added via discovery — 2 DE / 247 total
    { company: 'msd', instance: 'wd5', site: 'searchjobs', name: 'Msd' },  // Added via discovery — 2 DE / 1164 total
    { company: 'munters', instance: 'wd3', site: 'external_careers', name: 'Munters' },  // Added via discovery — 2 DE / 129 total
    { company: 'safeguardglobal', instance: 'wd3', site: 'external_careers', name: 'Safeguardglobal' },  // Added via discovery — 2 DE / 25 total
    { company: 'jotun', instance: 'wd3', site: 'jotun_careers', name: 'Jotun' },  // Added via discovery — 2 DE / 35 total
    { company: 'heidrick', instance: 'wd1', site: 'heidrickandstruggles', name: 'Heidrick & Struggles' },  // Added via discovery — 2 DE / 38 total
    { company: 'livenation', instance: 'wd503', site: 'lnexternalsite', name: 'Livenation' },  // Added via discovery — 2 DE / 1438 total
    { company: 'pluralsight', instance: 'wd1', site: 'careers', name: 'Pluralsight' },  // Added via discovery — 2 DE / 16 total
    { company: 'vfc', instance: 'wd5', site: 'vans_careers', name: 'Vfc' },  // Added via discovery — 2 DE / 602 total
    { company: 'beyondmeat', instance: 'wd1', site: 'external_careers', name: 'Beyond The Plant Protein Company' },  // Added via discovery — 2 DE / 14 total
    { company: 'soti', instance: 'wd3', site: 'careers', name: 'SOTI' },  // Added via discovery — 2 DE / 96 total
    { company: 'vfc', instance: 'wd5', site: 'northface_careers', name: 'Vfc' },  // Added via discovery — 2 DE / 317 total
    { company: 'premierresearch', instance: 'wd12', site: 'premierresearch', name: 'Premier Research' },  // Added via discovery — 2 DE / 70 total
    { company: 'kyriba', instance: 'wd5', site: 'Kyriba-Careers', name: 'Kyriba' },  // Added via discovery — 2 DE / 18 total
    { company: 'unisys', instance: 'wd5', site: 'external', name: 'Unisys' },  // Added via discovery — 2 DE / 400 total
    { company: 'fedrigoni', instance: 'wd3', site: 'fedrigoni', name: 'fedrigoni' },  // Added via discovery — 2 DE / 33 total
    { company: 'corelab', instance: 'wd12', site: 'clb', name: 'corelab' },  // Added via discovery — 2 DE / 59 total
    { company: 'axcelis', instance: 'wd1', site: 'axcelis', name: 'axcelis' },  // Added via discovery — 2 DE / 69 total
    { company: 'zillow', instance: 'wd5', site: 'zillow_group_external', name: 'Zillow' },  // Added via discovery — 2 DE / 106 total
    { company: 'canopygrowth', instance: 'wd3', site: 'canopy_growth_external_career_site', name: 'canopygrowth' },  // Added via discovery — 2 DE / 22 total
    { company: 'immatics', instance: 'wd3', site: 'immatics_external', name: 'immatics' },  // Added via discovery — 2 DE / 3 total
    { company: 'ppdigital', instance: 'wd103', site: 'isiexternal', name: 'ppdigital' },  // Added via discovery — 2 DE / 22 total
    { company: 'heinz', instance: 'wd1', site: 'kraftheinz_careers_ur', name: 'US Kraft Heinz' },  // Added via discovery — 2 DE / 74 total
    { company: 'kidsii', instance: 'wd1', site: 'kidsii_career_site', name: 'kidsii' },  // Added via discovery — 2 DE / 41 total
    { company: 'talentmanagementsolution', instance: 'wd3', site: 'vestauk', name: 'Jonas' },  // Added via discovery — 2 DE / 37 total
    { company: 'phinia', instance: 'wd5', site: 'phinia_careers', name: 'phinia' },  // Added via discovery — 2 DE / 86 total
    { company: 'tollgroup', instance: 'wd5', site: 'tollgroup', name: 'tollgroup' },  // Added via discovery — 2 DE / 229 total
    { company: 'schreiberfoods', instance: 'wd115', site: 'schreiber_careers', name: 'schreiberfoods' },  // Added via discovery — 2 DE / 153 total
    { company: 'rbc', instance: 'wd3', site: 'rbcglobal1', name: 'Rbc' },  // Added via discovery — 2 DE / 1323 total
    { company: 'cip', instance: 'wd103', site: 'CIP_Careers', name: 'CIP Terra Technologies' },  // Added via discovery — 1 DE / 10 total
    { company: 'madrigalpharma', instance: 'wd501', site: 'Madrigal', name: 'Madrigalpharma' },  // Added via discovery — 1 DE / 71 total
    { company: 'biamp', instance: 'wd12', site: 'biamp', name: 'Biamp' },  // Added via discovery — 1 DE / 11 total
    { company: 'puma', instance: 'wd502', site: 'Work_at_stichd', name: 'PUMA' },  // Added via discovery — 1 DE / 10 total
    { company: 'stem', instance: 'wd12', site: 'StemInc', name: 'Stem' },  // Added via discovery — 1 DE / 1 total
    { company: 'talentmanagementsolution', instance: 'wd3', site: 'VestaEurope', name: 'Jonas' },  // Added via discovery — 1 DE / 5 total
    { company: 'alleima', instance: 'wd3', site: 'kanthal-jobs', name: 'Alleima (Alleima Jobs)' },  // Added via discovery — 1 DE / 5 total
    { company: 'cmcmarkets', instance: 'wd3', site: 'cmc_markets_careers', name: 'CMC Markets' },  // Added via discovery — 1 DE / 77 total
    { company: 'americanredcross', instance: 'wd1', site: 'American_Red_Cross_Careers', name: 'Americanredcross' },  // Added via discovery — 1 DE / 359 total
    { company: 'datev', instance: 'wd3', site: 'ENG_DATEV', name: 'Datev (Datev Careers)' },  // Added via discovery — 1 DE / 1 total
    { company: 'enzazaden', instance: 'wd103', site: 'enza-careers', name: 'Enzazaden' },  // Added via discovery — 1 DE / 63 total
    { company: 'haier', instance: 'wd3', site: 'HaierEurope_Professional_Careers', name: 'GE Appliances' },  // Added via discovery — 1 DE / 25 total
    { company: 'rollsroyce', instance: 'wd3', site: 'rrpowersystemsearlycareer', name: 'Rollsroyce' },  // Added via discovery — 1 DE / 41 total
    { company: 'cryoport', instance: 'wd12', site: 'external', name: 'Cryoport, Inc' },  // Added via discovery — 1 DE / 27 total
    { company: 'epicorsoftware', instance: 'wd5', site: 'epicorjobs', name: 'Epicor' },  // Added via discovery — 1 DE / 78 total
    { company: 'grpr', instance: 'wd3', site: 'palace_jobs', name: 'Grpr' },  // Added via discovery — 1 DE / 1 total
    { company: 'infios', instance: 'wd502', site: 'infios', name: 'Infios' },  // Added via discovery — 1 DE / 49 total
    { company: 'harriscomputer', instance: 'wd3', site: '1', name: 'Harris' },  // Added via discovery — 1 DE / 225 total
    { company: 'generac', instance: 'wd5', site: 'externalcareers', name: 'Generac' },  // Added via discovery — 1 DE / 44 total
    { company: 'monotype', instance: 'wd1', site: 'monotype', name: 'Monotype' },  // Added via discovery — 1 DE / 31 total
    { company: 'manh', instance: 'wd5', site: 'external', name: 'Manhattan Associates' },  // Added via discovery — 1 DE / 35 total
    { company: 'nwis', instance: 'wd12', site: 'nw', name: 'Nwis' },  // Added via discovery — 1 DE / 336 total
    { company: 'moelis', instance: 'wd1', site: 'experienced-hires', name: 'Moelis & Company (“Moelis”)' },  // Added via discovery — 1 DE / 47 total
    { company: 'millerknoll', instance: 'wd1', site: 'millerknoll', name: 'MillerKnoll' },  // Added via discovery — 1 DE / 221 total
    { company: 'oxfordcorp', instance: 'wd108', site: 'Oxford_Careers', name: 'Oxfordcorp' },  // Added via discovery — 1 DE / 15 total
    { company: 'omnissa', instance: 'wd501', site: 'omnissa_external_career_site', name: 'Omnissa' },  // Added via discovery — 1 DE / 107 total
    { company: 'zoetis', instance: 'wd5', site: 'zoetis_intl', name: 'Zoetis' },  // Added via discovery — 1 DE / 52 total
    { company: 'pjtpartners', instance: 'wd1', site: 'careers', name: 'Pjtpartners' },  // Added via discovery — 1 DE / 53 total
    { company: 'tarkett', instance: 'wd3', site: 'tarkett_careers', name: 'Tarkett' },  // Added via discovery — 1 DE / 103 total
    { company: 'priceline', instance: 'wd1', site: 'priceline', name: 'Priceline' },  // Added via discovery — 1 DE / 62 total
    { company: 'theapexgroup', instance: 'wd3', site: 'apexgroupcareers', name: 'Theapexgroup' },  // Added via discovery — 1 DE / 1002 total
    { company: 'oshkoshcorporation', instance: 'wd5', site: 'oshkosh', name: 'Oshkoshcorporation' },  // Added via discovery — 1 DE / 584 total
    { company: 'galileo', instance: 'wd3', site: 'european_university_cyprus_career_site', name: 'Istituto Marangoni' },  // Added via discovery — 1 DE / 3 total
    { company: 'medela', instance: 'wd103', site: 'medela_careers', name: 'medela' },  // Added via discovery — 1 DE / 7 total
    { company: 'fortra', instance: 'wd12', site: 'fortracareers', name: 'fortra' },  // Added via discovery — 1 DE / 35 total
    { company: 'ts', instance: 'wd5', site: 'tishmanspeyer', name: 'Ts' },  // Added via discovery — 1 DE / 29 total
    { company: 'erm', instance: 'wd3', site: 'erm_earlycareers', name: 'Erm' },  // Added via discovery — 1 DE / 115 total
    { company: 'plugpower', instance: 'wd5', site: 'plug_power_inc', name: 'Plug Power' },  // Added via discovery — 1 DE / 81 total
    { company: 'gafsgi', instance: 'wd5', site: 'bmi', name: 'Gafsgi' },  // Added via discovery — 1 DE / 9 total
    { company: 'heidrick', instance: 'wd1', site: 'businesstalentgroup', name: 'Heidrick & Struggles' },  // Added via discovery — 1 DE / 4 total
    { company: 'worldpay', instance: 'wd5', site: 'worldpay_external_careers_site', name: 'Worldpay' },  // Added via discovery — 1 DE / 211 total
    { company: 'qdusa', instance: 'wd108', site: 'quantumdesigncareers', name: 'qdusa' },  // Added via discovery — 1 DE / 10 total
    { company: 'wlt', instance: 'wd3', site: 'wl_careers', name: 'wlt' },  // Added via discovery — 1 DE / 54 total
    { company: 'pjtpartners', instance: 'wd1', site: 'Studentevents', name: 'Pjtpartners' },  // Added via discovery — 1 DE / 5 total
    { company: 'salesforce', instance: 'wd12', site: 'futureforce_newgradroles', name: 'Slack' },  // Added via discovery — 1 DE / 19 total
    { company: 'spellmanhv', instance: 'wd1', site: 'spellmanhvcareers', name: 'spellmanhv' },  // Added via discovery — 1 DE / 52 total
    { company: 'idexcorp', instance: 'wd5', site: 'thinxxs', name: 'Idexcorp' },  // Added via discovery — 1 DE / 1 total
    { company: 'visa', instance: 'wd5', site: 'visa_early_careers', name: 'Visa' },  // Added via discovery — 1 DE / 20 total
    { company: 'northerndata', instance: 'wd3', site: 'northerndatacareers', name: 'Peak Mining' },  // Added via discovery — 1 DE / 3 total
    // --- DISCOVERY 2026-09-15 (web search + API verified: >=1 job in Germany) ---
    { company: 'allegion', instance: 'wd5', site: 'interflex_german', name: 'Interflex (Allegion)' },  // Added via discovery — 5 DE / 5 total
];

// --- Config export -------------------------------------------------------------

export const workdayConfig = {
    siteName: 'Workday Jobs',
    companyBoards,
    limit: 20,
    _allJobsQueue: [],
    _initialized: false,
    needsDescriptionScraping: true,

    // -- Pre-fetch phase: runs once per scrape session --------------------------
    // Paginates every company board, filters to Germany-only jobs, and
    // buffers them in _allJobsQueue for scrapeSite to drain one-by-one.
    async initialize() {
        if (this._initialized) return;

        // Reset queue in case the config object is reused across runs
        this._allJobsQueue = [];

        console.log(`[Workday] Fetching jobs from ${this.companyBoards.length} companies...`);

        let germanyJobsTotal = 0;
        let successCount = 0;
        let failCount = 0;
        let emptyCount = 0;

        // Deduplicate company entries (e.g. SAP listed twice above)
        const seenSlugs = new Set();
        const boards = this.companyBoards.filter(b => {
            const key = `${b.company}_${b.site}`;
            if (seenSlugs.has(key)) return false;
            seenSlugs.add(key);
            return true;
        });

        const stateMap = await loadScrapeStates('workday');
        const pendingStates = [];
        let skippedCount = 0;

        for (const board of boards) {
            const result = await this._fetchCompany(board, stateMap);
            if (result.status === 'failed') { failCount++; continue; }
            if (result.state) pendingStates.push(result.state);
            if (result.status === 'unchanged') { skippedCount++; continue; }
            if (result.status === 'empty') { emptyCount++; continue; }
            this._allJobsQueue.push(...result.jobs);
            germanyJobsTotal += result.jobs.length;
            successCount++;
        }

        await saveScrapeStatesBulk('workday', pendingStates);
        console.log(`[Workday] ? Summary: ${successCount} companies with Germany jobs, ${skippedCount} unchanged (skipped), ${failCount} failed, ${emptyCount} empty`);
        console.log(`[Workday] ?? Total Germany jobs queued: ${germanyJobsTotal}`);
        this._initialized = true;
    },

    // -- Fetch + paginate one board → Germany-filtered jobs only ----------------
    // Extracted from the initialize() loop so the accumulated allJobs array
    // (every posting on the board, often hundreds) goes out of scope per
    // company and becomes GC-eligible instead of persisting across the loop.
    // Change detection: Workday's list endpoint is a POST, so there is no
    // ETag layer here — only the content hash (externalPath|postedOn), which
    // still spares the queue/AI pipeline even though the pages are downloaded.
    // Returns { status: 'ok' | 'empty' | 'failed' | 'unchanged', jobs, state? }.
    async _fetchCompany(board, stateMap) {
        const { company, instance, site, name } = board;
        const stateSlug = `${company}_${site}`;
        const prev = stateMap.get(stateKey('workday', stateSlug));
        const baseUrl = `https://${company}.${instance}.myworkdayjobs.com`;
        const listUrl = `${baseUrl}/wday/cxs/${company}/${site}/jobs`;

        let allJobs = [];
        let total = 0;
        let offset = 0;
        const limit = 20;

        try {
            // -- First page ----------------------------------------------
            const controller = new AbortController();
            const timeout = setTimeout(() => controller.abort(), 30000);

            const firstRes = await fetch(listUrl, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Accept': 'application/json',
                },
                body: JSON.stringify({ appliedFacets: {}, limit, offset, searchText: '' }),
                signal: controller.signal,
            });
            clearTimeout(timeout);

            if (!firstRes.ok) {
                console.log(`[Workday] ? ${company} (${name}): HTTP ${firstRes.status} � skipping`);
                return { status: 'failed', jobs: [] };
            }

            const firstData = await firstRes.json();
            total = firstData.total || 0;

            if (!total) {
                return {
                    status: 'empty', jobs: [],
                    state: { slug: stateSlug, etag: null, contentHash: computeContentHash([]), jobCount: 0, changed: !prev },
                };
            }

            // Add first page jobs
            const firstPageJobs = (firstData.jobPostings || []).map(j => ({
                ...j,
                _company: company,
                _instance: instance,
                _site: site,
                _companyName: name,
            }));
            allJobs.push(...firstPageJobs);
            offset += limit;

            // -- Subsequent pages ----------------------------------------
            while (offset < total) {
                await new Promise(r => setTimeout(r, 200)); // polite delay between pages

                const pageController = new AbortController();
                const pageTimeout = setTimeout(() => pageController.abort(), 30000);

                const pageRes = await fetch(listUrl, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Accept': 'application/json',
                    },
                    body: JSON.stringify({ appliedFacets: {}, limit, offset, searchText: '' }),
                    signal: pageController.signal,
                });
                clearTimeout(pageTimeout);

                if (!pageRes.ok) break;

                const pageData = await pageRes.json();
                const pageJobs = (pageData.jobPostings || []).map(j => ({
                    ...j,
                    _company: company,
                    _instance: instance,
                    _site: site,
                    _companyName: name,
                }));
                allJobs.push(...pageJobs);
                offset += limit;
            }

            // -- Unchanged board? Skip filter + queue entirely ------------
            const contentHash = computeContentHash(
                allJobs.map(j => `${j.externalPath || ''}|${j.title || ''}|${j.postedOn || ''}`),
            );
            if (prev && prev.contentHash === contentHash) {
                await new Promise(r => setTimeout(r, 500));
                return {
                    status: 'unchanged', jobs: [],
                    state: { slug: stateSlug, etag: null, contentHash, jobCount: prev.jobCount ?? 0, changed: false },
                };
            }

            // -- Filter to Germany-only ----------------------------------
            const germanyJobs = allJobs.filter(j => hasGermanyLocation(j));

            if (germanyJobs.length > 0) {
                console.log(`[Workday] ? ${company} (${name}): ${germanyJobs.length} Germany jobs (${total} total)`);
            } else {
                console.log(`[Workday]    ${company} (${name}): ${total} jobs, 0 in Germany`);
            }

            await new Promise(r => setTimeout(r, 500)); // polite delay between companies

            const state = { slug: stateSlug, etag: null, contentHash, jobCount: germanyJobs.length, changed: true };
            return germanyJobs.length > 0
                ? { status: 'ok', jobs: germanyJobs, state }
                : { status: 'empty', jobs: [], state };
        } catch (err) {
            console.log(`[Workday] ? ${company} (${name}): ${err?.message || err}`);
            return { status: 'failed', jobs: [] };
        }
    },

    // -- Called by network.js (fetchJobsPage detects this method) --------------
    async fetchPage(offset, limit) {
        if (!this._initialized) await this.initialize();
        const jobs = this._allJobsQueue.slice(offset, offset + limit);
        return { jobs, total: this._allJobsQueue.length };
    },

    getJobs(data) {
        return data.jobs || [];
    },

    getTotal(data) {
        return data.total || 0;
    },

    // -- Field extractors (used by processor.js) -------------------------------

    extractJobID(job) {
        // externalPath is always unique: /job/Hamburg/Revenue-Analyst_JR108514
        // bulletFields[0] is SOMETIMES the req ID, but some companies (Europcar)
        // put country in bulletFields[0] instead. Use externalPath as primary.
        const path = job.externalPath || '';
        const reqFromPath = path.split('_').pop() || '';
        const reqFromBullet = job.bulletFields?.[job.bulletFields?.length - 1] || '';
        const reqId = reqFromPath || reqFromBullet || path;
        return `workday_${job._company}_${reqId}`;
    },

    extractJobTitle(job) {
        return job.title || '';
    },

    extractCompany(job) {
        return job._companyName || job._company || '';
    },

    extractLocation(job) {
        if (job.locationsText) return job.locationsText;
        // Fallback: some companies (e.g. Europcar) store location in bulletFields
        // Format: ['Germany', 'Hamburg', 'JR108514']
        if (Array.isArray(job.bulletFields) && job.bulletFields.length >= 2) {
            const country = job.bulletFields[0];
            const city = job.bulletFields[1];
            if (city && country) return `${city}, ${country}`;
            if (country) return country;
        }
        return '';
    },

    extractAllLocations(job) {
        if (job.locationsText) {
            const raw = job.locationsText;
            return normalizeArray(raw.split(',').map(l => l.trim()));
        }
        // Fallback: bulletFields
        if (Array.isArray(job.bulletFields) && job.bulletFields.length >= 2) {
            return normalizeArray([`${job.bulletFields[1]}, ${job.bulletFields[0]}`]);
        }
        return [];
    },

    extractDepartment(job) {
        // Not available in list payload � filled by getDetails if present
        return null;
    },

    extractWorkplaceType(job) {
        // Workday list API rarely exposes this; getDetails fills it properly
        return 'Unspecified';
    },

    extractEmploymentType(job) {
        return null; // filled by getDetails
    },

    extractDescription(job) {
        return null; // always fetched via getDetails
    },

    extractURL(job) {
        return null; // filled by getDetails
    },

    extractPostedDate(job) {
        return null; // filled by getDetails
    },

    // -- Detail fetch: called by processor.js when needsDescriptionScraping=true -

    async getDetails(rawJob, sessionHeaders) {
        const { _company, _instance, _site, externalPath, _companyName } = rawJob;

        if (!_company || !_instance || !_site || !externalPath) return null;

        const baseUrl = `https://${_company}.${_instance}.myworkdayjobs.com`;
        const detailUrl = `${baseUrl}/wday/cxs/${_company}/${_site}${externalPath}`;

        try {
            const controller = new AbortController();
            const timeout = setTimeout(() => controller.abort(), 30000);

            const res = await fetch(detailUrl, {
                method: 'GET',
                headers: {
                    'Accept': 'application/json',
                    ...(sessionHeaders || {}),
                },
                signal: controller.signal,
            });
            clearTimeout(timeout);

            if (!res.ok) return null;

            const data = await res.json();
            const info = data.jobPostingInfo || {};
            const hiringOrg = data.hiringOrganization || {};

            // -- Workplace type ---------------------------------------------
            const workplaceRaw = info.remoteType || info.workplaceType || info.locationType || null;
            const workplaceType = normalizeWorkplaceType(workplaceRaw);

            // -- Employment type ---------------------------------------------
            const employmentRaw = info.timeType || info.jobType || null;
            const employmentType = normalizeEmploymentType(employmentRaw);

            // -- Department -------------------------------------------------
            const department = info.jobFunctionSummary || info.jobFamily || hiringOrg.industry || null;

            // -- Plain-text description (strip any HTML Workday sometimes includes) --
            const descriptionHtml = info.jobDescription || '';
            const descriptionPlain = StripHtml(descriptionHtml);

            return {
                Description: descriptionPlain || null,
                DescriptionHtml: SanitizeHtml(descriptionHtml) || null,
                ApplicationURL: info.externalUrl || `${baseUrl}/${_company}/${_site}/job${externalPath}`,
                DirectApplyURL: info.externalUrl || null,
                PostedDate: info.startDate ? new Date(info.startDate) : null,
                ContractType: employmentRaw || null,
                EmploymentType: employmentType,
                WorkplaceType: workplaceType,
                Department: department || null,
                Company: _companyName || hiringOrg.name,
            };
        } catch (err) {
            return null;
        }
    },
};
