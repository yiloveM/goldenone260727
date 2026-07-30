import { siteImages } from './backgroundImages';
import { industryProfile } from './industry-profile';

export const siteInfo = {
  name: industryProfile.brand.name,
  legalName: industryProfile.brand.legalName,
  tagline: industryProfile.brand.tagline,
  description: industryProfile.brand.description,
  email: industryProfile.brand.email,
  phone: industryProfile.brand.phone,
  whatsapp: industryProfile.brand.whatsapp,
  address: industryProfile.brand.address,
  factoryAddress: industryProfile.brand.factoryAddress,
  x: industryProfile.brand.socialProfiles.find(url => /x\.com|twitter\.com/i.test(url)) || '',
  pinterest: industryProfile.brand.socialProfiles.find(url => /pinterest\.com/i.test(url)) || '',
};

const socialIcon = (url: string) => {
  if (/facebook\.com/i.test(url)) return { name: 'Facebook', icon: '/icons/facebook.svg' };
  if (/instagram\.com/i.test(url)) return { name: 'Instagram', icon: '/icons/instagram.svg' };
  if (/youtube\.com|youtu\.be/i.test(url)) return { name: 'YouTube', icon: '/icons/youtube.svg' };
  if (/x\.com|twitter\.com/i.test(url)) return { name: 'X', icon: '/icons/x.svg' };
  if (/pinterest\.com/i.test(url)) return { name: 'Pinterest', icon: '/icons/pinterest.svg' };
  return { name: 'Social profile', icon: '/icons/x.svg' };
};

export const socialLinks = industryProfile.brand.socialProfiles
  .filter(url => /^https:\/\//i.test(url))
  .map(href => ({ ...socialIcon(href), href }));

export const homePlaceholderImages = {
  ...siteImages.homeShowcase,
  ...siteImages.factoryGallery,
};

export const pageImages = siteImages.pageBanners;

export const brandShowcase = [
  {
    title: 'Custom Lapel Pins',
    label: 'Enamel style, metal finish, backing, and presentation',
    image: homePlaceholderImages.primaryOffer,
  },
  {
    title: 'Challenge Coins',
    label: 'Dimensions, relief, edge, finish, and front/reverse design',
    image: homePlaceholderImages.operations,
  },
  {
    title: 'Sports Medals',
    label: 'Medal construction, ribbon specification, finish, and packaging',
    image: homePlaceholderImages.quality,
  },
  {
    title: 'Custom Keychains',
    label: 'Metal, enamel, leather, PU, ring, chain, and packaging formats',
    image: homePlaceholderImages.delivery,
  },
];

export const factoryGallery = [
  { title: 'Enamel and surface detail', image: homePlaceholderImages.strategyRoom },
  { title: 'Coin relief and edge profile', image: homePlaceholderImages.productReview },
  { title: 'Medal, ribbon, and attachment', image: homePlaceholderImages.operationsDesk },
  { title: 'Engraved metal detail', image: homePlaceholderImages.qualityWorkflow },
  { title: 'Finish and format comparison', image: homePlaceholderImages.warehouse },
  { title: 'Pins, dies, and color direction', image: homePlaceholderImages.clientWorkshop },
];

export const faqs = [
  {
    question: `What does ${siteInfo.name} offer?`,
    answer:
      'The public catalog is structured for custom lapel pins, challenge coins, sports medals, and keychains. Published product pages will show only the formats and options confirmed by the company.',
  },
  {
    question: 'What should a buyer include in a custom quotation request?',
    answer:
      'Share the intended product, artwork, dimensions, finish, attachment or ribbon, packaging, quantity, delivery destination, and target timeline. Leave any unknown fields open for discussion.',
  },
  {
    question: 'Can buyers compare finish and construction options before ordering?',
    answer:
      'Use the category and product pages to compare published materials, enamel or relief styles, plating, hardware, and packaging. Confirm the final specification in the approved artwork and quotation.',
  },
  {
    question: 'Are prices, minimum quantities, and lead times shown online?',
    answer:
      'These values should be published only when they are current and verified. Until then, request a project-specific quotation with quantity, specification, packaging, destination, and timing details.',
  },
];
