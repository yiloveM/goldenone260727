import { useRef, useState } from 'react';
import { fields } from '@keystatic/core';
import { block } from '@keystatic/core/content-components';
import { R2ImagePicker } from './r2-image-picker';
import { r2DocumentUrlField, r2ImageUrlField } from './r2-image-url-field';
import { useSyncedSurfaceTheme } from './use-synced-surface-theme';

type R2ImageValue = {
  src: string;
  alt: string;
  caption: string;
};

function R2ImageNodeView({
  value,
  onChange,
  isSelected,
}: {
  value: R2ImageValue;
  onChange(value: R2ImageValue): void;
  onRemove(): void;
  isSelected: boolean;
}) {
  const rootRef = useRef<HTMLDivElement | null>(null);
  const [isPickerOpen, setIsPickerOpen] = useState(false);

  useSyncedSurfaceTheme(rootRef, 'r2');

  return (
    <div ref={rootRef} className={`r2-markdoc-image${isSelected ? ' is-selected' : ''}`}>
      {value.src ? (
        <button type="button" className="r2-markdoc-image__preview" onClick={() => setIsPickerOpen(true)}>
          <img src={value.src} alt={value.alt || ''} loading="lazy" />
        </button>
      ) : (
        <button type="button" className="r2-markdoc-image__empty" onClick={() => setIsPickerOpen(true)}>
          从图片池选择正文图片
        </button>
      )}
      <div className="r2-markdoc-image__meta">
        <strong>{value.alt || 'R2 图片'}</strong>
        {value.caption ? <span>{value.caption}</span> : <span>点击图片可重新选择，字段面板可编辑 alt 和说明文字。</span>}
      </div>
      <R2ImagePicker
        isOpen={isPickerOpen}
        title="选择正文图片"
        onClose={() => setIsPickerOpen(false)}
        onSelect={url => {
          onChange({ ...value, src: url });
          setIsPickerOpen(false);
        }}
      />
      <style>{`
        .r2-markdoc-image {
          --r2-bg: #ffffff;
          --r2-panel: #ffffff;
          --r2-muted-bg: #f6f7f9;
          --r2-hover: #f8fafc;
          --r2-thumb: #f2f4f7;
          --r2-border: #d9dee7;
          --r2-border-soft: #e1e4e8;
          --r2-text: #172033;
          --r2-muted: #667085;
          background: var(--r2-muted-bg);
          border: 1px solid var(--r2-border-soft);
          border-radius: 10px;
          color: var(--r2-text);
          display: grid;
          gap: 10px;
          padding: 10px;
        }

        .r2-markdoc-image.is-selected {
          border-color: #0e7490;
          box-shadow: 0 0 0 3px rgba(14, 116, 144, 0.16);
        }

        .r2-markdoc-image button {
          background: var(--r2-panel);
          border: 1px solid var(--r2-border);
          border-radius: 8px;
          color: var(--r2-text);
          cursor: pointer;
          font: inherit;
          overflow: hidden;
          padding: 0;
        }

        .r2-markdoc-image__preview {
          align-items: center;
          display: flex;
          height: 240px;
          justify-content: center;
          width: 100%;
        }

        .r2-markdoc-image__preview img {
          display: block;
          height: 100%;
          object-fit: contain;
          width: 100%;
        }

        .r2-markdoc-image__empty {
          min-height: 132px;
          padding: 18px;
          width: 100%;
        }

        .r2-markdoc-image__meta {
          display: grid;
          gap: 4px;
        }

        .r2-markdoc-image__meta strong {
          font-size: 13px;
        }

        .r2-markdoc-image__meta span {
          color: var(--r2-muted);
          font-size: 12px;
          line-height: 1.45;
        }

        @media (prefers-color-scheme: dark) {
          .r2-markdoc-image {
            --r2-bg: #242424;
            --r2-panel: #2a2a2a;
            --r2-muted-bg: #2f2f2f;
            --r2-hover: #333333;
            --r2-thumb: #303030;
            --r2-border: #464646;
            --r2-border-soft: #3a3a3a;
            --r2-text: #f2f2f2;
            --r2-muted: #b8b8b8;
          }
        }
      `}</style>
    </div>
  );
}

export const r2MarkdocComponents = {
  r2Image: block({
    label: 'R2 图片',
    description: '从图片池选择图片，适合插入产品详情正文或文章正文。',
    schema: {
      src: r2ImageUrlField({
        label: '图片 URL',
        pickerTitle: '选择正文图片',
        description: '点击“选择图片”后从图片池缩略图中选用。',
      }),
      alt: fields.text({ label: 'Alt 文本', defaultValue: '' }),
      caption: fields.text({ label: '图片说明', multiline: true, defaultValue: '' }),
    },
    NodeView: R2ImageNodeView,
  }),
  r2Document: block({
    label: 'R2 PDF \u6587\u6863',
    description: '\u4ece R2 \u6587\u4ef6\u6c60\u9009\u62e9 PDF\uff0c\u53ef\u4ee5\u63d2\u5165\u4ea7\u54c1\u8be6\u60c5\u6216\u6587\u7ae0\u6b63\u6587\u3002',
    schema: {
      src: r2DocumentUrlField({
        label: 'PDF URL',
        pickerTitle: '\u9009\u62e9 R2 PDF',
        description: '\u53ea\u663e\u793a R2 \u4e2d\u7684 PDF \u6587\u4ef6\u3002',
      }),
      title: fields.text({ label: '\u6587\u6863\u6807\u9898', defaultValue: '' }),
      description: fields.text({ label: '\u6587\u6863\u8bf4\u660e', multiline: true, defaultValue: '' }),
    },
  }),
};
