// Country codes for WhatsApp number input
export interface CountryCode {
  name: string;
  code: string;
  dial_code: string;
}

export const countryCodes: CountryCode[] = [
  { name: 'United States', code: 'US', dial_code: '+1' },
  { name: 'Canada', code: 'CA', dial_code: '+1' },
  { name: 'Mexico', code: 'MX', dial_code: '+52' },
  { name: 'Argentina', code: 'AR', dial_code: '+54' },
  { name: 'Bolivia', code: 'BO', dial_code: '+591' },
  { name: 'Brazil', code: 'BR', dial_code: '+55' },
  { name: 'Chile', code: 'CL', dial_code: '+56' },
  { name: 'Colombia', code: 'CO', dial_code: '+57' },
  { name: 'Costa Rica', code: 'CR', dial_code: '+506' },
  { name: 'Cuba', code: 'CU', dial_code: '+53' },
  { name: 'Dominican Republic', code: 'DO', dial_code: '+1' },
  { name: 'Ecuador', code: 'EC', dial_code: '+593' },
  { name: 'El Salvador', code: 'SV', dial_code: '+503' },
  { name: 'Guatemala', code: 'GT', dial_code: '+502' },
  { name: 'Honduras', code: 'HN', dial_code: '+504' },
  { name: 'Nicaragua', code: 'NI', dial_code: '+505' },
  { name: 'Panama', code: 'PA', dial_code: '+507' },
  { name: 'Paraguay', code: 'PY', dial_code: '+595' },
  { name: 'Peru', code: 'PE', dial_code: '+51' },
  { name: 'Puerto Rico', code: 'PR', dial_code: '+1' },
  { name: 'Uruguay', code: 'UY', dial_code: '+598' },
  { name: 'Venezuela', code: 'VE', dial_code: '+58' },
  { name: 'Spain', code: 'ES', dial_code: '+34' },
  { name: 'United Kingdom', code: 'GB', dial_code: '+44' },
  { name: 'Germany', code: 'DE', dial_code: '+49' },
  { name: 'France', code: 'FR', dial_code: '+33' },
  { name: 'Italy', code: 'IT', dial_code: '+39' },
  { name: 'Portugal', code: 'PT', dial_code: '+351' },
  { name: 'Netherlands', code: 'NL', dial_code: '+31' },
  { name: 'Belgium', code: 'BE', dial_code: '+32' },
  { name: 'Switzerland', code: 'CH', dial_code: '+41' },
  { name: 'Austria', code: 'AT', dial_code: '+43' },
  { name: 'Poland', code: 'PL', dial_code: '+48' },
  { name: 'Russia', code: 'RU', dial_code: '+7' },
  { name: 'Ukraine', code: 'UA', dial_code: '+380' },
  { name: 'Turkey', code: 'TR', dial_code: '+90' },
  { name: 'India', code: 'IN', dial_code: '+91' },
  { name: 'China', code: 'CN', dial_code: '+86' },
  { name: 'Japan', code: 'JP', dial_code: '+81' },
  { name: 'South Korea', code: 'KR', dial_code: '+82' },
  { name: 'Philippines', code: 'PH', dial_code: '+63' },
  { name: 'Indonesia', code: 'ID', dial_code: '+62' },
  { name: 'Thailand', code: 'TH', dial_code: '+66' },
  { name: 'Vietnam', code: 'VN', dial_code: '+84' },
  { name: 'Malaysia', code: 'MY', dial_code: '+60' },
  { name: 'Singapore', code: 'SG', dial_code: '+65' },
  { name: 'Australia', code: 'AU', dial_code: '+61' },
  { name: 'New Zealand', code: 'NZ', dial_code: '+64' },
  { name: 'South Africa', code: 'ZA', dial_code: '+27' },
  { name: 'Nigeria', code: 'NG', dial_code: '+234' },
  { name: 'Egypt', code: 'EG', dial_code: '+20' },
  { name: 'Morocco', code: 'MA', dial_code: '+212' },
  { name: 'Kenya', code: 'KE', dial_code: '+254' },
  { name: 'Ghana', code: 'GH', dial_code: '+233' },
  { name: 'United Arab Emirates', code: 'AE', dial_code: '+971' },
  { name: 'Saudi Arabia', code: 'SA', dial_code: '+966' },
  { name: 'Israel', code: 'IL', dial_code: '+972' },
  { name: 'Pakistan', code: 'PK', dial_code: '+92' },
  { name: 'Bangladesh', code: 'BD', dial_code: '+880' },
];

// Sort by name for easier selection
export const sortedCountryCodes = [...countryCodes].sort((a, b) => 
  a.name.localeCompare(b.name)
);

export default sortedCountryCodes;
