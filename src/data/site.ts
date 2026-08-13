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
    title: 'Lapel Pin & Badge',
    label: 'Enamel style, metal finish, backing, and presentation',
    image: '/images/metal-gifts/lapel-pin-collection-v2.webp',
    keywords: ['custom lapel pins', 'enamel badges', 'metal pin manufacturer'],
  },
  {
    title: 'Medal',
    label: 'Construction, ribbon, relief, finish, and event presentation',
    image: '/images/metal-gifts/medal-collection-v2.webp',
    keywords: ['custom medals', 'sports medals', 'award medal supplier'],
  },
  {
    title: 'Challenge Coin',
    label: 'Dimensions, relief, edge, finish, and front/reverse design',
    image: '/images/metal-gifts/challenge-coin-collection-v2.webp',
    keywords: ['custom challenge coins', '3D challenge coins', 'military coins'],
  },
  {
    title: 'Key Chain',
    label: 'Metal, enamel, leather, PU, ring, chain, and packaging formats',
    image: '/images/metal-gifts/keychain-collection-v2.webp',
    keywords: ['custom keychains', 'metal keychains', 'promotional keyrings'],
  },
  {
    title: 'Golf Accessories & Tools',
    label: 'Custom golf accessories for events, clubs, and promotional programs',
    image: '/images/metal-gifts/medals-keychains.webp',
    keywords: ['custom golf accessories', 'golf tools', 'golf event gifts'],
  },
  {
    title: 'Belt Buckle',
    label: 'Shape, relief, plating, texture, color, and fastening direction',
    image: '/images/metal-gifts/challenge-coins.webp',
    keywords: ['custom belt buckles', 'metal buckles', 'promotional buckles'],
  },
  {
    title: 'Metal & Wooden Plaque',
    label: 'Recognition, presentation, display, and commemorative formats',
    image: '/images/metal-gifts/customization-story-v2.webp',
    keywords: ['custom plaques', 'wooden plaques', 'metal awards'],
  },
  {
    title: 'Fridge Magnets',
    label: 'Custom shapes, color, relief, and retail presentation',
    image: '/images/metal-gifts/custom-lapel-pins.webp',
    keywords: ['custom fridge magnets', 'metal magnets', 'souvenir magnets'],
  },
  {
    title: 'More Metal Crafts',
    label: 'Flexible custom formats for distinctive project requirements',
    image: '/images/metal-gifts/hero-metal-gifts.webp',
    keywords: ['custom metal crafts', 'metal gift supplier', 'OEM metal gifts'],
  },
  {
    title: 'Promotion Gift',
    label: 'Campaign, event, merchandise, and branded distribution programs',
    image: '/images/metal-gifts/hero-collection-v2.webp',
    keywords: ['custom promotional gifts', 'branded merchandise', 'corporate gifts'],
  },
];

export const factoryGallery = [
  { title: 'Production workshop', image: '/images/factory/coloring.jpg' },
  { title: 'Factory floor', image: '/images/factory/mold-adjustment.jpg' },
  { title: 'Metalworking', image: '/images/factory/die-casting-workshop.jpg' },
  { title: 'Warehouse operations', image: '/images/factory/laser-engraving.jpg' },
  { title: 'Industrial equipment', image: '/images/factory/polishing-department.jpg' },
  { title: 'Storage and fulfillment', image: '/images/factory/warehouse.jpg' },
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
