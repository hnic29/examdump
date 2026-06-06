import React, { useState, useEffect, useCallback } from 'react';
import { Sidebar } from './components/Sidebar';
import { Library } from './components/Library';
import { ImportFlow } from './components/ImportFlow';
import { ActiveQuiz } from './components/ActiveQuiz';
import { Results } from './components/Results';
import { History } from './components/History';
import type { QuestionBank } from './types';

type AppView =
  | { screen: 'library'; selectedBankId: number | null }
  | { screen: 'import' }
  | { screen: 'quiz'; bankId: number }
  | { screen: 'results'; attemptId: number; bankId: number }
  | { screen: 'history'; bankId: number };

export function App() {
  const [banks, setBanks] = useState<QuestionBank[]>([]);
  const [view, setView] = useState<AppView>({ screen: 'library', selectedBankId: null });
  const [panelOpen, setPanelOpen] = useState(false);

  const refreshBanks = useCallback(async () => {
    setBanks(await window.electronAPI.loadBanks());
  }, []);

  useEffect(() => {
    refreshBanks();
    const unsub = window.electronAPI.onPanelStateChanged(setPanelOpen);
    return unsub;
  }, [refreshBanks]);

  const closePanel = () => window.electronAPI.closePanel();

  return (
    <div className="app-shell">
      <Sidebar
        banks={banks}
        selectedBankId={view.screen === 'library' ? view.selectedBankId : null}
        onSelectBank={(id) => setView({ screen: 'library', selectedBankId: id })}
        onImport={() => setView({ screen: 'import' })}
        onHistory={(bankId) => setView({ screen: 'history', bankId })}
      />

      <main className="main-panel">
        {view.screen === 'library' && (
          <Library
            banks={banks}
            selectedBankId={view.selectedBankId}
            onStartQuiz={(bankId) => setView({ screen: 'quiz', bankId })}
            onDeleteBank={async (bankId) => {
              await window.electronAPI.deleteBank(bankId);
              refreshBanks();
              setView({ screen: 'library', selectedBankId: null });
            }}
            onExportBank={(bankId) => window.electronAPI.exportBank(bankId)}
          />
        )}
        {view.screen === 'import' && (
          <ImportFlow
            onComplete={() => { refreshBanks(); setView({ screen: 'library', selectedBankId: null }); }}
            onCancel={() => setView({ screen: 'library', selectedBankId: null })}
          />
        )}
        {view.screen === 'quiz' && (
          <ActiveQuiz
            bankId={view.bankId}
            onComplete={(attemptId) => setView({ screen: 'results', attemptId, bankId: view.bankId })}
            onCancel={() => setView({ screen: 'library', selectedBankId: view.bankId })}
          />
        )}
        {view.screen === 'results' && (
          <Results
            attemptId={view.attemptId}
            bankId={view.bankId}
            onRetake={() => setView({ screen: 'quiz', bankId: view.bankId })}
            onBack={() => setView({ screen: 'library', selectedBankId: view.bankId })}
          />
        )}
        {view.screen === 'history' && (
          <History
            bankId={view.bankId}
            onBack={() => setView({ screen: 'library', selectedBankId: view.bankId })}
          />
        )}
      </main>

      {panelOpen && (
        <div className="panel-overlay-strip">
          <button className="panel-back-btn" onClick={closePanel}>
            {view.screen === 'quiz' ? '⏸ Resume Quiz' : '← Back'}
          </button>
        </div>
      )}
    </div>
  );
}
