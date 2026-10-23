import { fields } from '@keystatic/core';
import { r2ImageUrlField } from './r2-image-url-field';
import { visualSlots, knownVisualLocales } from '../data/site-visual-slots';

const labels = () => fields.array(fields.object({ locale: fields.select({ label: '语言', options: knownVisualLocales.map(value => ({ label: value, value })), defaultValue: 'en' }), text: fields.text({ label: '文字', validation: { length: { max: 500 } } }) }), { label: '对应语言文字（关闭的语言保留但不公开）', itemLabel: props => props.fields.locale.value });
const visual = () => fields.object({
  enabled: fields.checkbox({ label: '开放此位置供内容管理员编辑', defaultValue: false, description: '关闭后使用本站原图，保留已选图片；不隐藏页面区块。' }),
  image: r2ImageUrlField({ label: '桌面图片', description: '从本站图片池选择。首页建议宽约 2200px；空白时保留本站原图。' }),
  mobileImage: r2ImageUrlField({ label: '手机图片（选填）', description: '空白时使用桌面图片裁切。' }),
  alt: fields.text({ label: '英文图片说明', description: '装饰性背景留空；信息图片填写准确说明。', validation: { length: { max: 500 } } }),
  localizedAlts: labels(), focusX: fields.integer({ label: '水平焦点（0–100）', defaultValue: 50, validation: { min: 0, max: 100 } }), focusY: fields.integer({ label: '垂直焦点（0–100）', defaultValue: 50, validation: { min: 0, max: 100 } }),
});
export const siteVisualFields = () => ({
  version: fields.integer({ label: '数据版本', defaultValue: 1, validation: { min: 1, max: 1 } }),
  home: fields.object({ heroSlides: fields.array(fields.object({ key: fields.select({ label: '轮播位置', options: visualSlots.filter(slot => slot.group === 'home' && slot.supported).map(slot => ({ label: slot.title, value: slot.key.slice(5) })), defaultValue: 'primary' }), visual: visual() }), { label: '首页轮播图', itemLabel: props => props.fields.key.value }), center: visual(), primaryCta: fields.object({ href: fields.text({ label: '首屏主要按钮链接（选填）', description: '公开站内页面或已有页面内锚点；空白保留当前按钮。' }), labels: labels() }) }, { label: '首页 Hero' }),
  pages: fields.object(Object.fromEntries(visualSlots.filter(slot => slot.group === 'pages').map(slot => [slot.key.slice(6), fields.object(visual().fields, { label: slot.title })])), { label: '页面 Banner' }),
  categories: fields.array(fields.object({ key: fields.select({ label: '产品分类', options: visualSlots.filter(slot => slot.group === 'categories').map(slot => ({ label: slot.title, value: slot.key.slice(9) })), defaultValue: visualSlots.find(slot => slot.group === 'categories')!.key.slice(9) }), visual: visual() }), { label: '产品分类 Banner', itemLabel: props => props.fields.key.value }),
});
