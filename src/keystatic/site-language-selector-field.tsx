import { useEffect, useRef, useState } from 'react';
import { fields, type BasicFormField, type FormFieldInputProps } from '@keystatic/core';
import { useSyncedSurfaceTheme } from './use-synced-surface-theme';

type BulkMode = 'all' | 'none' | 'invert';
type LanguageStateDetail = { code: string; selected: boolean };
type LanguageBulkDetail = { mode: BulkMode };
type CheckboxInput = BasicFormField<boolean>['Input'];

const languageStateEvent = 'site-language:state';
const languageBulkEvent = 'site-language:bulk';
const languageQueryEvent = 'site-language:query';

const emitLanguageState = (code: string, selected: boolean) => {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent<LanguageStateDetail>(languageStateEvent, {
    detail: { code, selected },
  }));
};

function SiteLanguageCheckboxInput({
  code,
  BaseInput,
  ...props
}: FormFieldInputProps<boolean> & { code: string; BaseInput: CheckboxInput }) {
  const valueRef = useRef(props.value);
  const onChangeRef = useRef(props.onChange);

  valueRef.current = props.value;
  onChangeRef.current = props.onChange;

  useEffect(() => {
    emitLanguageState(code, valueRef.current);

    const applyBulkSelection = (event: Event) => {
      const { mode } = (event as CustomEvent<LanguageBulkDetail>).detail;
      const nextValue = mode === 'all' ? true : mode === 'none' ? false : !valueRef.current;
      valueRef.current = nextValue;
      onChangeRef.current(nextValue);
      emitLanguageState(code, nextValue);
    };
    const reportSelection = () => emitLanguageState(code, valueRef.current);

    window.addEventListener(languageBulkEvent, applyBulkSelection);
    window.addEventListener(languageQueryEvent, reportSelection);
    return () => {
      window.removeEventListener(languageBulkEvent, applyBulkSelection);
      window.removeEventListener(languageQueryEvent, reportSelection);
    };
  }, [code]);

  return (
    <BaseInput
      {...props}
      onChange={selected => {
        valueRef.current = selected;
        props.onChange(selected);
        emitLanguageState(code, selected);
      }}
    />
  );
}

function SiteLanguageBulkActionsInput({ localeCodes }: { localeCodes: readonly string[] }) {
  const rootRef = useRef<HTMLDivElement | null>(null);
  const [selection, setSelection] = useState<Record<string, boolean>>({});
  const [invertControl, setInvertControl] = useState(false);

  useSyncedSurfaceTheme(rootRef, 'language');

  useEffect(() => {
    const updateSelection = (event: Event) => {
      const { code, selected } = (event as CustomEvent<LanguageStateDetail>).detail;
      if (!localeCodes.includes(code)) return;
      setSelection(current => current[code] === selected ? current : { ...current, [code]: selected });
    };

    window.addEventListener(languageStateEvent, updateSelection);
    window.dispatchEvent(new CustomEvent(languageQueryEvent));
    return () => window.removeEventListener(languageStateEvent, updateSelection);
  }, [localeCodes]);

  const selectedCount = localeCodes.filter(code => selection[code] === true).length;
  const allSelected = selectedCount === localeCodes.length;
  const dispatchBulkSelection = (mode: BulkMode) => {
    window.dispatchEvent(new CustomEvent<LanguageBulkDetail>(languageBulkEvent, { detail: { mode } }));
  };

  return (
    <div ref={rootRef} className="language-bulk">
      <div className="language-bulk__controls">
        <label>
          <input
            type="checkbox"
            checked={allSelected}
            onChange={event => dispatchBulkSelection(event.currentTarget.checked ? 'all' : 'none')}
          />
          <span>全选全部目标语言</span>
        </label>
        <label>
          <input
            type="checkbox"
            checked={invertControl}
            onChange={event => {
              setInvertControl(event.currentTarget.checked);
              dispatchBulkSelection('invert');
            }}
          />
          <span>反选当前选择</span>
        </label>
        <strong>已选择 {selectedCount} / {localeCodes.length}</strong>
      </div>
      <p>这里只控制下方真实语言复选框，不会在语言配置文件中增加额外字段。</p>
      <style>{`
        .language-bulk {
          --language-panel: #f7fafc;
          --language-border: #d8e1e8;
          --language-text: #172033;
          --language-muted: #667085;
          color: var(--language-text);
          grid-column: 1 / -1;
        }
        .language-bulk__controls {
          align-items: center;
          background: var(--language-panel);
          border: 1px solid var(--language-border);
          border-radius: 6px;
          display: flex;
          flex-wrap: wrap;
          gap: 12px 22px;
          padding: 14px 16px;
        }
        .language-bulk label {
          align-items: center;
          cursor: pointer;
          display: inline-flex;
          font-size: 14px;
          font-weight: 700;
          gap: 8px;
        }
        .language-bulk input {
          accent-color: #0e98b9;
          height: 17px;
          margin: 0;
          width: 17px;
        }
        .language-bulk strong {
          color: #087f9b;
          font-size: 13px;
          margin-left: auto;
        }
        .language-bulk p {
          color: var(--language-muted);
          font-size: 12px;
          line-height: 1.6;
          margin: 7px 0 0;
        }
        @media (max-width: 680px) {
          .language-bulk__controls {
            align-items: flex-start;
            display: grid;
          }
          .language-bulk strong {
            margin-left: 0;
          }
        }
        @media (prefers-color-scheme: dark) {
          .language-bulk {
            --language-panel: #292d32;
            --language-border: #454b53;
            --language-text: #f3f4f6;
            --language-muted: #b7bec8;
          }
        }
        [data-theme='dark'] .language-bulk,
        [data-color-scheme='dark'] .language-bulk,
        [data-mode='dark'] .language-bulk,
        .dark .language-bulk {
          --language-panel: #292d32;
          --language-border: #454b53;
          --language-text: #f3f4f6;
          --language-muted: #b7bec8;
        }
      `}</style>
    </div>
  );
}

export const siteLanguageCheckboxField = ({
  code,
  label,
  description,
  defaultValue,
}: {
  code: string;
  label: string;
  description?: string;
  defaultValue: boolean;
}): BasicFormField<boolean> => {
  const field = fields.checkbox({ label, description, defaultValue });
  const BaseInput = field.Input;
  return {
    ...field,
    Input: props => <SiteLanguageCheckboxInput {...props} code={code} BaseInput={BaseInput} />,
  };
};

export const siteLanguageBulkActionsField = ({
  localeCodes,
  label = '批量选择语言',
}: {
  localeCodes: readonly string[];
  label?: string;
}): BasicFormField<string> => ({
  kind: 'form',
  label,
  Input: () => <SiteLanguageBulkActionsInput localeCodes={localeCodes} />,
  defaultValue: () => '',
  parse: () => '',
  serialize: () => ({ value: undefined }),
  validate: value => value,
  reader: {
    parse: () => '',
  },
});
