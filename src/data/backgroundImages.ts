const local = (name: string) => `/images/metal-gifts/${name}.webp`;
const campaign = (name: string) => `/r2/Banner/2026-product-design/${name}.webp`;

export const siteImages = {
  brand: {
    logo: '/r2/brand/goldenone-logo-c1e2f260b0.png',
    footerLogo: '/images/brand/goldenone-logo-transparent.png',
    icon: '/favicon-goldenone-32.png',
  },
  homeHero: {
    rippleDesktop: campaign('home/custom-metal-gifts'),
    rippleMobile: campaign('home/custom-metal-gifts'),
    center: local('lapel-pin-collection-v2'),
    floatingProducts: [
      local('lapel-pin-collection-v2'),
      local('challenge-coin-collection-v2'),
      local('medal-collection-v2'),
      local('keychain-collection-v2'),
    ],
  },
  homeBackgrounds: {
    productWorldsIntro: local('lapel-pin-collection-v2'),
    productCategoryTransitionDesktop: local('customization-story-v2'),
    productCategoryTransitionMobile: local('customization-story-v2'),
    hotSalesBand: local('challenge-coin-collection-v2'),
    featuredEquipment: local('medal-collection-v2'),
    factoryCapability: local('customization-story-v2'),
  },
  homeShowcase: {
    primaryOffer: local('lapel-pin-collection-v2'),
    operations: local('challenge-coin-collection-v2'),
    quality: local('medal-collection-v2'),
    delivery: local('keychain-collection-v2'),
    partnership: local('customization-story-v2'),
  },
  factoryGallery: {
    strategyRoom: local('lapel-pin-collection-v2'),
    productReview: local('challenge-coin-collection-v2'),
    operationsDesk: local('medal-collection-v2'),
    qualityWorkflow: local('keychain-collection-v2'),
    warehouse: local('hero-collection-v2'),
    clientWorkshop: local('customization-story-v2'),
  },
  pageBanners: {
    productsCatalog: campaign('home/custom-metal-gifts'),
    engineeringNotes: campaign('home/finish-and-detail'),
    about: campaign('home/finish-and-detail'),
    contact: campaign('home/custom-projects'),
    faq: campaign('home/custom-projects'),
  },
  productCategories: {
    industrialProducts: local('lapel-pin-collection-v2'),
    customSolutions: local('challenge-coin-collection-v2'),
    spareParts: local('medal-collection-v2'),
    servicePrograms: local('keychain-collection-v2'),
    fallback: local('hero-collection-v2'),
  },
} as const;
