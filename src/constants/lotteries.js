// Known Kerala State lotteries. Names change over time, so this list is only used
// to help detection — unknown names found on a page are still accepted.
export const KNOWN_LOTTERIES = [
  { name: 'Karunya Plus', code: 'KN' },
  { name: 'Karunya', code: 'KR' },
  { name: 'Akshaya', code: 'AK' },
  { name: 'Nirmal', code: 'NR' },
  { name: 'Win Win', code: 'W' },
  { name: 'Sthree Sakthi', code: 'SS' },
  { name: 'Fifty Fifty', code: 'FF' },
  { name: 'Bhagyathara', code: 'BT' },
  { name: 'Suvarna Keralam', code: 'SK' },
  { name: 'Dhanalekshmi', code: 'DL' },
  { name: 'Samrudhi', code: 'SM' },
  { name: 'Karunya Plus Bumper', code: 'KB' },
  { name: 'Christmas New Year Bumper', code: 'BR' },
  { name: 'Summer Bumper', code: 'BR' },
  { name: 'Vishu Bumper', code: 'BR' },
  { name: 'Monsoon Bumper', code: 'BR' },
  { name: 'Thiruvonam Bumper', code: 'BR' },
  { name: 'Pooja Bumper', code: 'BR' },
];

// Spelling variants seen on result sites -> canonical name.
export const LOTTERY_ALIASES = {
  'win-win': 'Win Win',
  'winwin': 'Win Win',
  'sthree sakthi': 'Sthree Sakthi',
  'sthreesakthi': 'Sthree Sakthi',
  'stree sakthi': 'Sthree Sakthi',
  'fifty-fifty': 'Fifty Fifty',
  'karunya+': 'Karunya Plus',
  'karunyaplus': 'Karunya Plus',
  'dhanalakshmi': 'Dhanalekshmi',
  'samridhi': 'Samrudhi',
  'suvarnakeralam': 'Suvarna Keralam',
  'x-mas new year bumper': 'Christmas New Year Bumper',
  'xmas new year bumper': 'Christmas New Year Bumper',
};

export const CODE_TO_LOTTERY = KNOWN_LOTTERIES.reduce((acc, l) => {
  if (!acc[l.code]) acc[l.code] = l.name;
  return acc;
}, {});
