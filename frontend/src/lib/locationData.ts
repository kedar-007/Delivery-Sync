// ─── Countries ────────────────────────────────────────────────────────────────

export const COUNTRIES = [
  'Afghanistan', 'Argentina', 'Australia', 'Austria', 'Bangladesh', 'Belgium',
  'Brazil', 'Canada', 'Chile', 'China', 'Colombia', 'Czech Republic', 'Denmark',
  'Egypt', 'Finland', 'France', 'Germany', 'Ghana', 'Greece', 'Hong Kong',
  'Hungary', 'India', 'Indonesia', 'Iran', 'Iraq', 'Ireland', 'Israel', 'Italy',
  'Japan', 'Jordan', 'Kenya', 'Malaysia', 'Mexico', 'Morocco', 'Netherlands',
  'New Zealand', 'Nigeria', 'Norway', 'Pakistan', 'Peru', 'Philippines', 'Poland',
  'Portugal', 'Qatar', 'Romania', 'Russia', 'Saudi Arabia', 'Singapore',
  'South Africa', 'South Korea', 'Spain', 'Sri Lanka', 'Sweden', 'Switzerland',
  'Taiwan', 'Thailand', 'Turkey', 'Ukraine', 'United Arab Emirates',
  'United Kingdom', 'United States', 'Vietnam',
];

// ─── Timezones (grouped by region) ───────────────────────────────────────────

export interface TzOption { value: string; label: string; group: string; }

