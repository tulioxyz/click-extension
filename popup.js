// popup.js - Gerenciamento Simplificado do Auto Clicker

document.addEventListener('DOMContentLoaded', async () => {
  const tabPicker = document.getElementById('tab-picker');
  const tabPosition = document.getElementById('tab-position');
  const panelPicker = document.getElementById('panel-picker');
  const panelPosition = document.getElementById('panel-position');

  const btnStartPicker = document.getElementById('btn-start-picker');
  const pickerResult = document.getElementById('picker-result');
  const pickerResultText = document.getElementById('picker-result-text');

  const choiceCards = document.querySelectorAll('.icon-choice-card');
  const clicksPerRowInput = document.getElementById('clicks-per-row');
  const delayInput = document.getElementById('delay-input');
  const chkAutoConfirm = document.getElementById('chk-auto-confirm');

  const statusText = document.getElementById('status-text');
  const statusIndicator = document.querySelector('.status-indicator');

  const btnPreview = document.getElementById('btn-preview');
  const btnStart = document.getElementById('btn-start');
  const btnStop = document.getElementById('btn-stop');

  const progressSection = document.getElementById('progress-section');
  const progressFill = document.getElementById('progress-fill');
  const progressCount = document.getElementById('progress-count');
  const progressPercent = document.getElementById('progress-percent');

  // Estado
  let currentMode = 'picker'; // Padrão: Selecionar na tela (mais seguro)
  let selectedButtonIndex = 0;
  let customSelector = null;

  // Restaurar preferências salvas
  if (chrome.storage && chrome.storage.local) {
    chrome.storage.local.get(
      ['savedMode', 'savedDelay', 'savedClicks', 'savedIndex', 'savedAutoConfirm', 'savedSelector'],
      (res) => {
        if (res.savedDelay) delayInput.value = res.savedDelay;
        if (res.savedClicks) clicksPerRowInput.value = res.savedClicks;
        if (res.savedAutoConfirm !== undefined) chkAutoConfirm.checked = res.savedAutoConfirm;
        if (res.savedIndex !== undefined) {
          selectedButtonIndex = res.savedIndex;
          updatePositionCards(selectedButtonIndex);
        }
        if (res.savedSelector) {
          customSelector = res.savedSelector;
          pickerResult.classList.remove('hidden');
          pickerResultText.textContent = `Alvo memorizado: ${customSelector}`;
        }
        if (res.savedMode === 'position') {
          setMode('position');
        } else {
          setMode('picker');
        }
      }
    );
  }

  async function getActiveTab() {
    const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
    return tabs[0];
  }

  async function ensureContentScriptInjected(tabId) {
    try {
      const response = await chrome.tabs.sendMessage(tabId, { action: 'ping' });
      if (response && response.status === 'ok') return true;
    } catch (e) {
      try {
        await chrome.scripting.insertCSS({
          target: { tabId },
          files: ['content.css']
        });
        await chrome.scripting.executeScript({
          target: { tabId },
          files: ['content.js']
        });
        return true;
      } catch (err) {
        showStatus('Erro ao conectar com esta página.', 'error');
        return false;
      }
    }
  }

  function showStatus(text, type = 'info') {
    statusText.textContent = text;
    statusIndicator.className = 'status-indicator';
    if (type === 'ready') statusIndicator.classList.add('ready');
    if (type === 'busy') statusIndicator.classList.add('busy');
  }

  function setMode(mode) {
    currentMode = mode;
    if (chrome.storage && chrome.storage.local) {
      chrome.storage.local.set({ savedMode: mode });
    }

    if (mode === 'picker') {
      tabPicker.classList.add('active');
      tabPosition.classList.remove('active');
      panelPicker.classList.remove('hidden');
      panelPosition.classList.add('hidden');
    } else {
      tabPosition.classList.add('active');
      tabPicker.classList.remove('active');
      panelPosition.classList.remove('hidden');
      panelPicker.classList.add('hidden');
    }
    previewElements();
  }

  function updatePositionCards(index) {
    choiceCards.forEach(card => {
      const idx = parseInt(card.getAttribute('data-index'), 10);
      card.classList.toggle('active', idx === index);
    });
  }

  tabPicker.addEventListener('click', () => setMode('picker'));
  tabPosition.addEventListener('click', () => setMode('position'));

  // Clique nos botões por posição
  choiceCards.forEach(card => {
    card.addEventListener('click', () => {
      selectedButtonIndex = parseInt(card.getAttribute('data-index'), 10);
      updatePositionCards(selectedButtonIndex);
      if (chrome.storage && chrome.storage.local) {
        chrome.storage.local.set({ savedIndex: selectedButtonIndex });
      }
      previewElements();
    });
  });

  // Salvar configurações ao alterar
  clicksPerRowInput.addEventListener('change', () => {
    if (chrome.storage && chrome.storage.local) {
      chrome.storage.local.set({ savedClicks: clicksPerRowInput.value });
    }
  });

  delayInput.addEventListener('change', () => {
    if (chrome.storage && chrome.storage.local) {
      chrome.storage.local.set({ savedDelay: delayInput.value });
    }
  });

  chkAutoConfirm.addEventListener('change', () => {
    if (chrome.storage && chrome.storage.local) {
      chrome.storage.local.set({ savedAutoConfirm: chkAutoConfirm.checked });
    }
  });

  // Iniciar Mira (Picker)
  btnStartPicker.addEventListener('click', async () => {
    const tab = await getActiveTab();
    if (!tab) return;
    const ok = await ensureContentScriptInjected(tab.id);
    if (!ok) return;

    showStatus('Toque no botão desejado na página...', 'busy');
    chrome.tabs.sendMessage(tab.id, { action: 'startPicker' });
    // Fecha popup para o usuário poder clicar livremente na tela
    window.close();
  });

  // Pré-visualizar / Destacar na tela
  async function previewElements() {
    const tab = await getActiveTab();
    if (!tab) return;
    const ok = await ensureContentScriptInjected(tab.id);
    if (!ok) return;

    chrome.tabs.sendMessage(
      tab.id,
      {
        action: 'preview',
        mode: currentMode,
        buttonIndex: selectedButtonIndex,
        customSelector: customSelector
      },
      (res) => {
        if (chrome.runtime.lastError || !res) {
          showStatus('Nenhuma tabela encontrada nesta página.', 'error');
          return;
        }

        if (res.count > 0) {
          showStatus(`✓ ${res.count} botões identificados na tela!`, 'ready');
        } else {
          if (currentMode === 'picker' && !customSelector) {
            showStatus('Clique em "Mirar e Selecionar" para escolher o botão.', 'info');
          } else {
            showStatus('Nenhum botão encontrado para esta opção.', 'error');
          }
        }
      }
    );
  }

  btnPreview.addEventListener('click', previewElements);

  // Iniciar cliques em lote
  btnStart.addEventListener('click', async () => {
    const tab = await getActiveTab();
    if (!tab) return;
    const ok = await ensureContentScriptInjected(tab.id);
    if (!ok) return;

    const delay = parseInt(delayInput.value, 10) || 1000;
    const clicksPerRow = Math.max(1, parseInt(clicksPerRowInput.value, 10) || 1);
    const autoConfirm = chkAutoConfirm.checked;

    btnStart.classList.add('hidden');
    btnStop.classList.remove('hidden');
    progressSection.classList.remove('hidden');
    showStatus('Executando cliques na tela...', 'busy');

    chrome.tabs.sendMessage(
      tab.id,
      {
        action: 'startBatch',
        mode: currentMode,
        buttonIndex: selectedButtonIndex,
        customSelector: customSelector,
        clicksPerRow: clicksPerRow,
        delay: delay,
        autoConfirm: autoConfirm,
        scrollIntoView: true
      },
      (res) => {
        if (chrome.runtime.lastError || !res || !res.started) {
          showStatus(res?.message || 'Falha ao iniciar execução.', 'error');
          stopUiState();
        }
      }
    );
  });

  // Parar
  btnStop.addEventListener('click', async () => {
    const tab = await getActiveTab();
    if (!tab) return;
    chrome.tabs.sendMessage(tab.id, { action: 'stopBatch' });
    stopUiState();
    showStatus('Execução parada.', 'ready');
  });

  function stopUiState() {
    btnStart.classList.remove('hidden');
    btnStop.classList.add('hidden');
  }

  // Ouvir mensagens vindas do content script
  chrome.runtime.onMessage.addListener((msg) => {
    if (msg.action === 'pickerSelected') {
      customSelector = msg.selector;
      if (chrome.storage && chrome.storage.local) {
        chrome.storage.local.set({ savedSelector: customSelector });
      }
      pickerResult.classList.remove('hidden');
      pickerResultText.textContent = `✓ Selecionado! (${msg.count} botões correspondentes)`;
      showStatus(`✓ ${msg.count} botões encontrados na página!`, 'ready');
    }

    if (msg.action === 'batchProgress') {
      const { current, total, percentage } = msg;
      progressSection.classList.remove('hidden');
      progressFill.style.width = `${percentage}%`;
      progressCount.textContent = `${current} de ${total}`;
      progressPercent.textContent = `${percentage}%`;
      showStatus(`Processando ${current} de ${total}...`, 'busy');
    }

    if (msg.action === 'batchCompleted') {
      stopUiState();
      progressFill.style.width = '100%';
      progressPercent.textContent = '100%';
      showStatus(`✓ Concluído! ${msg.total} pessoas processadas.`, 'ready');
    }

    if (msg.action === 'batchStopped') {
      stopUiState();
      showStatus(`Interrompido (${msg.current} de ${msg.total}).`, 'ready');
    }
  });

  // Testar conexão inicial
  setTimeout(previewElements, 250);
});
