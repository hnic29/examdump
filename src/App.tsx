import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Sidebar } from './components/Sidebar';
import { Library } from './components/Library';
import { ImportFlow } from './components/ImportFlow';
import { ActiveQuiz } from './components/ActiveQuiz';
import { Results } from './components/Results';
import { History } from './components/History';
import { FlaggedLog } from './components/FlaggedLog';
import { Changelog } from './components/Changelog';
import { StatusBar } from './components/StatusBar';
import { AI_SERVICES, type AiService } from './browser/services';
import type { QuestionBank } from './types';

type AppView =
  | { screen: 'library'; selectedBankId: number | null }
  | { screen: 'import' }
  | { screen: 'quiz'; bankId: number }
  | { screen: 'results'; attemptId: number; bankId: number }
  | { screen: 'history'; bankId: number }
  | { screen: 'flagged'; bankId: number }
  | { screen: 'changelog' };

export function App() {
  const [banks, setBanks] = useState<QuestionBank[]>([]);
  const [view, setView] = useState<AppView>({ screen: 'library', selectedBankId: null });
  const [panelOpen, setPanelOpen] = useState(false);
  const [activeService, setActiveService] = useState<AiService | null>(null);
  const [dragRatio, setDragRatio] = useState(0.6);
  const draggingRef = useRef(false);
  const rafRef = useRef<number | null>(null);

  const refreshBanks = useCallback(async () => {
    setBanks(await window.electronAPI.loadBanks());
  }, []);

  useEffect(() => {
    refreshBanks();
    const unsub = window.electronAPI.onPanelStateChanged(setPanelOpen);
    return unsub;
  }, [refreshBanks]);

  useEffect(() => {
    if (panelOpen) setDragRatio(0.6);
    else setActiveService(null);
  }, [panelOpen]);

  const selectAiService = (service: AiService) => {
    setActiveService(service);
    window.electronAPI.setAiService(service);
  };

  const closePanel = () => window.electronAPI.closePanel();

  const onDividerDown = (e: React.MouseEvent) => {
    e.preventDefault();
    draggingRef.current = true;
    const onMove = (ev: MouseEvent) => {
      if (!draggingRef.current) return;
      const ratio = (window.innerWidth - ev.clientX) / window.innerWidth;
      const clamped = Math.min(0.75, Math.max(0.25, ratio));
      setDragRatio(clamped);
      if (rafRef.current == null) {
        rafRef.current = requestAnimationFrame(() => {
          rafRef.current = null;
          window.electronAPI.resizePanel(clamped);
        });
      }
    };
    const onUp = () => {
      draggingRef.current = false;
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  };

  return (
    <div className="app-shell">
      <Sidebar
        banks={banks}
        selectedBankId={view.screen === 'library' ? view.selectedBankId : null}
        onSelectBank={(id) => setView({ screen: 'library', selectedBankId: id })}
        onImport={() => setView({ screen: 'import' })}
        onHistory={(bankId) => setView({ screen: 'history', bankId })}
        onFlagged={(bankId) => setView({ screen: 'flagged', bankId })}
        onChangelog={() => setView({ screen: 'changelog' })}
        onAiHelper={() => selectAiService('claude')}
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
        {view.screen === 'flagged' && (
          <FlaggedLog
            bankId={view.bankId}
            onBack={() => setView({ screen: 'library', selectedBankId: view.bankId })}
          />
        )}
        {view.screen === 'changelog' && (
          <Changelog onBack={() => setView({ screen: 'library', selectedBankId: null })} />
        )}
      </main>

      {panelOpen && (
        <div
          className="panel-divider"
          style={{ left: `calc(${(1 - dragRatio) * 100}% - 3px)` }}
          onMouseDown={onDividerDown}
        />
      )}
      {panelOpen && (
        <div className="panel-toolbar">
          <div className="panel-toolbar-left">
            <div className="ai-service-selector">
              {AI_SERVICES.map(s => (
                <button
                  key={s.id}
                  className={`ai-service-btn${activeService === s.id ? ' active' : ''}`}
                  onClick={() => selectAiService(s.id)}
                >
                  {s.label}
                </button>
              ))}
            </div>
            {view.screen === 'quiz' && (
              <span className="panel-toolbar-label">⏸ Quiz paused — close panel to resume</span>
            )}
          </div>
          <button className="panel-close-btn" onClick={closePanel}>
            {view.screen === 'quiz' ? '✕ Close & Resume Quiz' : '✕ Close Panel'}
          </button>
        </div>
      )}
      <StatusBar />
    </div>
  );
}
