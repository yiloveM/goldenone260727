export const articleCategoryIds = ['company-news', 'technical-articles', 'other-articles'];
const labels = {
  en: ['Company News', 'Technical Articles', 'Other Articles'], zh: ['公司新闻动态', '技术文章', '其它文章'],
  es: ['Noticias de la empresa', 'Artículos técnicos', 'Otros artículos'], fr: ['Actualités de l’entreprise', 'Articles techniques', 'Autres articles'],
  pt: ['Notícias da empresa', 'Artigos técnicos', 'Outros artigos'], ru: ['Новости компании', 'Технические статьи', 'Другие статьи'],
  ar: ['أخبار الشركة', 'مقالات تقنية', 'مقالات أخرى'], hi: ['कंपनी समाचार', 'तकनीकी लेख', 'अन्य लेख'],
  bn: ['কোম্পানির খবর', 'প্রযুক্তিগত নিবন্ধ', 'অন্যান্য নিবন্ধ'], ur: ['کمپنی کی خبریں', 'تکنیکی مضامین', 'دیگر مضامین'],
  de: ['Unternehmensnachrichten', 'Fachartikel', 'Weitere Artikel'], tr: ['Şirket Haberleri', 'Teknik Makaleler', 'Diğer Makaleler'],
  fil: ['Balita ng Kumpanya', 'Mga Teknikal na Artikulo', 'Iba Pang Artikulo'], ko: ['회사 소식', '기술 자료', '기타 기사'],
  uz: ['Kompaniya yangiliklari', 'Texnik maqolalar', 'Boshqa maqolalar'], ja: ['企業ニュース', '技術記事', 'その他の記事'],
  ms: ['Berita Syarikat', 'Artikel Teknikal', 'Artikel Lain'], nl: ['Bedrijfsnieuws', 'Technische artikelen', 'Overige artikelen'],
  el: ['Εταιρικά νέα', 'Τεχνικά άρθρα', 'Άλλα άρθρα'], th: ['ข่าวสารบริษัท', 'บทความทางเทคนิค', 'บทความอื่น ๆ'],
};
const legacy = { 'technical article': 'technical-articles', 'technical articles': 'technical-articles', 'technical guides': 'technical-articles', company: 'company-news', 'international growth': 'company-news' };
// Existing records remain readable. New writes must use requireArticleCategory.
export function canonicalArticleCategory(value, fallback = 'other-articles') {
  const id = String(value || '').trim();
  return articleCategoryIds.includes(id) ? id : legacy[id.toLowerCase()] || fallback;
}
export function requireArticleCategory(value) {
  if (!articleCategoryIds.includes(value)) throw new Error('请选择公司新闻动态、技术文章或其它文章。');
  return value;
}
export function articleCategoryLabel(value, locale = 'en') {
  return (labels[locale] || labels.en)[articleCategoryIds.indexOf(canonicalArticleCategory(value))];
}
export const articleCategoryOptions = locale => articleCategoryIds.map(value => ({ value, label: articleCategoryLabel(value, locale) }));
