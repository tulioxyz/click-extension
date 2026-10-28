// content.js - Painel Flutuante 100% Arrastável na Tela e Executor de Cliques

(function () {
  if (window.__BATCH_CLICKER_INJECTED__) return;
  window.__BATCH_CLICKER_INJECTED__ = true;

  // Estado Geral
  let panelElement = null;
  let isBatchRunning = false;
  let isPickerActive = false;
  let highlightedElements = [];
  let autoConfirmActive = false;

  // Configurações do Usuário
  let currentMode = 'picker'; // 'picker' | 'position'
  let selectedButtonIndex = 0;
  let customSelector = null;
  let clicksPerRow = 1;
  let delayMs = 1000;
  let isMinimized = false;

  // Interceptar window.confirm quando auto-confirm estiver ativado
  const originalConfirm = window.confirm;
  window.confirm = function (msg) {
    if (autoConfirmActive) {
      console.log('[AutoClicker] Auto-confirmando diálogo nativo:', msg);
      return true;
    }
    return originalConfirm.apply(this, arguments);
  };

  // Helper de clique limpo (1 clique exato)
  function triggerSingleClick(element) {
    if (!element) return;
    const clickable = element.closest('button, a, [role="button"]') || element;
    if (typeof clickable.focus === 'function') {
      try { clickable.focus(); } catch (e) {}
    }
    if (typeof clickable.click === 'function') {
      clickable.click();
    } else {
      clickable.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, view: window }));
    }
  }

  // Encontrar todas as linhas da tabela
  function getTableRows() {
    let rows = Array.from(document.querySelectorAll('table tbody tr'));
    if (rows.length === 0) rows = Array.from(document.querySelectorAll('table tr'));
    if (rows.length === 0) rows = Array.from(document.querySelectorAll('[role="row"]'));
    if (rows.length === 0) {
      const candidates = Array.from(document.querySelectorAll('div, li, tr'));
      rows = candidates.filter(el => {
        const buttons = el.querySelectorAll('button, a, svg, [role="button"]');
        return buttons.length >= 2 && el.children.length >= 2;
      });
    }
    return rows.filter(row => {
      const ths = row.querySelectorAll('th');
      const tds = row.querySelectorAll('td, [role="cell"]');
      return !(ths.length > 0 && tds.length === 0);
    });
  }

  // Obter botões de ação na linha
  function getActionButtonsInRow(row) {
    const cells = row.querySelectorAll('td, [role="cell"], [role="gridcell"]');
    const targetContainer = cells.length > 0 ? cells[cells.length - 1] : row;

    let buttons = Array.from(
      targetContainer.querySelectorAll('button, a, [role="button"], [data-action], .btn, .icon-btn')
    );

    if (buttons.length === 0) {
      const icons = Array.from(targetContainer.querySelectorAll('svg, i, span.icon'));
      buttons = icons.map(icon => icon.closest('button, a, [role="button"]') || icon);
      buttons = [...new Set(buttons)];
    }

    if (buttons.length === 0 && cells.length > 1) {
      const prevCell = cells[cells.length - 2];
      buttons = Array.from(prevCell.querySelectorAll('button, a, [role="button"], [data-action], svg, i'));
    }

    return buttons;
  }

  // Localizar elementos alvos
  function findTargetElements() {
    const targets = [];
    if (currentMode === 'picker' && customSelector) {
      try {
        const els = Array.from(document.querySelectorAll(customSelector));
        return els.filter(el => el.offsetParent !== null);
      } catch (e) {
        console.error('[AutoClicker] Seletor inválido:', customSelector);
      }
    }

    const rows = getTableRows();
    rows.forEach(row => {
      const buttons = getActionButtonsInRow(row);
      if (buttons && buttons.length > selectedButtonIndex && buttons[selectedButtonIndex]) {
        targets.push(buttons[selectedButtonIndex]);
      }
    });

    return targets;
  }

  // Limpar destaques
  function clearHighlights() {
    highlightedElements.forEach(el => {
      el.classList.remove('batch-clicker-highlight');
      el.classList.remove('batch-clicker-clicking-now');
    });
    highlightedElements = [];
  }

  // Destacar elementos com borda pulsante
  function highlightElements(elements) {
    clearHighlights();
    elements.forEach(el => {
      el.classList.add('batch-clicker-highlight');
      highlightedElements.push(el);
    });

    if (!isBatchRunning) {
      setTimeout(() => {
        if (!isBatchRunning) clearHighlights();
      }, 6000);
    }
  }

  // Mecanismo de Arraste (Drag and Drop) Robusto e Persistente
  function setupDraggable(container, handle) {
    let isDragging = false;
    let startX = 0, startY = 0;
    let initialLeft = 0, initialTop = 0;

    handle.addEventListener('mousedown', (e) => {
      // Ignorar cliques nos botões do topo (minimizar ou fechar)
      if (e.target.closest('button')) return;

      isDragging = true;
      startX = e.clientX;
      startY = e.clientY;

      const rect = container.getBoundingClientRect();
      initialLeft = rect.left;
      initialTop = rect.top;

      container.style.right = 'auto';
      container.style.bottom = 'auto';
      container.style.left = `${initialLeft}px`;
      container.style.top = `${initialTop}px`;
      container.classList.add('batch-panel-dragging');

      e.preventDefault();
    });

    document.addEventListener('mousemove', (e) => {
      if (!isDragging) return;
      const deltaX = e.clientX - startX;
      const deltaY = e.clientY - startY;

      const maxLeft = Math.max(0, window.innerWidth - container.offsetWidth - 10);
      const maxTop = Math.max(0, window.innerHeight - container.offsetHeight - 10);

      const newLeft = Math.min(Math.max(10, initialLeft + deltaX), maxLeft);
      const newTop = Math.min(Math.max(10, initialTop + deltaY), maxTop);

      container.style.left = `${newLeft}px`;
      container.style.top = `${newTop}px`;
    });

    document.addEventListener('mouseup', () => {
      if (isDragging) {
        isDragging = false;
        container.classList.remove('batch-panel-dragging');
        // Salvar posição
        try {
          localStorage.setItem('__batch_clicker_pos__', JSON.stringify({
            left: container.style.left,
            top: container.style.top
          }));
        } catch (err) {}
      }
    });
  }

  // Tentar confirmar modais HTML
  async function attemptModalConfirmation() {
    await new Promise(r => setTimeout(r, 200));
    const confirmSelectors = [
      'button.swal2-confirm',
      '.modal.show button.btn-primary',
      '.modal.show button.btn-danger',
      'div[role="dialog"] button:not([aria-label="Close"]):not(.btn-secondary)',
      'button[type="submit"]',
      '.v-btn--active'
    ];

    for (const sel of confirmSelectors) {
      const btn = document.querySelector(sel);
      if (btn && btn.offsetParent !== null && !btn.closest('#batch-clicker-panel')) {
        triggerSingleClick(btn);
        return;
      }
    }

    const allButtons = Array.from(document.querySelectorAll('button, [role="button"]'));
    const confirmTexts = ['confirmar', 'sim', 'excluir', 'remover', 'enviar', 'ok', 'yes', 'confirm'];
    for (const btn of allButtons) {
      if (btn.offsetParent === null || btn.closest('#batch-clicker-panel')) continue;
      const txt = (btn.textContent || '').trim().toLowerCase();
      if (confirmTexts.includes(txt)) {
        if (btn.closest('.modal, [role="dialog"], .swal2-popup, .popup, .dialog')) {
          triggerSingleClick(btn);
          break;
        }
      }
    }
  }

  // Executar lote de cliques
  async function runBatch() {
    const targets = findTargetElements();
    const total = targets.length;

    if (total === 0) {
      updateStatus('Nenhum botão encontrado para clicar.', 'error');
      return;
    }

    isBatchRunning = true;
    autoConfirmActive = document.getElementById('batch-chk-autoconfirm')?.checked ?? true;
    highlightElements(targets);

    const btnStart = document.getElementById('batch-btn-start');
    const btnStop = document.getElementById('batch-btn-stop');
    const progressWrapper = document.getElementById('batch-progress-wrapper');
    const progressFill = document.getElementById('batch-progress-fill');
    const progressCount = document.getElementById('batch-progress-count');
    const progressPercent = document.getElementById('batch-progress-percent');

    if (btnStart) btnStart.classList.add('batch-hidden');
    if (btnStop) btnStop.classList.remove('batch-hidden');
    if (progressWrapper) progressWrapper.classList.remove('batch-hidden');

    const onStop = () => {
      isBatchRunning = false;
      autoConfirmActive = false;
      clearHighlights();
      if (btnStart) btnStart.classList.remove('batch-hidden');
      if (btnStop) btnStop.classList.add('batch-hidden');
      updateStatus(`Interrompido (${currentIdx} de ${total}).`, 'ready');
    };

    if (btnStop) btnStop.onclick = onStop;

    const escListener = (e) => {
      if (e.key === 'Escape' && isBatchRunning) onStop();
    };
    window.addEventListener('keydown', escListener, { once: true });

    let currentIdx = 0;

    for (let i = 0; i < total; i++) {
      if (!isBatchRunning) break;
      currentIdx = i + 1;
      const el = targets[i];

      clearHighlights();
      el.classList.add('batch-clicker-clicking-now');
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });

      // Cliques configurados por pessoa
      for (let c = 0; c < clicksPerRow; c++) {
        if (!isBatchRunning) break;
        triggerSingleClick(el);
        if (c < clicksPerRow - 1) {
          await new Promise(r => setTimeout(r, 180));
        }
      }

      // Atualiza progresso sem tocar no cabeçalho
      const pct = Math.round((currentIdx / total) * 100);
      if (progressFill) progressFill.style.width = `${pct}%`;
      if (progressCount) progressCount.textContent = `${currentIdx} de ${total}`;
      if (progressPercent) progressPercent.textContent = `${pct}%`;
      updateStatus(`Processando ${currentIdx} de ${total}...`, 'busy');

      if (autoConfirmActive) {
        await attemptModalConfirmation();
      }

      await new Promise(r => setTimeout(r, delayMs));
      el.classList.remove('batch-clicker-clicking-now');
    }

    window.removeEventListener('keydown', escListener);

    if (isBatchRunning) {
      isBatchRunning = false;
      autoConfirmActive = false;
      clearHighlights();
      if (btnStart) btnStart.classList.remove('batch-hidden');
      if (btnStop) btnStop.classList.add('batch-hidden');
      if (progressFill) progressFill.style.width = '100%';
      if (progressPercent) progressPercent.textContent = '100%';
      updateStatus(`✓ Concluído! ${total} pessoas processadas.`, 'ready');
    }
  }

  // Modo Mira (Picker)
  function startElementPicker() {
    if (isPickerActive) return;
    isPickerActive = true;

    // Minimiza temporariamente o painel para não atrapalhar a visão
    panelElement.classList.add('batch-panel-minimized');
    updateStatus('Toque no botão desejado na tabela...', 'busy');

    let lastHovered = null;

    const onMouseOver = (e) => {
      if (e.target.closest('#batch-clicker-panel')) return;
      if (lastHovered && lastHovered !== e.target) {
        lastHovered.classList.remove('batch-clicker-picker-hover');
      }
      lastHovered = e.target;
      lastHovered.classList.add('batch-clicker-picker-hover');
    };

    const onClick = (e) => {
      if (e.target.closest('#batch-clicker-panel')) return;
      e.preventDefault();
      e.stopPropagation();

      const clickedEl = e.target;
      if (lastHovered) lastHovered.classList.remove('batch-clicker-picker-hover');

      document.removeEventListener('mouseover', onMouseOver, true);
      document.removeEventListener('click', onClick, true);
      isPickerActive = false;

      // Restaura o painel
      panelElement.classList.remove('batch-panel-minimized');
      const minBtn = document.getElementById('batch-btn-minimize');
      if (minBtn) minBtn.textContent = '─';

      customSelector = generateSmartSelector(clickedEl);
      const matches = document.querySelectorAll(customSelector);

      highlightElements(Array.from(matches));

      const resultBox = document.getElementById('batch-picker-result');
      const resultText = document.getElementById('batch-picker-text');
      if (resultBox) resultBox.classList.remove('batch-hidden');
      if (resultText) resultText.textContent = `✓ Selecionado! (${matches.length} botões encontrados)`;
      updateStatus(`✓ ${matches.length} botões identificados!`, 'ready');
    };

    document.addEventListener('mouseover', onMouseOver, true);
    document.addEventListener('click', onClick, true);
  }

  // Gerador de seletor inteligente
  function generateSmartSelector(el) {
    const clickable = el.closest('button, a, [role="button"]') || el;
    const row = clickable.closest('tr, [role="row"]');

    if (row) {
      const cell = clickable.closest('td, [role="cell"]');
      if (cell) {
        const cellIndex = Array.from(cell.parentElement.children).indexOf(cell) + 1;
        const title = clickable.getAttribute('title') || el.getAttribute('title');
        if (title) return `tr td:nth-child(${cellIndex}) [title="${title}"]`;

        const aria = clickable.getAttribute('aria-label') || el.getAttribute('aria-label');
        if (aria) return `tr td:nth-child(${cellIndex}) [aria-label="${aria}"]`;

        const classes = Array.from(clickable.classList)
          .filter(c => !c.startsWith('batch-clicker'))
          .slice(0, 2)
          .join('.');
        if (classes) return `tr td:nth-child(${cellIndex}) .${classes}`;

        const siblings = Array.from(cell.querySelectorAll('button, a, [role="button"], svg, i'));
        const indexInCell = siblings.indexOf(clickable) + 1;
        if (indexInCell > 0) {
          return `tr td:nth-child(${cellIndex}) ${clickable.tagName.toLowerCase()}:nth-of-type(${indexInCell})`;
        }
        return `tr td:nth-child(${cellIndex}) ${clickable.tagName.toLowerCase()}`;
      }
    }
    if (clickable.id) return `#${clickable.id}`;
    return clickable.tagName.toLowerCase();
  }

  function updateStatus(text, type = 'info') {
    const statusText = document.getElementById('batch-status-text');
    const statusDot = document.getElementById('batch-status-dot');
    if (statusText) statusText.textContent = text;
    if (statusDot) {
      statusDot.className = 'batch-dot';
      if (type === 'ready') statusDot.classList.add('ready');
      if (type === 'busy') statusDot.classList.add('busy');
    }
  }

  function preview() {
    const targets = findTargetElements();
    highlightElements(targets);
    if (targets.length > 0) {
      updateStatus(`✓ ${targets.length} botões identificados na tela!`, 'ready');
    } else {
      updateStatus('Nenhum botão encontrado com as opções atuais.', 'error');
    }
  }

  // Criação ou Alternância do Painel Flutuante na Tela
  function createOrToggleFloatingPanel() {
    if (panelElement) {
      if (panelElement.style.display === 'none') {
        panelElement.style.display = 'block';
        preview();
      } else {
        panelElement.style.display = 'none';
        clearHighlights();
      }
      return;
    }

    panelElement = document.createElement('div');
    panelElement.id = 'batch-clicker-panel';

    // Recupera última posição salva ou usa canto superior direito
    let savedPos = { left: 'calc(100vw - 370px)', top: '30px' };
    try {
      const stored = localStorage.getItem('__batch_clicker_pos__');
      if (stored) savedPos = JSON.parse(stored);
    } catch (e) {}

    panelElement.style.left = savedPos.left;
    panelElement.style.top = savedPos.top;

    panelElement.innerHTML = `
      <div class="batch-panel-header" title="Segure e arraste para qualquer lugar da tela">
        <div class="batch-panel-title-area">
          <span class="batch-panel-drag-icon">⠿</span>
          <span>⚡ Auto Clicker</span>
        </div>
        <div class="batch-panel-header-buttons">
          <button class="batch-header-btn" id="batch-btn-minimize" title="Minimizar / Expandir">─</button>
          <button class="batch-header-btn close-btn" id="batch-btn-close" title="Fechar (Reabra no ícone da extensão ou Alt+C)">✕</button>
        </div>
      </div>

      <div class="batch-panel-content">
        <!-- Abas -->
        <div class="batch-tabs">
          <button class="batch-tab active" id="batch-tab-picker">🎯 Selecionar na Tela</button>
          <button class="batch-tab" id="batch-tab-position">🔢 Por Posição</button>
        </div>

        <!-- Conteúdo: Mira -->
        <div id="batch-view-picker" class="batch-picker-box">
          <p class="batch-picker-desc">
            Toque no botão e depois <strong>clique no ícone de uma pessoa</strong> na tabela. A extensão acha todos os iguais!
          </p>
          <button class="batch-btn batch-btn-secondary batch-btn-block" id="batch-btn-trigger-picker">
            🎯 Mirar e Selecionar Alvo
          </button>
          <div id="batch-picker-result" class="batch-picker-result batch-hidden">
            <span id="batch-picker-text">Alvo selecionado!</span>
          </div>
        </div>

        <!-- Conteúdo: Posição -->
        <div id="batch-view-position" class="batch-position-box batch-hidden">
          <div class="batch-pos-label">Escolha qual botão clicar na linha:</div>
          <div class="batch-pos-grid">
            <button class="batch-pos-btn active" data-index="0">
              <span class="batch-pos-icon">✏️</span>
              <span class="batch-pos-num">1º</span>
              <span class="batch-pos-name">Lápis</span>
            </button>
            <button class="batch-pos-btn" data-index="1">
              <span class="batch-pos-icon">✉️</span>
              <span class="batch-pos-num">2º</span>
              <span class="batch-pos-name">Env 1</span>
            </button>
            <button class="batch-pos-btn" data-index="2">
              <span class="batch-pos-icon">📨</span>
              <span class="batch-pos-num">3º</span>
              <span class="batch-pos-name">Env 2</span>
            </button>
            <button class="batch-pos-btn" data-index="3">
              <span class="batch-pos-icon">✖️</span>
              <span class="batch-pos-num">4º</span>
              <span class="batch-pos-name">Canc</span>
            </button>
            <button class="batch-pos-btn" data-index="4">
              <span class="batch-pos-icon">🗑️</span>
              <span class="batch-pos-num">5º</span>
              <span class="batch-pos-name">Lixeira</span>
            </button>
          </div>
        </div>

        <!-- Configurações -->
        <div class="batch-settings-box">
          <div class="batch-settings-grid">
            <div class="batch-field">
              <label for="batch-input-clicks">Cliques por pessoa</label>
              <div class="batch-input-wrap">
                <input type="number" id="batch-input-clicks" min="1" max="10" value="1">
                <span class="batch-unit">clique(s)</span>
              </div>
            </div>
            <div class="batch-field">
              <label for="batch-input-delay">Tempo de espera</label>
              <div class="batch-input-wrap">
                <input type="number" id="batch-input-delay" min="200" max="10000" step="100" value="1000">
                <span class="batch-unit">ms</span>
              </div>
            </div>
          </div>
          <label class="batch-checkbox-row">
            <input type="checkbox" id="batch-chk-autoconfirm" checked>
            <span>Auto-confirmar mensagens (Ex: "Tem certeza?")</span>
          </label>
        </div>

        <!-- Barra de Status -->
        <div class="batch-status-bar">
          <div class="batch-dot ready" id="batch-status-dot"></div>
          <span id="batch-status-text">Pronto para iniciar</span>
        </div>

        <!-- Ações Principais -->
        <div class="batch-actions-row">
          <button class="batch-btn batch-btn-outline" id="batch-btn-preview" title="Destaca os botões na tela sem clicar">
            🔍 Destacar na Tela
          </button>
          <button class="batch-btn batch-btn-primary" id="batch-btn-start">
            ▶ Iniciar Cliques
          </button>
          <button class="batch-btn batch-btn-danger batch-hidden" id="batch-btn-stop">
            ⏹ Parar Execução
          </button>
        </div>

        <!-- Progresso ao vivo -->
        <div class="batch-progress-wrapper batch-hidden" id="batch-progress-wrapper">
          <div class="batch-progress-track">
            <div class="batch-progress-fill" id="batch-progress-fill"></div>
          </div>
          <div class="batch-progress-labels">
            <span id="batch-progress-count">0 de 0</span>
            <span id="batch-progress-percent">0%</span>
          </div>
        </div>

        <div class="batch-panel-footer">
          Arraste pelo topo para onde quiser • ESC para parar
        </div>
      </div>
    `;

    document.body.appendChild(panelElement);

    // 1. Configurar arraste na alça do cabeçalho
    const header = panelElement.querySelector('.batch-panel-header');
    setupDraggable(panelElement, header);

    // 2. Minimizar / Fechar
    const minBtn = document.getElementById('batch-btn-minimize');
    minBtn.onclick = () => {
      isMinimized = !isMinimized;
      panelElement.classList.toggle('batch-panel-minimized', isMinimized);
      minBtn.textContent = isMinimized ? '◻' : '─';
    };

    const closeBtn = document.getElementById('batch-btn-close');
    closeBtn.onclick = () => {
      panelElement.style.display = 'none';
      clearHighlights();
    };

    // 3. Alternar Abas (Mira vs Posição)
    const tabPicker = document.getElementById('batch-tab-picker');
    const tabPos = document.getElementById('batch-tab-position');
    const viewPicker = document.getElementById('batch-view-picker');
    const viewPos = document.getElementById('batch-view-position');

    tabPicker.onclick = () => {
      currentMode = 'picker';
      tabPicker.classList.add('active');
      tabPos.classList.remove('active');
      viewPicker.classList.remove('batch-hidden');
      viewPos.classList.add('batch-hidden');
      preview();
    };

    tabPos.onclick = () => {
      currentMode = 'position';
      tabPos.classList.add('active');
      tabPicker.classList.remove('active');
      viewPos.classList.remove('batch-hidden');
      viewPicker.classList.add('batch-hidden');
      preview();
    };

    // 4. Seleção de botões por posição
    const posBtns = panelElement.querySelectorAll('.batch-pos-btn');
    posBtns.forEach(btn => {
      btn.onclick = () => {
        posBtns.forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        selectedButtonIndex = parseInt(btn.getAttribute('data-index'), 10);
        preview();
      };
    });

    // 5. Configurações de cliques e delay
    const clicksInput = document.getElementById('batch-input-clicks');
    clicksInput.onchange = () => {
      clicksPerRow = Math.max(1, parseInt(clicksInput.value, 10) || 1);
    };

    const delayInput = document.getElementById('batch-input-delay');
    delayInput.onchange = () => {
      delayMs = Math.max(100, parseInt(delayInput.value, 10) || 1000);
    };

    // 6. Botões de ação
    document.getElementById('batch-btn-trigger-picker').onclick = startElementPicker;
    document.getElementById('batch-btn-preview').onclick = preview;
    document.getElementById('batch-btn-start').onclick = runBatch;

    // Faz um teste inicial de detecção
    setTimeout(preview, 300);
  }

  // Ouvir mensagens de background (ao clicar no ícone da extensão)
  chrome.runtime.onMessage.addListener((req, sender, sendResponse) => {
    if (req.action === 'togglePanel') {
      createOrToggleFloatingPanel();
      sendResponse({ status: 'ok' });
      return true;
    }
  });

  // Atalho do teclado Alt + C para alternar o painel rapidamente
  window.addEventListener('keydown', (e) => {
    if (e.altKey && e.key.toLowerCase() === 'c') {
      createOrToggleFloatingPanel();
    }
  });

  // Auto-iniciar em páginas de teste local se o usuário abrir diretamente
  if (window.location.href.includes('test_demo.html')) {
    setTimeout(createOrToggleFloatingPanel, 500);
  }

  console.log('[Auto Clicker em Lote] Painel arrastável pronto. Pressione Alt+C ou clique no ícone da extensão para abrir.');
})();
