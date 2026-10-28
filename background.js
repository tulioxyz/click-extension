// background.js - Gerencia cliques no ícone da extensão para abrir o painel arrastável na tela

chrome.action.onClicked.addListener(async (tab) => {
  if (!tab || !tab.id) return;

  // Não tentar injetar em páginas restritas do próprio navegador
  if (tab.url && (tab.url.startsWith('chrome://') || tab.url.startsWith('edge://') || tab.url.startsWith('about:'))) {
    return;
  }

  try {
    // Tenta avisar o content script já presente na página
    await chrome.tabs.sendMessage(tab.id, { action: 'togglePanel' });
  } catch (err) {
    // Se a aba foi aberta antes da extensão ser recarregada, injeta os scripts dinamicamente
    try {
      await chrome.scripting.insertCSS({
        target: { tabId: tab.id },
        files: ['content.css']
      });
      await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        files: ['content.js']
      });
      // Aguarda meio segundo e abre o painel
      setTimeout(() => {
        chrome.tabs.sendMessage(tab.id, { action: 'togglePanel' }).catch(() => {});
      }, 100);
    } catch (injectErr) {
      console.warn('[AutoClicker] Não foi possível injetar nesta aba:', injectErr);
    }
  }
});
