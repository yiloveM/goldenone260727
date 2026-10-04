import { fields } from '@keystatic/core';
import { resolveProductEditorPolicy } from '../lib/product-editor.mjs';

export const productClassificationFields = (settings: { offeringType?: string; modelStrategy?: string } = {}) => {
  const policy = resolveProductEditorPolicy(settings);
  return {
    offeringType: fields.select({
      label: '内容类型',
      options: [
        { label: '实物产品', value: 'physical-product' },
        { label: '服务', value: 'service' },
        { label: '工程解决方案', value: 'solution' },
      ],
      defaultValue: policy.offeringType as 'physical-product' | 'service' | 'solution',
    }),
    modelStrategy: fields.select({
      label: '型号与参数结构',
      options: [
        { label: '单一型号', value: 'single-model' },
        { label: '多型号系列', value: 'series' },
        { label: '按订单配置', value: 'configurable' },
        { label: '不适用型号', value: 'not-applicable' },
      ],
      defaultValue: policy.modelStrategy as 'single-model' | 'series' | 'configurable' | 'not-applicable',
    }),
  };
};
