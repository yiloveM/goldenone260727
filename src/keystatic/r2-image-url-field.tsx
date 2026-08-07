import { useRef, useState } from 'react';
import type { BasicFormField, FormFieldInputProps, FormFieldStoredValue } from '@keystatic/core';
import { R2ImagePicker } from './r2-image-picker';
import { useSyncedSurfaceTheme } from './use-synced-surface-theme';

type R2ImageUrlFieldOptions = {
  label: string;
  description?: string;
  pickerTitle?: string;
  defaultValue?: string;
  assetKind?: 'image' | 'document';
};

const parseStoredValue = (value: FormFieldStoredValue) => (typeof value === 'string' ? value : '');

const looksLikeImage = (url: string) => /\.(avif|gif|jpe?g|png|svg|webp)(?:[?#].*)?$/i.test(url) || url.includes('cdn.example.com/');

function R2ImageUrlInput({
  value,
  onChange,
  autoFocus,
  description,
  pickerTitle,
  assetKind = 'image',
}: FormFieldInputProps<string> & Pick<R2ImageUrlFieldOptions, 'description' | 'pickerTitle' | 'assetKind'>) {
  const rootRef = useRef<HTMLDivElement | null>(null);
  const [isPickerOpen, setIsPickerOpen] = useState(false);

  useSyncedSurfaceTheme(rootRef, 'r2');

  const trimmedValue = value.trim();
  const isDocument = assetKind === 'document';
  const canPreview = Boolean(trimmedValue) && (isDocument || looksLikeImage(trimmedValue));

  return (
    <div ref={rootRef} className="r2-url-field">
      {description ? <p className="r2-url-field__description">{description}</p> : null}
      <div className="r2-url-field__control">
        <input
          autoFocus={autoFocus}
          type="url"
          value={value}
          placeholder="https://cdn.example.com/..."
          onChange={event => onChange(event.currentTarget.value)}
        />
        {canPreview ? (
          <button type="button" className="r2-url-field__preview" onClick={() => setIsPickerOpen(true)} aria-label="閲嶆柊閫夋嫨鍥剧墖">
            {isDocument ? <span className="r2-url-field__pdf-icon" aria-hidden="true">PDF</span> : <img src={trimmedValue} alt="" loading="lazy" />}
          </button>
        ) : (
          <span className="r2-url-field__preview r2-url-field__preview--empty" aria-hidden="true" />
        )}
        <button type="button" onClick={() => setIsPickerOpen(true)}>
          閫夋嫨鍥剧墖
        </button>
      </div>
      <R2ImagePicker
        isOpen={isPickerOpen}
        title={pickerTitle || '閫夋嫨鍥剧墖'}
        assetKind={assetKind}
        onClose={() => setIsPickerOpen(false)}
        onSelect={url => {
          onChange(url);
          setIsPickerOpen(false);
        }}
      />
      <style>{`
        .r2-url-field {
          --r2-bg: #ffffff;
          --r2-panel: #ffffff;
          --r2-muted-bg: #f6f7f9;
          --r2-hover: #f8fafc;
          --r2-thumb: #f2f4f7;
          --r2-border: #d9dee7;
          --r2-border-soft: #e1e4e8;
          --r2-text: #172033;
          --r2-muted: #667085;
          color: var(--r2-text);
          display: grid;
          gap: 8px;
        }

        .r2-url-field__description {
          color: var(--r2-muted);
          font-size: 12px;
          line-height: 1.5;
          margin: 0;
        }

        .r2-url-field__control {
          display: grid;
          align-items: center;
          gap: 8px;
          grid-template-columns: minmax(0, 1fr) 74px auto;
        }

        .r2-url-field input {
          background: var(--r2-panel);
          border: 1px solid var(--r2-border);
          border-radius: 6px;
          color: var(--r2-text);
          font: inherit;
          min-height: 36px;
          min-width: 0;
          padding: 7px 10px;
        }

        .r2-url-field button {
          background: var(--r2-panel);
          border: 1px solid var(--r2-border);
          border-radius: 6px;
          color: var(--r2-text);
          cursor: pointer;
          font: inherit;
          min-height: 36px;
          padding: 7px 10px;
        }

        .r2-url-field button:hover {
          border-color: #0e7490;
          color: #155e75;
        }

        .r2-url-field button:disabled {
          cursor: not-allowed;
          opacity: 0.52;
        }

        .r2-url-field__preview {
          align-items: center;
          background: var(--r2-thumb);
          border: 1px solid var(--r2-border-soft);
          border-radius: 6px;
          display: flex;
          height: 40px;
          justify-content: center;
          overflow: hidden;
          padding: 0;
          width: 74px;
        }

        .r2-url-field__preview img {
          display: block;
          height: 100%;
          object-fit: contain;
          width: 100%;
        }
        .r2-url-field__pdf-icon {
          align-items: center;
          background: #0f766e;
          color: #fff;
          display: inline-flex;
          font-size: 11px;
          font-weight: 800;
          height: 100%;
          justify-content: center;
          width: 100%;
        }

        .r2-url-field__preview--empty {
          cursor: default;
          opacity: 0.64;
        }

        @media (max-width: 760px) {
          .r2-url-field__control {
            grid-template-columns: minmax(0, 1fr) 74px;
          }

          .r2-url-field__control > button:not(.r2-url-field__preview) {
            grid-column: 1 / -1;
          }
        }

        @media (prefers-color-scheme: dark) {
          .r2-url-field {
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

export const r2ImageUrlField = ({
  label,
  description,
  pickerTitle,
  defaultValue = '',
}: R2ImageUrlFieldOptions): BasicFormField<string> => ({
  kind: 'form',
  label,
  Input: props => <R2ImageUrlInput {...props} description={description} pickerTitle={pickerTitle || label} assetKind="image" />,
  defaultValue: () => defaultValue,
  parse: parseStoredValue,
  serialize: value => ({ value: value.trim() }),
  validate: value => value,
  reader: {
    parse: parseStoredValue,
  },
});


export const r2DocumentUrlField = ({
  label,
  description,
  pickerTitle,
  defaultValue = '',
}: R2ImageUrlFieldOptions): BasicFormField<string> => ({
  kind: 'form',
  label,
  Input: props => <R2ImageUrlInput {...props} description={description} pickerTitle={pickerTitle || label} assetKind="document" />,
  defaultValue: () => defaultValue,
  parse: parseStoredValue,
  serialize: value => ({ value: value.trim() }),
  validate: value => value,
  reader: {
    parse: parseStoredValue,
  },
});
