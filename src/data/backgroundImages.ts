const image = (id: string, width = 1600) =>
  `https://images.unsplash.com/${id}?auto=format&fit=crop&w=${width}&q=82`;

export const siteImages = {
  brand: {
    logo: '/template-logo.svg',
    icon: '/template-icon.svg',
  },
  homeHero: {
    rippleDesktop: image('photo-1497366811353-6870744d04b2', 2200),
    rippleMobile: image('photo-1497366754035-f200968a6e72', 1400),
    center: image('photo-1551434678-e076c223a692', 1400),
    floatingProducts: [
      image('photo-1556761175-b413da4baf72', 1200),
      image('photo-1552664730-d307ca884978', 1200),
      image('photo-1556761175-4b46a572b786', 1200),
    ],
  },
  homeBackgrounds: {
    productWorldsIntro: image('photo-1500530855697-b586d89ba3ee', 2200),
    productCategoryTransitionDesktop: image('photo-1497366811353-6870744d04b2', 2200),
    productCategoryTransitionMobile: image('photo-1497366754035-f200968a6e72', 1400),
    hotSalesBand: image('photo-1556761175-4b46a572b786', 2200),
    featuredEquipment: image('photo-1551434678-e076c223a692', 2200),
    factoryCapability: image('photo-1497366754035-f200968a6e72', 2200),
  },
  homeShowcase: {
    primaryOffer: image('photo-1556761175-b413da4baf72'),
    operations: image('photo-1552664730-d307ca884978'),
    quality: image('photo-1556761175-4b46a572b786'),
    delivery: image('photo-1521791136064-7986c2920216'),
    partnership: image('photo-1521791136064-7986c2920216'),
  },
  factoryGallery: {
    strategyRoom: image('photo-1497366811353-6870744d04b2', 1200),
    productReview: image('photo-1552664730-d307ca884978', 1200),
    operationsDesk: image('photo-1551434678-e076c223a692', 1200),
    qualityWorkflow: image('photo-1556761175-4b46a572b786', 1200),
    warehouse: image('photo-1586528116311-ad8dd3c8310d', 1200),
    clientWorkshop: image('photo-1556761175-b413da4baf72', 1200),
  },
  pageBanners: {
    productsCatalog: image('photo-1556761175-b413da4baf72', 1800),
    engineeringNotes: image('photo-1497366811353-6870744d04b2', 1800),
    about: image('photo-1556761175-4b46a572b786', 1800),
    contact: image('photo-1521791136064-7986c2920216', 1800),
    faq: image('photo-1552664730-d307ca884978', 1800),
  },
  productCategories: {
    industrialProducts: image('photo-1556761175-b413da4baf72', 1400),
    customSolutions: image('photo-1552664730-d307ca884978', 1400),
    spareParts: image('photo-1586528116311-ad8dd3c8310d', 1400),
    servicePrograms: image('photo-1551434678-e076c223a692', 1400),
    fallback: image('photo-1556761175-4b46a572b786', 1400),
  },
} as const;
