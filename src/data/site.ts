import { siteImages } from './backgroundImages';
import { industryProfile, publicSiteCopy } from './industry-profile';

export const siteInfo = {
  name: industryProfile.brand.name,
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
    title: 'Buyer-first product clarity',
    label: publicSiteCopy.positioning,
    image: homePlaceholderImages.primaryOffer,
  },
  {
    title: 'Technical confidence',
    label: 'Clear applications, specifications, and evidence for evaluation.',
    image: homePlaceholderImages.operations,
  },
  {
    title: 'International delivery',
    label: 'Built for global commercial and project conversations.',
    image: homePlaceholderImages.quality,
  },
  {
    title: 'Lifecycle partnership',
    label: 'From initial evaluation to long-term support.',
    image: homePlaceholderImages.delivery,
  },
];

export const factoryGallery = [
  { title: 'Strategy and sales workspace', image: homePlaceholderImages.strategyRoom },
  { title: 'Product content review', image: homePlaceholderImages.productReview },
  { title: 'Operations dashboard', image: homePlaceholderImages.operationsDesk },
  { title: 'Quality workflow', image: homePlaceholderImages.qualityWorkflow },
  { title: 'Inventory and logistics', image: homePlaceholderImages.warehouse },
  { title: 'Client workshop', image: homePlaceholderImages.clientWorkshop },
];

export const faqs = [
  {
    question: `What does ${siteInfo.name} offer?`,
    answer:
      'Use the published catalog, applications, and technical details to understand the available offerings. Contact the team with project, market, and specification requirements for a precise response.',
  },
  {
    question: 'How can a buyer request a quotation or technical discussion?',
    answer:
      'Share the company, target market, product or service scope, quantities, timeline, and any required standards through the inquiry form.',
  },
  {
    question: 'How are technical and commercial claims verified?',
    answer:
      'Only verified specifications, certifications, application guidance, and commercial commitments should be published. Ask the supplier team for current documentation before making a purchase decision.',
  },
  {
    question: 'Which markets and languages does the business support?',
    answer:
      'Review the contact page for the current market coverage and language support, then send your project requirements for a tailored response.',
  },
];