export const TIMEZONES: TzOption[] = [
  // UTC
  { value: 'UTC',                        label: 'UTC (Coordinated Universal Time)',          group: 'UTC' },

  // Americas
  { value: 'America/New_York',           label: 'US Eastern (EST/EDT, UTC−5/−4)',            group: 'Americas' },
  { value: 'America/Chicago',            label: 'US Central (CST/CDT, UTC−6/−5)',            group: 'Americas' },
  { value: 'America/Denver',             label: 'US Mountain (MST/MDT, UTC−7/−6)',           group: 'Americas' },
  { value: 'America/Los_Angeles',        label: 'US Pacific (PST/PDT, UTC−8/−7)',            group: 'Americas' },
  { value: 'America/Anchorage',          label: 'US Alaska (AKST/AKDT, UTC−9/−8)',           group: 'Americas' },
  { value: 'Pacific/Honolulu',           label: 'US Hawaii (HST, UTC−10)',                   group: 'Americas' },
  { value: 'America/Toronto',            label: 'Canada Eastern (EST/EDT, UTC−5/−4)',        group: 'Americas' },
  { value: 'America/Vancouver',          label: 'Canada Pacific (PST/PDT, UTC−8/−7)',        group: 'Americas' },
  { value: 'America/Sao_Paulo',          label: 'Brazil (BRT/BRST, UTC−3/−2)',              group: 'Americas' },
  { value: 'America/Argentina/Buenos_Aires', label: 'Argentina (ART, UTC−3)',               group: 'Americas' },
  { value: 'America/Mexico_City',        label: 'Mexico Central (CST/CDT, UTC−6/−5)',        group: 'Americas' },
  { value: 'America/Bogota',             label: 'Colombia (COT, UTC−5)',                     group: 'Americas' },
  { value: 'America/Lima',               label: 'Peru (PET, UTC−5)',                         group: 'Americas' },
  { value: 'America/Santiago',           label: 'Chile (CLT/CLST, UTC−4/−3)',               group: 'Americas' },

  // Europe
  { value: 'Europe/London',              label: 'UK/Ireland (GMT/BST, UTC+0/+1)',            group: 'Europe' },
  { value: 'Europe/Paris',               label: 'Central Europe (CET/CEST, UTC+1/+2)',       group: 'Europe' },
  { value: 'Europe/Berlin',              label: 'Germany/Central Europe (CET/CEST)',         group: 'Europe' },
  { value: 'Europe/Amsterdam',           label: 'Netherlands (CET/CEST, UTC+1/+2)',          group: 'Europe' },
  { value: 'Europe/Madrid',              label: 'Spain (CET/CEST, UTC+1/+2)',                group: 'Europe' },
  { value: 'Europe/Rome',                label: 'Italy (CET/CEST, UTC+1/+2)',                group: 'Europe' },
  { value: 'Europe/Stockholm',           label: 'Sweden/Scandinavia (CET/CEST, UTC+1/+2)',   group: 'Europe' },
  { value: 'Europe/Warsaw',              label: 'Poland (CET/CEST, UTC+1/+2)',               group: 'Europe' },
  { value: 'Europe/Athens',              label: 'Greece/Eastern Europe (EET/EEST, UTC+2/+3)', group: 'Europe' },
  { value: 'Europe/Helsinki',            label: 'Finland/Eastern Europe (EET/EEST, UTC+2/+3)', group: 'Europe' },
  { value: 'Europe/Istanbul',            label: 'Turkey (TRT, UTC+3)',                       group: 'Europe' },
  { value: 'Europe/Moscow',              label: 'Russia/Moscow (MSK, UTC+3)',                group: 'Europe' },
  { value: 'Europe/Kiev',                label: 'Ukraine (EET/EEST, UTC+2/+3)',              group: 'Europe' },
  { value: 'Europe/Lisbon',              label: 'Portugal (WET/WEST, UTC+0/+1)',             group: 'Europe' },

  // Africa
  { value: 'Africa/Cairo',               label: 'Egypt/East Africa (EET, UTC+2)',            group: 'Africa' },
  { value: 'Africa/Johannesburg',        label: 'South Africa (SAST, UTC+2)',                group: 'Africa' },
  { value: 'Africa/Lagos',               label: 'Nigeria/West Africa (WAT, UTC+1)',          group: 'Africa' },
  { value: 'Africa/Nairobi',             label: 'Kenya/East Africa (EAT, UTC+3)',            group: 'Africa' },
  { value: 'Africa/Casablanca',          label: 'Morocco (WET, UTC+0/+1)',                   group: 'Africa' },

  // Middle East
  { value: 'Asia/Riyadh',                label: 'Saudi Arabia (AST, UTC+3)',                 group: 'Middle East' },
  { value: 'Asia/Kuwait',                label: 'Kuwait/Qatar (AST, UTC+3)',                 group: 'Middle East' },
  { value: 'Asia/Dubai',                 label: 'UAE/Gulf (GST, UTC+4)',                     group: 'Middle East' },
  { value: 'Asia/Tehran',                label: 'Iran (IRST/IRDT, UTC+3:30/+4:30)',         group: 'Middle East' },
  { value: 'Asia/Baghdad',               label: 'Iraq (AST, UTC+3)',                         group: 'Middle East' },
  { value: 'Asia/Jerusalem',             label: 'Israel (IST/IDT, UTC+2/+3)',               group: 'Middle East' },
  { value: 'Asia/Amman',                 label: 'Jordan (EET/EEST, UTC+2/+3)',              group: 'Middle East' },

  // South Asia
  { value: 'Asia/Karachi',               label: 'Pakistan (PKT, UTC+5)',                     group: 'South Asia' },
  { value: 'Asia/Kolkata',               label: 'India (IST, UTC+5:30)',                     group: 'South Asia' },
  { value: 'Asia/Colombo',               label: 'Sri Lanka (IST, UTC+5:30)',                 group: 'South Asia' },
  { value: 'Asia/Dhaka',                 label: 'Bangladesh (BST, UTC+6)',                   group: 'South Asia' },
  { value: 'Asia/Kathmandu',             label: 'Nepal (NPT, UTC+5:45)',                     group: 'South Asia' },

  // East & Southeast Asia
  { value: 'Asia/Bangkok',               label: 'Thailand/Indochina (ICT, UTC+7)',           group: 'East & SE Asia' },
  { value: 'Asia/Ho_Chi_Minh',           label: 'Vietnam (ICT, UTC+7)',                      group: 'East & SE Asia' },
  { value: 'Asia/Jakarta',               label: 'Indonesia Western (WIB, UTC+7)',            group: 'East & SE Asia' },
  { value: 'Asia/Kuala_Lumpur',          label: 'Malaysia (MYT, UTC+8)',                     group: 'East & SE Asia' },
  { value: 'Asia/Singapore',             label: 'Singapore (SGT, UTC+8)',                    group: 'East & SE Asia' },
  { value: 'Asia/Hong_Kong',             label: 'Hong Kong (HKT, UTC+8)',                    group: 'East & SE Asia' },
  { value: 'Asia/Shanghai',              label: 'China (CST, UTC+8)',                        group: 'East & SE Asia' },
  { value: 'Asia/Taipei',                label: 'Taiwan (CST, UTC+8)',                       group: 'East & SE Asia' },
  { value: 'Asia/Manila',                label: 'Philippines (PST, UTC+8)',                  group: 'East & SE Asia' },
  { value: 'Asia/Seoul',                 label: 'South Korea (KST, UTC+9)',                  group: 'East & SE Asia' },
  { value: 'Asia/Tokyo',                 label: 'Japan (JST, UTC+9)',                        group: 'East & SE Asia' },

  // Oceania
  { value: 'Australia/Perth',            label: 'Australia Western (AWST, UTC+8)',           group: 'Oceania' },
  { value: 'Australia/Darwin',           label: 'Australia Central (ACST, UTC+9:30)',        group: 'Oceania' },
  { value: 'Australia/Brisbane',         label: 'Australia Eastern–no DST (AEST, UTC+10)',   group: 'Oceania' },
  { value: 'Australia/Adelaide',         label: 'Australia Central (ACST/ACDT, UTC+9:30/+10:30)', group: 'Oceania' },
  { value: 'Australia/Sydney',           label: 'Australia Eastern (AEST/AEDT, UTC+10/+11)', group: 'Oceania' },
  { value: 'Pacific/Auckland',           label: 'New Zealand (NZST/NZDT, UTC+12/+13)',      group: 'Oceania' },
  { value: 'Pacific/Fiji',               label: 'Fiji (FJT, UTC+12)',                        group: 'Oceania' },
];

const _tzGroups: string[] = [];
TIMEZONES.forEach((t) => { if (!_tzGroups.includes(t.group)) _tzGroups.push(t.group); });
export const TZ_GROUPS = _tzGroups;
