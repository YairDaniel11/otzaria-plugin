(() => {
  const api = window.otzariaIndexer;

  const stepPick = document.getElementById('step-pick');
  const stepProgress = document.getElementById('step-progress');
  const stepSummary = document.getElementById('step-summary');

  const folderPathInput = document.getElementById('folder-path');
  const outputSubfolderInput = document.getElementById('output-subfolder');
  const btnChooseFolder = document.getElementById('btn-choose-folder');
  const btnStartScan = document.getElementById('btn-start-scan');
  const progressStatus = document.getElementById('progress-status');
  const logEl = document.getElementById('log');

  const summaryGrid = document.getElementById('summary-grid');
  const btnOpenFolder = document.getElementById('btn-open-folder');
  const btnRescan = document.getElementById('btn-rescan');

  const bookmarkModal = document.getElementById('bookmark-modal');
  const modalFilename = document.getElementById('modal-filename');
  const modalCount = document.getElementById('modal-count');
  const choiceSource = document.getElementById('choice-source');
  const choiceCopy = document.getElementById('choice-copy');
  const choiceSkip = document.getElementById('choice-skip');

  let chosenFolder = null;
  let lastIndexPath = null;
  /** requestId של בקשת ההחלטה שהמודל מוצג עבורה כרגע - מונע ערבוב תשובות
   *  בין קבצים שונים כשיש כמה בקשות סימניות ברצף. */
  let currentRequestId = null;

  function appendLog(cssClass, text) {
    const line = document.createElement('div');
    line.className = `line ${cssClass}`;
    line.textContent = text;
    logEl.appendChild(line);
    logEl.scrollTop = logEl.scrollHeight;
  }

  function cssClassForEvent(evt) {
    switch (evt.type) {
      case 'file-start':
      case 'files-found':
      case 'scan-start':
        return 'start';
      case 'file-done':
      case 'scan-done':
        return 'done';
      case 'file-skip':
        return 'skip';
      case 'file-error':
        return 'error';
      default:
        return 'info';
    }
  }

  btnChooseFolder.addEventListener('click', async () => {
    const folder = await api.chooseFolder();
    if (folder) {
      chosenFolder = folder;
      folderPathInput.value = folder;
      btnStartScan.disabled = false;
    }
  });

  btnStartScan.addEventListener('click', async () => {
    if (!chosenFolder) return;
    stepPick.hidden = true;
    stepProgress.hidden = false;
    stepSummary.hidden = true;
    logEl.innerHTML = '';
    progressStatus.textContent = 'רץ...';
    btnStartScan.disabled = true;

    try {
      const outputSubfolder = (outputSubfolderInput.value || '').trim() || '_אינדקס_אישי';
      const result = await api.startScan(chosenFolder, outputSubfolder);
      progressStatus.textContent = 'הושלם';
      showSummary(result);
    } catch (err) {
      appendLog('error', `שגיאה כללית: ${err && err.message ? err.message : err}`);
      progressStatus.textContent = 'נכשל';
    } finally {
      btnStartScan.disabled = false;
    }
  });

  api.onProgress((evt) => {
    appendLog(cssClassForEvent(evt), evt.message);
  });

  api.onBookmarkRequest((payload) => {
    currentRequestId = payload.requestId;
    modalFilename.textContent = payload.fileLabel;
    modalCount.textContent = String(payload.missingCount);
    bookmarkModal.hidden = false;
  });

  async function respond(choice) {
    const requestId = currentRequestId;
    if (!requestId) return;
    bookmarkModal.hidden = true;
    currentRequestId = null;
    await api.respondBookmarkChoice(requestId, choice);
  }

  choiceSource.addEventListener('click', () => respond('source'));
  choiceCopy.addEventListener('click', () => respond('copy'));
  choiceSkip.addEventListener('click', () => respond('skip'));

  function statCard(num, label) {
    const div = document.createElement('div');
    div.className = 'stat-card';
    div.innerHTML = `<div class="num">${num}</div><div class="label">${label}</div>`;
    return div;
  }

  function showSummary(result) {
    const { summary } = result;
    lastIndexPath = summary.indexPath;
    stepProgress.hidden = true;
    stepSummary.hidden = false;
    summaryGrid.innerHTML = '';
    summaryGrid.appendChild(statCard(summary.wordBooks, 'ספרי Word שעודכנו'));
    summaryGrid.appendChild(statCard(summary.pdfCompanionBooks, 'מסמכי-מלווה ל-PDF שנוצרו'));
    summaryGrid.appendChild(statCard(summary.totalHeadings, 'סה"כ כותרות שנוספו לאינדקס'));
    summaryGrid.appendChild(statCard(summary.totalBooksInIndex, 'סה"כ ספרים בקובץ האינדקס'));
    summaryGrid.appendChild(statCard(summary.skippedUnsupported, 'קבצים בפורמט לא נתמך'));
    summaryGrid.appendChild(statCard(summary.skippedNoOutline, 'PDF בלי תוכן עניינים (דולג)'));
    if (summary.errors > 0) {
      summaryGrid.appendChild(statCard(summary.errors, 'שגיאות'));
    }
  }

  btnOpenFolder.addEventListener('click', () => {
    if (lastIndexPath) api.showItemInFolder(lastIndexPath);
  });

  btnRescan.addEventListener('click', () => {
    stepSummary.hidden = true;
    stepPick.hidden = false;
    chosenFolder = null;
    folderPathInput.value = '';
    btnStartScan.disabled = true;
  });
})();
