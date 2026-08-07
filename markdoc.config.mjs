import { component, defineMarkdocConfig } from '@astrojs/markdoc/config';

export default defineMarkdocConfig({
  tags: {
    r2Image: {
      render: component('./src/components/R2ContentImage.astro'),
      selfClosing: true,
      attributes: {
        src: { type: String, required: true },
        alt: { type: String },
        caption: { type: String },
      },
    },
    r2Document: {
      render: component('./src/components/R2ContentDocument.astro'),
      selfClosing: true,
      attributes: {
        src: { type: String, required: true },
        title: { type: String },
        description: { type: String },
      },
    },
  },
});
