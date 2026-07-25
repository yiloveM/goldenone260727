const hiddenSpecLabels = new Set(['Target Audience']);
const publicSpecLabelMap = new Map([
  ['Product family', 'Product range'],
  ['Product Family', 'Product range'],
]);

export const isPublicProductSpec = (label: string) => !hiddenSpecLabels.has(String(label || '').trim());
export const normalizePublicProductSpecLabel = (label: string) =>
  publicSpecLabelMap.get(String(label || '').trim()) || label;

export const publicProductSpecs = <T extends { label: string }>(specs: T[]) =>
  specs
    .filter(spec => isPublicProductSpec(spec.label))
    .map(spec => ({ ...spec, label: normalizePublicProductSpecLabel(spec.label) }));
