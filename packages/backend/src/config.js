// config.js
import { greenhouseConfig } from './company-configs/greenhouseConfig.js';
import { ashbyConfig } from './company-configs/ashbyConfig.js';
import { leverConfig } from './company-configs/leverConfig.js';
import { workdayConfig } from './company-configs/workdayConfig.js';
import { workableConfig } from './company-configs/workableConfig.js';
import { recruiteeConfig } from './company-configs/recruiteeConfig.js';
import{personioConfig} from './company-configs/personioConfig.js';
import smartRecruitersConfig from './company-configs/smartRecruitersConfig.js';
import { teamtailorConfig } from './company-configs/teamtailorConfig.js';
import { arbeitsagenturConfig } from './company-configs/arbeitsagenturConfig.js';
import { softgardenConfig } from './company-configs/softgardenConfig.js';
import { joinConfig } from './company-configs/joinConfig.js';

export const SITES_CONFIG = [



  // --------------------------------------
  // Sources run SCRAPER_SOURCE_CONCURRENCY at a time in this order (see
  // cron/runScraper.js). The feeds sit near the front so they start in the
  // first lanes instead of waiting for every ATS board; Arbeitsagentur caps
  // its own per-run share of the AI budget (ARBEITSAGENTUR_MAX_PER_RUN).
  greenhouseConfig,
  arbeitsagenturConfig,
  ashbyConfig,
  softgardenConfig,
  joinConfig,
  leverConfig ,
  workdayConfig,
  workableConfig,
  recruiteeConfig,
  personioConfig,
  smartRecruitersConfig,
  teamtailorConfig,









];