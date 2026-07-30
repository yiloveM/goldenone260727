const local = (name: string) => `/images/metal-gifts/${name}.webp`;
const pexels = (id: string, width = 1600) =>
  `https://images.pexels.com/photos/${id}/pexels-photo-${id}.jpeg?auto=compress&cs=tinysrgb&w=${width}`;

export const siteImages = {
  brand: {
    logo: '/template-logo.svg',
    icon: '/template-icon.svg',
  },
  homeHero: {
    rippleDesktop: local('hero-metal-gifts'),
    rippleMobile: local('hero-metal-gifts'),
    center: local('custom-lapel-pins'),
    floatingProducts: [
      local('custom-lapel-pins'),
      local('challenge-coins'),
      local('medals-keychains'),
    ],
  },
  homeBackgrounds: {
    productWorldsIntro: local('custom-lapel-pins'),
    productCategoryTransitionDesktop: local('hero-metal-gifts'),
    productCategoryTransitionMobile: local('hero-metal-gifts'),
    hotSalesBand: local('challenge-coins'),
    featuredEquipment: local('medals-keychains'),
    factoryCapability: pexels('34710653', 2000),
  },
  homeShowcase: {
    primaryOffer: local('custom-lapel-pins'),
    operations: local('challenge-coins'),
    quality: local('medals-keychains'),
    delivery: local('medals-keychains'),
    partnership: pexels('34710653', 1600),
  },
  factoryGallery: {
    strategyRoom: local('custom-lapel-pins'),
    productReview: local('challenge-coins'),
    operationsDesk: local('medals-keychains'),
    qualityWorkflow: pexels('34710653', 1400),
    warehouse: local('hero-metal-gifts'),
    clientWorkshop: local('custom-lapel-pins'),
  },
  pageBanners: {
    productsCatalog: local('hero-metal-gifts'),
    engineeringNotes: local('custom-lapel-pins'),
    about: pexels('34710653', 1800),
    contact: local('medals-keychains'),
    faq: local('challenge-coins'),
  },
  productCategories: {
    industrialProducts: local('custom-lapel-pins'),
    customSolutions: local('challenge-coins'),
    spareParts: local('medals-keychains'),
    servicePrograms: local('medals-keychains'),
    fallback: local('hero-metal-gifts'),
  },
} as const;
