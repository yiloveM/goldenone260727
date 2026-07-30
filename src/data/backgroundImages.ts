const local = (name: string) => `/images/metal-gifts/${name}.webp`;

export const siteImages = {
  brand: {
    logo: '/template-logo.svg',
    icon: '/template-icon.svg',
  },
  homeHero: {
    rippleDesktop: local('hero-collection-v2'),
    rippleMobile: local('hero-collection-v2'),
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
    productsCatalog: local('hero-collection-v2'),
    engineeringNotes: local('lapel-pin-collection-v2'),
    about: local('customization-story-v2'),
    contact: local('keychain-collection-v2'),
    faq: local('challenge-coin-collection-v2'),
  },
  productCategories: {
    industrialProducts: local('lapel-pin-collection-v2'),
    customSolutions: local('challenge-coin-collection-v2'),
    spareParts: local('medal-collection-v2'),
    servicePrograms: local('keychain-collection-v2'),
    fallback: local('hero-collection-v2'),
  },
} as const;
