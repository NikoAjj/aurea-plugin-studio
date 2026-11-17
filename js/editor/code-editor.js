export class AureaCodeEditor {
  constructor({ textarea, lineNumbersEl, fileTabsEl, chipsContainer, onSave }) {
    this.textarea = textarea;
    this.lineNumbersEl = lineNumbersEl;
    this.fileTabsEl = fileTabsEl;
    this.chipsContainer = chipsContainer;
    this.onSave = onSave;

    this.project = null;
    this.activeFile = 'plugin.json';

    this.bindEvents();
  }

  loadProject(project) {
    this.project = project;
    const files = Object.keys(project.files);
    this.activeFile = files.includes('plugin.json') ? 'plugin.json' : files[0];
    this.renderTabs();
    this.renderContent();
  }

  renderTabs() {
    if (!this.project) return;
    this.fileTabsEl.innerHTML = '';

    const filenames = Object.keys(this.project.files);
    filenames.forEach(fname => {
      const btn = document.createElement('button');
      btn.className = `file-tab ${fname === this.activeFile ? 'active' : ''}`;
      btn.textContent = fname;

      // Klik biasa: buka file
      btn.addEventListener('click', () => {
        this.activeFile = fname;
        this.renderTabs();
        this.renderContent();
      });

      // Klik kanan / tahan: hapus file (kecuali plugin.json)
      if (fname !== 'plugin.json') {
        btn.title = 'Klik kanan untuk menghapus file';
        btn.addEventListener('contextmenu', e => {
          e.preventDefault();
          if (confirm(`Hapus file "${fname}" dari proyek ini?`)) {
            delete this.project.files[fname];
            this.activeFile = 'plugin.json';
            this.renderTabs();
            this.renderContent();
            if (this.onSave) this.onSave();
          }
        });
      }

      this.fileTabsEl.appendChild(btn);
    });

    // Tombol "+" tambah file baru
    const addBtn = document.createElement('button');
    addBtn.className = 'file-tab';
    addBtn.textContent = '+';
    addBtn.title = 'Tambah file baru';
    addBtn.addEventListener('click', () => this.promptNewFile());
    this.fileTabsEl.appendChild(addBtn);
  }

  promptNewFile() {
    if (!this.project) return;
    const rawName = prompt('Nama file baru (contoh: frame.js, main.js, stack.json, helper.glsl):');
    if (!rawName || !rawName.trim()) return;

    const cleanName = rawName.trim();
    if (!this.project.files[cleanName]) {
      if (cleanName.endsWith('.json')) {
        this.project.files[cleanName] = '{\n  \n}';
      } else if (cleanName.endsWith('.js')) {
        this.project.files[cleanName] = `// ${cleanName}\nexport function onFrame(ctx) {\n  \n}`;
      } else {
        this.project.files[cleanName] = `// ${cleanName}\n`;
      }
      if (this.onSave) this.onSave();
    }

    this.activeFile = cleanName;
    this.renderTabs();
    this.renderContent();
  }

  renderContent() {
    if (!this.project) return;
    this.textarea.value = this.project.files[this.activeFile] || '';
    this.updateLineNumbers();
  }

  updateLineNumbers() {
    const lines = this.textarea.value.split('\n').length;
    this.lineNumbersEl.innerHTML = Array.from({ length: lines }, (_, i) => i + 1).join('<br>');
  }

  insertAtCursor(snippet) {
    const start = this.textarea.selectionStart;
    const end = this.textarea.selectionEnd;
    this.textarea.value = this.textarea.value.slice(0, start) + snippet + this.textarea.value.slice(end);
    this.textarea.selectionStart = this.textarea.selectionEnd = start + snippet.length;
    this.textarea.focus();
    this.textarea.dispatchEvent(new Event('input'));
  }

  bindEvents() {
    // Auto-save & sync line numbers saat mengetik
    this.textarea.addEventListener('input', () => {
      if (!this.project) return;
      this.project.files[this.activeFile] = this.textarea.value;
      this.updateLineNumbers();
      if (this.onSave) this.onSave();
    });

    // Sinkronkan scroll antara nomor baris dan area kode
    this.textarea.addEventListener('scroll', () => {
      this.lineNumbersEl.scrollTop = this.textarea.scrollTop;
    });

    // Dukungan tombol Tab untuk indentasi 2 spasi
    this.textarea.addEventListener('keydown', e => {
      if (e.key === 'Tab') {
        e.preventDefault();
        this.insertAtCursor('  ');
      }
    });

    // Bar pintasan GLSL Syntax Chips
    this.chipsContainer.querySelectorAll('button').forEach(btn => {
      btn.addEventListener('click', () => {
        const snippet = btn.getAttribute('data-insert');
        if (snippet) this.insertAtCursor(snippet);
      });
    });
  }
}
