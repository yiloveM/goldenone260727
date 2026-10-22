import { promptDialog, adminDialog } from '../../lib/admin-dialog.mjs';
import { safeContentUrl } from '../../lib/content-links.mjs';

export function installRichText(context) {
  const richEditors = new Map();

  const richEditorBlocks = [
    ['P', 'Paragraph'],
    ['H2', 'Heading 2'],
    ['H3', 'Heading 3'],
    ['H4', 'Heading 4'],
    ['BLOCKQUOTE', 'Quote'],
  ];

  const parseMarkdocImageAttrs = value => {
    const attrs = {};
    String(value || '').replace(/([A-Za-z0-9_-]+)="([^"]*)"/g, (_, key, attrValue) => {
      attrs[key] = attrValue;
      return '';
    });
    return attrs;
  };

  const renderRichInline = (value, depth = 0) => {
    const raw = String(value || '');
    if (depth > 8) return context.escapeHtml(raw);
    const styled = text => context.escapeHtml(text)
      .replace(/`([^`]+)`/g, '<code>$1</code>')
      .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
      .replace(/(^|[^*])\*([^*\n]+)\*(?!\*)/g, '$1<em>$2</em>');
    let result = '', cursor = 0;
    const starts = /\[([^\]\n]+)\]\(/g;
    let match;
    while ((match = starts.exec(raw))) {
      let index = starts.lastIndex, balance = 1;
      for (; index < raw.length && balance; index++) {
        if (raw[index] === '\\') { index++; continue; }
        if (raw[index] === '(') balance++;
        if (raw[index] === ')') balance--;
      }
      if (balance) continue;
      const destination = raw.slice(starts.lastIndex, index - 1).replace(/\\([()])/g, '$1');
      const href = safeContentUrl(destination);
      result += styled(raw.slice(cursor, match.index));
      result += href ? `<a href="${context.escapeHtml(href)}">${renderRichInline(match[1], depth + 1)}</a>` : renderRichInline(match[1], depth + 1);
      cursor = index; starts.lastIndex = index;
    }
    return result + styled(raw.slice(cursor));
  };

  const richImageHtml = ({ src = '', alt = '', caption = '', markdoc = false }) => `
    <figure data-rich-type="image" ${markdoc ? 'data-rich-markdoc="image"' : ''}>
      <img src="${context.escapeHtml(safeContentUrl(src, true))}" alt="${context.escapeHtml(alt)}" loading="lazy" decoding="async" />
      <figcaption>${context.escapeHtml(caption || alt || '')}</figcaption>
    </figure>
  `;

  const richDocumentHtml = ({ src = '', title = '' }) =>
    `<p data-rich-type="document"><a href="${context.escapeHtml(safeContentUrl(src, true))}" target="_blank" rel="noopener">${context.escapeHtml(title || 'PDF document')}</a></p>`;

  const markdownToRichHtml = value => {
    const lines = String(value || '').replace(/\r\n/g, '\n').split('\n');
    const output = [];
    let paragraph = [];
    let list = [];
    let orderedList = [];
    let table = [];
    let codeBlock = null;

    const flushParagraph = () => {
      const text = paragraph.join(' ').trim();
      if (text) output.push(`<p>${renderRichInline(text)}</p>`);
      paragraph = [];
    };
    const flushList = () => {
      if (list.length) output.push(`<ul>${list.map(item => `<li>${renderRichInline(item)}</li>`).join('')}</ul>`);
      list = [];
    };
    const flushOrderedList = () => {
      if (orderedList.length) output.push(`<ol>${orderedList.map(item => `<li>${renderRichInline(item)}</li>`).join('')}</ol>`);
      orderedList = [];
    };
    const flushTable = () => {
      const rows = table
        .filter(line => !/^\|\s*:?-{2,}/.test(line.trim()))
        .map(line => line.trim().replace(/^\||\|$/g, '').split('|').map(cell => cell.trim()));
      if (rows.length) {
        const [head, ...body] = rows;
        output.push(`<table><thead><tr>${head.map(cell => `<th>${renderRichInline(cell)}</th>`).join('')}</tr></thead><tbody>${body
          .map(row => `<tr>${row.map(cell => `<td>${renderRichInline(cell)}</td>`).join('')}</tr>`)
          .join('')}</tbody></table>`);
      }
      table = [];
    };
    const flushCodeBlock = () => {
      if (!codeBlock) return;
      output.push(`<pre><code>${context.escapeHtml(codeBlock.lines.join('\n'))}</code></pre>`);
      codeBlock = null;
    };
    const flushAll = () => {
      flushParagraph();
      flushList();
      flushOrderedList();
      flushTable();
    };

    for (const rawLine of lines) {
      const fence = rawLine.match(/^(`{3,})\s*([A-Za-z0-9_-]*)\s*$/);
      if (codeBlock) {
        if (fence && fence[1].length >= codeBlock.fence.length) flushCodeBlock();
        else codeBlock.lines.push(rawLine);
        continue;
      }
      if (fence) {
        flushAll();
        codeBlock = { fence: fence[1], language: fence[2] || '', lines: [] };
        continue;
      }

      const line = rawLine.trim();
      if (!line) {
        flushAll();
        continue;
      }

      const markdocImage = line.match(/^\{%\s*r2Image\s+(.+?)\s*\/%\}$/);
      const markdownImage = line.match(/^!\[([^\]]*)\]\(([^)]+)\)$/);
      if (markdocImage || markdownImage) {
        flushAll();
        const attrs = markdocImage ? parseMarkdocImageAttrs(markdocImage[1]) : { alt: markdownImage[1], src: markdownImage[2] };
        output.push(richImageHtml({ src: attrs.src, alt: attrs.alt, caption: attrs.caption, markdoc: Boolean(markdocImage) }));
        continue;
      }

      const markdocDocument = line.match(/^\{%\s*r2Document\s+(.+?)\s*\/%\}$/);
      if (markdocDocument) {
        flushAll();
        const attrs = parseMarkdocImageAttrs(markdocDocument[1]);
        output.push(richDocumentHtml(attrs).replace('data-rich-type="document"','data-rich-type="document" data-rich-markdoc="document"'));
        continue;
      }

      if (/^\|.+\|$/.test(line)) {
        flushParagraph();
        flushList();
        flushOrderedList();
        table.push(line);
        continue;
      }
      if (table.length) flushTable();

      const heading = line.match(/^(#{2,4})\s+(.+)$/);
      if (heading) {
        flushParagraph();
        flushList();
        flushOrderedList();
        output.push(`<h${heading[1].length}>${renderRichInline(heading[2])}</h${heading[1].length}>`);
        continue;
      }

      const bullet = line.match(/^[-*]\s+(.+)$/);
      if (bullet) {
        flushParagraph();
        flushOrderedList();
        list.push(bullet[1]);
        continue;
      }

      const ordered = line.match(/^\d+\.\s+(.+)$/);
      if (ordered) {
        flushParagraph();
        flushList();
        orderedList.push(ordered[1]);
        continue;
      }

      const quote = line.match(/^>\s+(.+)$/);
      if (quote) {
        flushAll();
        output.push(`<blockquote>${renderRichInline(quote[1])}</blockquote>`);
        continue;
      }

      if (/^---+$/.test(line)) {
        flushAll();
        output.push('<hr>');
        continue;
      }

      paragraph.push(line);
    }

    flushCodeBlock();
    flushAll();
    return output.join('') || '';
  };

  const escapeMarkdownTableCell = value => String(value || '').replace(/\|/g, '\\|').trim();

  const richInlineToMarkdown = node => {
    if (node.nodeType === Node.TEXT_NODE) return node.textContent || '';
    if (node.nodeType !== Node.ELEMENT_NODE) return '';
    const element = node;
    const text = () => [...element.childNodes].map(richInlineToMarkdown).join('');
    if (element.matches('strong,b')) return `**${text()}**`;
    if (element.matches('em,i')) return `*${text()}*`;
    if (element.matches('code')) return `\`${text()}\``;
    if (element.matches('a') && !safeContentUrl(element.getAttribute('href'))) return text();
    if (element.matches('a')) return `[${text()}](${element.getAttribute('href') || ''})`;
    if (element.matches('br')) return '\n';
    return text();
  };

  const richTableToMarkdown = table => {
    const rows = [...table.querySelectorAll('tr')].map(row => [...row.children].map(cell => escapeMarkdownTableCell(richInlineToMarkdown(cell))));
    if (!rows.length) return '';
    const width = Math.max(...rows.map(row => row.length));
    const normalizeRow = row => [...row, ...Array(Math.max(0, width - row.length)).fill('')];
    const [head, ...body] = rows.map(normalizeRow);
    return [`| ${head.join(' | ')} |`, `| ${head.map(() => '---').join(' | ')} |`, ...body.map(row => `| ${row.join(' | ')} |`)].join('\n');
  };

  const richCodeBlockToMarkdown = element => {
    const text = String(element.textContent || '').replace(/\n+$/g, '');
    const longestBacktickRun = Math.max(2, ...[...text.matchAll(/`+/g)].map(match => match[0].length));
    const fence = '`'.repeat(longestBacktickRun + 1);
    return `${fence}\n${text || 'code block'}\n${fence}`;
  };

  const richBlockToMarkdown = element => {
    if (element.nodeType === Node.TEXT_NODE) return String(element.textContent || '').trim();
    if (element.nodeType !== Node.ELEMENT_NODE) return '';
    const tag = element.tagName;
    if (/^H[1-6]$/.test(tag)) return `${'#'.repeat(Math.max(2, Number(tag.slice(1))))} ${richInlineToMarkdown(element).trim()}`;
    if (tag === 'UL' || tag === 'OL') {
      return [...element.querySelectorAll(':scope > li')]
        .map((item, index) => `${tag === 'OL' ? `${index + 1}.` : '-'} ${richInlineToMarkdown(item).trim()}`)
        .join('\n');
    }
    if (tag === 'BLOCKQUOTE') return `> ${richInlineToMarkdown(element).trim()}`;
    if (tag === 'HR') return '---';
    if (tag === 'TABLE') return richTableToMarkdown(element);
    if (tag === 'PRE') return richCodeBlockToMarkdown(element);
    if (tag === 'FIGURE') {
      const image = element.querySelector('img');
      if (!image) return '';
      const caption = element.querySelector('figcaption')?.textContent?.trim() || '';
      const alt = image.getAttribute('alt') || caption || 'BusinessWeb content image';
      if (element.dataset.richMarkdoc === 'image') return `{% r2Image src=${JSON.stringify(safeContentUrl(image.getAttribute('src'),true))} alt=${JSON.stringify(alt)}${caption ? ` caption=${JSON.stringify(caption)}` : ''} /%}`;
      return `![${alt.replace(/]/g, '\\]')}](${image.getAttribute('src') || ''})`;
    }
    if (element.dataset.richMarkdoc === 'document') { const a = element.querySelector('a'); return a ? `{% r2Document src=${JSON.stringify(safeContentUrl(a.getAttribute('href'),true))} title=${JSON.stringify(a.textContent || '')} /%}` : ''; }
    if (tag === 'IMG') {
      return `![${(element.getAttribute('alt') || 'BusinessWeb content image').replace(/]/g, '\\]')}](${element.getAttribute('src') || ''})`;
    }
    return richInlineToMarkdown(element).trim();
  };

  const richHtmlToMarkdown = surface => {
    const blocks = [...surface.childNodes].map(richBlockToMarkdown).map(block => block.trim()).filter(Boolean);
    return blocks.join('\n\n').trim();
  };

  const placeCaretAtEnd = element => {
    element.focus();
    const range = document.createRange();
    range.selectNodeContents(element);
    range.collapse(false);
    const selection = window.getSelection();
    selection.removeAllRanges();
    selection.addRange(range);
  };

  const saveRichSelection = editorId => {
    const editor = richEditors.get(editorId);
    const selection = window.getSelection();
    if (!editor || !selection?.rangeCount || !editor.surface.contains(selection.anchorNode)) return;
    context.state.richEditorSelection = { editorId, range: selection.getRangeAt(0).cloneRange() };
  };

  const restoreRichSelection = editorId => {
    const editor = richEditors.get(editorId);
    if (!editor) return;
    editor.surface.focus();
    const selection = window.getSelection();
    try {
      if (context.state.richEditorSelection?.editorId === editorId && editor.surface.contains(context.state.richEditorSelection.range.commonAncestorContainer)) {
        selection.removeAllRanges();
        selection.addRange(context.state.richEditorSelection.range);
        return;
      }
    } catch {
      // Stale saved ranges are expected after programmatic editor updates.
    }
    placeCaretAtEnd(editor.surface);
  };

  const syncRichEditorToTextarea = editorId => {
    const editor = richEditors.get(editorId);
    if (!editor) return;
    if (editor.sourceMode || editor.lastHtml === editor.surface.innerHTML) return;
    editor.textarea.value = richHtmlToMarkdown(editor.surface);
    editor.lastHtml = editor.surface.innerHTML;
  };

  const setRichTextValue = (editorId, value) => {
    const editor = richEditors.get(editorId);
    const textarea = context.$(editorId);
    if (textarea) textarea.value = value || '';
    if (!editor) return;
    editor.surface.innerHTML = markdownToRichHtml(value);
    editor.lastHtml = editor.surface.innerHTML;
  };

  const getRichTextValue = editorId => {
    if (richEditors.has(editorId)) syncRichEditorToTextarea(editorId);
    return context.$(editorId)?.value || '';
  };

  const insertHtmlInRichEditor = (editorId, html) => {
    const editor = richEditors.get(editorId);
    if (!editor) return;
    restoreRichSelection(editorId);
    document.execCommand('insertHTML', false, html);
    syncRichEditorToTextarea(editorId);
    saveRichSelection(editorId);
  };

  const insertRichEditorImage = (editorId, url) => {
    insertHtmlInRichEditor(editorId, richImageHtml({ src: url, alt: 'BusinessWeb content image', caption: '' }));
  };

  const insertRichEditorDocument = (editorId, url, title) => {
    insertHtmlInRichEditor(editorId, richDocumentHtml({ src: url, title }));
  };

  const selectedRichText = () => {
    const selection = window.getSelection();
    return selection?.rangeCount ? selection.toString() : '';
  };

  const activeRichTableCell = editorId => {
    const editor = richEditors.get(editorId);
    const selection = window.getSelection();
    if (!editor || !selection?.rangeCount) return null;
    let node = selection.anchorNode;
    if (!editor.surface.contains(node)) return null;
    if (node.nodeType === Node.TEXT_NODE) node = node.parentElement;
    return node?.closest?.('td, th') || null;
  };

  const richTableWidth = table => Math.max(1, ...[...table.querySelectorAll('tr')].map(row => row.children.length));

  const focusRichCell = (editorId, cell) => {
    const editor = richEditors.get(editorId);
    if (!editor) return;
    if (!cell) { placeCaretAtEnd(editor.surface); return; }
    editor.surface.focus();
    const range = document.createRange();
    range.selectNodeContents(cell);
    range.collapse(false);
    const selection = window.getSelection();
    selection.removeAllRanges();
    selection.addRange(range);
  };

  const insertRichTableRow = editorId => {
    const cell = activeRichTableCell(editorId);
    if (!cell) return;
    const row = cell.parentElement;
    const table = cell.closest('table');
    const nextRow = document.createElement('tr');
    nextRow.innerHTML = Array.from({ length: richTableWidth(table) }, () => '<td><br></td>').join('');
    row.insertAdjacentElement('afterend', nextRow);
    focusRichCell(editorId, nextRow.firstElementChild);
    syncRichEditorToTextarea(editorId);
  };

  const insertRichTableColumn = editorId => {
    const cell = activeRichTableCell(editorId);
    if (!cell) return;
    const index = [...cell.parentElement.children].indexOf(cell);
    const table = cell.closest('table');
    table.querySelectorAll('tr').forEach(row => {
      const isHead = row.closest('thead');
      const nextCell = document.createElement(isHead ? 'th' : 'td');
      nextCell.innerHTML = '<br>';
      row.children[Math.min(index, row.children.length - 1)]?.insertAdjacentElement('afterend', nextCell);
    });
    focusRichCell(editorId, cell.nextElementSibling);
    syncRichEditorToTextarea(editorId);
  };

  const deleteRichTableRow = editorId => {
    const cell = activeRichTableCell(editorId);
    if (!cell) return;
    const row = cell.parentElement;
    const table = cell.closest('table');
    const rows = [...table.querySelectorAll('tr')];
    const index = rows.indexOf(row);
    if (rows.length > 1) {
      const next = rows[index + 1] || rows[index - 1];
      row.remove();
      focusRichCell(editorId, next.firstElementChild);
    } else { table.remove(); focusRichCell(editorId, null); }
    syncRichEditorToTextarea(editorId);
  };

  const deleteRichTableColumn = editorId => {
    const cell = activeRichTableCell(editorId);
    if (!cell) return;
    const index = [...cell.parentElement.children].indexOf(cell);
    const table = cell.closest('table');
    if (richTableWidth(table) <= 1) { table.remove(); focusRichCell(editorId, null); }
    else {
      const row = cell.parentElement;
      table.querySelectorAll('tr').forEach(item => item.children[index]?.remove());
      focusRichCell(editorId, row.children[Math.min(index, row.children.length - 1)]);
    }
    syncRichEditorToTextarea(editorId);
  };

  const updateRichToolbarState = editorId => {
    const editor = richEditors.get(editorId);
    if (!editor) return;
    const inTable = Boolean(activeRichTableCell(editorId));
    editor.wrapper.querySelectorAll('[data-rich-table-command]').forEach(button => {
      button.disabled = !inTable;
    });
  };

  const runRichEditorCommand = async (editorId, command, value = '') => {
    const editor = richEditors.get(editorId);
    if (!editor) return;
    restoreRichSelection(editorId);
    if (command === 'source') {
      if (!editor.sourceMode) syncRichEditorToTextarea(editorId);
      else { editor.surface.innerHTML = markdownToRichHtml(editor.textarea.value); editor.lastHtml = editor.surface.innerHTML; }
      editor.sourceMode = !editor.sourceMode;
      editor.textarea.classList.toggle('is-rich-source', !editor.sourceMode);
      editor.surface.hidden = editor.sourceMode;
      editor.wrapper.querySelectorAll('[data-rich-command], [data-rich-format]').forEach(button => { if (button.dataset.richCommand !== 'source') button.disabled = editor.sourceMode; });
      return;
    }
    if (editor.sourceMode) return;
    if (command === 'formatBlock') document.execCommand('formatBlock', false, `<${String(value || 'P').toLowerCase()}>`);
    if (command === 'bold') document.execCommand('bold');
    if (command === 'italic') document.execCommand('italic');
    if (command === 'code') document.execCommand('insertHTML', false, `<code>${context.escapeHtml(selectedRichText() || 'code')}</code>`);
    if (command === 'codeBlock') {
      insertHtmlInRichEditor(editorId, `<pre><code>${context.escapeHtml(selectedRichText() || 'code block')}</code></pre><p><br></p>`);
      return;
    }
    if (command === 'unorderedList') document.execCommand('insertUnorderedList');
    if (command === 'orderedList') document.execCommand('insertOrderedList');
    if (command === 'link') {
      const selection = window.getSelection();
      const node = selection?.anchorNode?.nodeType === Node.ELEMENT_NODE ? selection.anchorNode : selection?.anchorNode?.parentElement;
      const url = await promptDialog('请输入实际链接地址（支持 HTTPS、站内路径、mailto、tel）', node?.closest?.('a')?.getAttribute('href') || '');
      if (url) { const href = safeContentUrl(url); if (!href) { await adminDialog({title:'链接不可用',message:'链接地址不安全或格式不受支持。',confirmLabel:'返回编辑'}); return; } restoreRichSelection(editorId); document.execCommand('createLink', false, href); }
    }
    if (command === 'unlink') document.execCommand('unlink');
    if (command === 'separator') document.execCommand('insertHTML', false, '<hr><p><br></p>');
    if (command === 'table') {
      insertHtmlInRichEditor(
        editorId,
        '<table><thead><tr><th>Header</th><th>Header</th><th>Header</th></tr></thead><tbody><tr><td>Text</td><td>Text</td><td>Text</td></tr><tr><td>Text</td><td>Text</td><td>Text</td></tr></tbody></table><p><br></p>'
      );
      return;
    }
    if (command === 'tableRowAdd') insertRichTableRow(editorId);
    if (command === 'tableColumnAdd') insertRichTableColumn(editorId);
    if (command === 'tableRowDelete') deleteRichTableRow(editorId);
    if (command === 'tableColumnDelete') deleteRichTableColumn(editorId);
    if (command === 'image') {
      saveRichSelection(editorId);
      context.openImagePicker({ richEditorId: editorId, title: 'Select content image' }).catch(error => context.setStatus('imagePickerStatus', error.message, true));
      return;
    }
    syncRichEditorToTextarea(editorId);
    saveRichSelection(editorId);
    updateRichToolbarState(editorId);
  };

  const createRichEditor = (textarea, placeholder) => {
    const editorId = textarea.id;
    textarea.classList.add('is-rich-source');
    const wrapper = document.createElement('div');
    wrapper.className = 'rich-editor';
    wrapper.dataset.richEditor = editorId;
    wrapper.innerHTML = `
      <div class="rich-editor__toolbar" aria-label="Content editor toolbar">
        <span class="rich-editor__group">
          <select data-rich-format="${context.escapeHtml(editorId)}" aria-label="Block format">
            ${richEditorBlocks.map(([value, label]) => `<option value="${value}">${label}</option>`).join('')}
          </select>
        </span>
        <span class="rich-editor__group">
          <button data-rich-command="bold" type="button" title="Bold"><strong>B</strong></button>
          <button data-rich-command="italic" type="button" title="Italic"><em>I</em></button>
          <button data-rich-command="code" type="button" title="Inline code">Code</button>
          <button data-rich-command="codeBlock" type="button" title="Code block">Code block</button>
          <button data-rich-command="unorderedList" type="button" title="Bullet list">• List</button>
          <button data-rich-command="orderedList" type="button" title="Numbered list">1. List</button>
        </span>
        <span class="rich-editor__group">
          <button data-rich-command="link" type="button" title="查看或修改链接">Link</button>
          <button data-rich-command="unlink" type="button" title="取消链接">Unlink</button>
          <button data-rich-command="source" type="button" title="切换文本编辑，保留原文格式">文本模式</button>
          <button data-rich-command="image" type="button" title="Image">Image</button>
          <button data-rich-command="separator" type="button" title="Divider">Line</button>
        </span>
        <span class="rich-editor__group">
          <button data-rich-command="table" type="button" title="Insert table">Table</button>
          <button data-rich-command="tableRowAdd" data-rich-table-command type="button" title="Add table row" disabled>+Row</button>
          <button data-rich-command="tableColumnAdd" data-rich-table-command type="button" title="Add table column" disabled>+Col</button>
          <button data-rich-command="tableRowDelete" data-rich-table-command type="button" title="Delete table row" disabled>-Row</button>
          <button data-rich-command="tableColumnDelete" data-rich-table-command type="button" title="Delete table column" disabled>-Col</button>
        </span>
      </div>
      <div class="rich-editor__surface" contenteditable="true" data-placeholder="${context.escapeHtml(placeholder || '')}" aria-label="${context.escapeHtml(textarea.getAttribute('aria-label') || 'Content editor')}"></div>
    `;
    textarea.insertAdjacentElement('afterend', wrapper);
    const surface = wrapper.querySelector('.rich-editor__surface');
    richEditors.set(editorId, { textarea, wrapper, surface });
    surface.innerHTML = markdownToRichHtml(textarea.value);
    richEditors.get(editorId).lastHtml = surface.innerHTML;
    surface.addEventListener('input', () => {
      syncRichEditorToTextarea(editorId);
      saveRichSelection(editorId);
      updateRichToolbarState(editorId);
    });
    surface.addEventListener('keyup', () => {
      saveRichSelection(editorId);
      updateRichToolbarState(editorId);
    });
    surface.addEventListener('mouseup', () => {
      saveRichSelection(editorId);
      updateRichToolbarState(editorId);
    });
    surface.addEventListener('focus', () => {
      saveRichSelection(editorId);
      updateRichToolbarState(editorId);
    });
    surface.addEventListener('click', event => {
      surface.querySelectorAll('[data-rich-selected]').forEach(node => node.removeAttribute('data-rich-selected'));
      const figure = event.target.closest?.('figure');
      if (figure && surface.contains(figure)) figure.dataset.richSelected = 'true';
      updateRichToolbarState(editorId);
    });
    wrapper.querySelectorAll('[data-rich-command]').forEach(button => {
      button.addEventListener('mousedown', event => event.preventDefault());
      button.addEventListener('click', () => runRichEditorCommand(editorId, button.dataset.richCommand));
    });
    wrapper.querySelector('[data-rich-format]').addEventListener('change', event => runRichEditorCommand(editorId, 'formatBlock', event.target.value));
  };

  const initializeRichEditors = () => {
    [
      ['productContent', 'Write product detail content here.'],
      ['blogBody', 'Write article content here.'],
      ['translationEditBody', 'Edit translated content here.'],
    ].forEach(([id, placeholder]) => {
      const textarea = context.$(id);
      if (textarea && !richEditors.has(id)) createRichEditor(textarea, placeholder);
    });
  };
  Object.assign(context, { richEditors, richEditorBlocks, parseMarkdocImageAttrs, renderRichInline, richImageHtml, richDocumentHtml, markdownToRichHtml, escapeMarkdownTableCell, richInlineToMarkdown, richTableToMarkdown, richCodeBlockToMarkdown, richBlockToMarkdown, richHtmlToMarkdown, placeCaretAtEnd, saveRichSelection, restoreRichSelection, syncRichEditorToTextarea, setRichTextValue, getRichTextValue, insertHtmlInRichEditor, insertRichEditorImage, insertRichEditorDocument, selectedRichText, activeRichTableCell, richTableWidth, insertRichTableRow, insertRichTableColumn, deleteRichTableRow, deleteRichTableColumn, updateRichToolbarState, runRichEditorCommand, createRichEditor, initializeRichEditors });
}
