import { Platform } from "react-native";

const isNoman = true; // Toggle this to switch configurations

// noman app id = ca-app-pub-5740215782746766~5686901243
//waqas app id = ca-app-pub-3701208411582706~4267174419
// noman pkgName= com.creature_of_sonaria
//waqas pkgName = com.bloxfruitstock
const rev_cat_id = Platform.OS === 'ios' ? 'appl_JOMNbWZLuKVWLucYrnWIaTAjvag' : 'goog_pxMRIZwBlHfkaLqeHmEnpjzHshJ'

const config = {
  appName: isNoman ? 'Blox Fruit Values Calc' : 'Blox Fruit Stock',
  andriodBanner: 'ca-app-pub-5740215782746766/7450574901',
  andriodIntestial: 'ca-app-pub-5740215782746766/4894578222',
  andriodRewarded: '',
  andriodOpenApp: 'ca-app-pub-5740215782746766/3778923201',
  andriodNative: '',
  IOsIntestial: 'ca-app-pub-5740215782746766/6670694324',
  // Game interstitial ad IDs (used for A/B testing in IntAd.js)
  gameInterstitialAndroid: 'ca-app-pub-5740215782746766/5357612653',
  gameInterstitialIOS: 'ca-app-pub-5740215782746766/3072346193',
  IOsBanner: 'ca-app-pub-5740215782746766/9929398588',
  IOsRewarded: '',
  IOsOpenApp: 'ca-app-pub-5740215782746766/1152103324',
  IOsNative: '',

  apiKey: isNoman ? rev_cat_id : rev_cat_id,

  supportEmail: isNoman ? 'thesolanalabs@gmail.com' : 'mindfusionio.help@gmail.com',
  andriodShareLink: isNoman ? 'https://play.google.com/store/apps/details?id=com.creature_of_sonaria' : 'https://play.google.com/store/apps/details?id=com.bloxfruitstock',
  IOsShareLink: isNoman ? 'https://apps.apple.com/us/app/app-name/id6745400111' : '',
  IOsShareLink: isNoman ? 'https://apps.apple.com/us/app/app-name/id6745400111' : '',
  webSite: isNoman ? 'https://adoptmevalues.app/' : 'https://bloxfruitvalue.today',

  isNoman: isNoman ? true : false,

  otherapplink: Platform.OS == 'android' ? 'https://play.google.com/store/apps/details?id=com.bloxfruitevalues' : 'https://apps.apple.com/us/app/app-name/id6737775801',
  otherapplink2: Platform.OS == 'android' ? 'https://play.google.com/store/apps/details?id=com.mm2tradesvalues' : 'https://apps.apple.com/us/app/app-name/id6737775801',
  // Cloud Functions URL (update with your actual region)
  cloudFunctionsUrl: 'https://us-central1-adoptme-7b50c.cloudfunctions.net',

  colors: isNoman
    ? {
      primary: '#7b1fa2', // Modern Mobility Blue
      primaryLight: '#E0B0FF', // Light lavender for dark mode icons
      secondary: '#3E8BFC', // Bright action blue
      hasBlockGreen: '#f75a07', // Diet Teal (Proper Green)
      wantBlockRed: '#ce93d8', // Vibrant Pinkish Red
      backgroundLight: '#f2f2f7',
      backgroundDark: '#121212',
      white: 'white',
      black: 'black'
    }
    : {
      primary: '#697565', // Deep navy blue
      primaryLight: '#E0B0FF', // Light lavender for dark mode icons
      secondary: '#457B9D', // Muted teal
      hasBlockGreen: '#B8860B', // Light mint green
      wantBlockRed: '#ce93d8', // Warm, soft red
      backgroundLight: '#f2f2f7',
      backgroundDark: '#121212',
      white: 'white',
      black: 'black'
    },

  // Helper function to get the appropriate primary color based on theme
  // Use this everywhere instead of config.colors.primary for theme-aware colors
  // Dark mode: #E0B0FF (light lavender) | Light mode: original primary
  getPrimaryColor: (isDarkMode) => {
    return isDarkMode ? '#E0B0FF' : (isNoman ? '#7b1fa2' : '#697565');
  },

  // Alias for backward compatibility - same as getPrimaryColor
  getIconColor: (isDarkMode) => {
    return isDarkMode ? '#E0B0FF' : (isNoman ? '#7b1fa2' : '#697565');
  },

  getTagColor: (category, isDarkMode) => {
    if (!category) return isDarkMode
      ? { bg: '#2c2c2c', text: '#ccc', border: '#444' }
      : { bg: '#f1f1f1', text: '#555', border: '#ddd' };

    const cat = category.toLowerCase();
    const palettes = {
      diet: isDarkMode
        ? { bg: 'rgba(0, 150, 136, 0.15)', text: '#4db6ac', border: 'rgba(0, 150, 136, 0.3)' }
        : { bg: '#e0f2f1', text: '#00796b', border: '#b2dfdb' },
      mobility: isDarkMode
        ? { bg: 'rgba(33, 150, 243, 0.15)', text: '#64b5f6', border: 'rgba(33, 150, 243, 0.3)' }
        : { bg: '#e3f2fd', text: '#1976d2', border: '#bbdefb' },
      ability: isDarkMode
        ? { bg: 'rgba(156, 39, 176, 0.15)', text: '#ce93d8', border: 'rgba(156, 39, 176, 0.3)' }
        : { bg: '#f3e5f5', text: '#7b1fa2', border: '#e1bee7' },
      environment: isDarkMode
        ? { bg: 'rgba(0, 188, 212, 0.15)', text: '#4dd0e1', border: 'rgba(0, 188, 212, 0.3)' }
        : { bg: '#e0f7fa', text: '#0097a7', border: '#b2ebf2' },
      rarity: isDarkMode
        ? { bg: 'rgba(255, 193, 7, 0.15)', text: '#ffd54f', border: 'rgba(255, 193, 7, 0.3)' }
        : { bg: '#fff8e1', text: '#f57f17', border: '#ffecb3' },
      type: isDarkMode
        ? { bg: 'rgba(158, 158, 158, 0.15)', text: '#bdbdbd', border: 'rgba(158, 158, 158, 0.3)' }
        : { bg: '#f5f5f5', text: '#616161', border: '#e0e0e0' },
    };

    if (cat.includes('diet')) return palettes.diet;
    if (cat.includes('mobility')) return palettes.mobility;
    if (cat.includes('ability')) return palettes.ability;
    if (cat.includes('oxygen') || cat.includes('moisture') || cat.includes('environment')) return palettes.environment;
    if (cat.includes('rarity')) return palettes.rarity;
    if (cat.includes('type')) return palettes.type;

    return isDarkMode
      ? { bg: '#2c2c2c', text: '#aaa', border: '#444' }
      : { bg: '#f5f5f5', text: '#777', border: '#eee' };
  },

};

export default config;
