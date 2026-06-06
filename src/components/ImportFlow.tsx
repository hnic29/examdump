import React, { useState } from 'react';
import type { ParsedQuestion } from '../types';

type ImportStep = 'idle' | 'parsing' | 'preview' | 'ai-fallback' | 'naming' | 'saving';

interface Props {
  onComplete: () => void;
  onCancel: () => void;
}

export function ImportFlow({ onComplete, onCancel }: Props) {
  const [step, setStep] = useState<ImportStep>('idle');
  const [extractedText, setExtractedText] = useState('');
  const [fileName, setFileName] = useState('');
  const [parsedQuestions, setParsedQuestions] = useState<ParsedQuestion[]>([]);
  const [bankName, setBankName] = useState('');
  const [pasteJson, setPasteJson] = useState('');
  const [error, setError] = useState('');
  const [prompt, setPrompt] = useState('');

  const handlePickFile = async () => {
    setError('');
    setStep('parsing');
    const result = await window.electronAPI.importFile();
    if (!result) {
      setStep('idle');
      return;
    }
    setFileName(result.fileName);
    setExtractedText(result.text);
    setBankName(result.fileName.replace(/\.[^.]+$/, ''));
    const parsed = await window.electronAPI.parseFile(result.text);
    if (parsed.success && parsed.questions.length > 0) {
      setParsedQuestions(parsed.questions);
      setStep('preview');
    } else {
      const p = await window.electronAPI.generatePrompt(result.text);
      setPrompt(p);
      setStep('ai-fallback');
    }
  };

  const handleCopyPrompt = async () => {
    await window.electronAPI.copyToClipboard(prompt);
  };

  const handlePasteImport = async () => {
    setError('');
    try {
      const parsed = JSON.parse(pasteJson) as { questions: unknown[] };
      if (!Array.isArray(parsed.questions) || parsed.questions.length === 0) {
        setError('JSON must have a "questions" array with at least one item.');
        return;
      }
      // Validate each question has required fields
      const invalid = parsed.questions.findIndex((q: unknown) => {
        const item = q as Record<string, unknown>;
        return !item.question || !item.type || !Array.isArray(item.options) || !Array.isArray(item.correct_answers);
      });
      if (invalid !== -1) {
        setError(`Question ${invalid + 1} is missing required fields (question, type, options, correct_answers). Make sure you copied the full JSON response.`);
        return;
      }
      setParsedQuestions(parsed.questions as ParsedQuestion[]);
      setStep('naming');
    } catch {
      setError('Invalid JSON. Make sure you copied the full response from the AI.');
    }
  };

  const handleSave = async () => {
    if (!bankName.trim()) { setError('Please enter a name for this question bank.'); return; }
    setStep('saving');
    try {
      await window.electronAPI.ingestJSON(JSON.stringify({ questions: parsedQuestions }), bankName.trim());
      onComplete();
    } catch (e) {
      setError('Failed to save question bank. Please try again.');
      setStep('naming');
    }
  };

  if (step === 'idle' || step === 'parsing') {
    return (
      <div style={{ maxWidth: 500 }}>
        <h2 style={{ marginBottom: 16 }}>Import Question Bank</h2>
        <p style={{ color: '#8b9cb0', fontSize: 13, marginBottom: 20 }}>
          Supported formats: PDF, DOCX, TXT
        </p>
        <div style={{ display: 'flex', gap: 10 }}>
          <button className="btn btn-primary" onClick={handlePickFile} disabled={step === 'parsing'}>
            {step === 'parsing' ? '⏳ Parsing...' : '📁 Choose File'}
          </button>
          <button className="btn btn-secondary" onClick={onCancel}>Cancel</button>
        </div>
      </div>
    );
  }

  if (step === 'ai-fallback') {
    return (
      <div style={{ maxWidth: 600 }}>
        <h2 style={{ marginBottom: 8 }}>Parse with AI</h2>
        <p style={{ color: '#8b9cb0', fontSize: 13, marginBottom: 16 }}>
          The file format wasn't recognized automatically. Use the AI Helper to parse it:
        </p>
        <ol style={{ color: '#c9d4e8', fontSize: 13, lineHeight: 2, marginBottom: 16, paddingLeft: 20 }}>
          <li>Click <strong>Copy Prompt</strong> — the full prompt is now on your clipboard</li>
          <li>Click <strong>Open AI Browser</strong> and choose Claude, ChatGPT, or Gemini</li>
          <li>Log in if needed, paste the prompt, and hit Send</li>
          <li>Copy the JSON from the AI's response</li>
          <li>Paste it below and click <strong>Paste & Import</strong></li>
        </ol>
        <div style={{ display: 'flex', gap: 10, marginBottom: 16 }}>
          <button className="btn btn-secondary" onClick={handleCopyPrompt}>📋 Copy Prompt</button>
          <button className="btn btn-secondary" onClick={() => window.electronAPI.openPanel('https://claude.ai')}>🤖 Open AI Browser</button>
        </div>
        <textarea
          value={pasteJson}
          onChange={e => setPasteJson(e.target.value)}
          placeholder='Paste the JSON response here...'
          style={{ width: '100%', height: 120, background: '#0f1117', border: '1px solid #2d3a52', borderRadius: 6, padding: 10, color: '#e0e0e0', fontSize: 12, resize: 'vertical', marginBottom: 10 }}
        />
        {error && <div style={{ color: '#f44336', fontSize: 12, marginBottom: 10 }}>{error}</div>}
        <div style={{ display: 'flex', gap: 10 }}>
          <button className="btn btn-primary" onClick={handlePasteImport} disabled={!pasteJson.trim()}>Paste & Import</button>
          <button className="btn btn-secondary" onClick={onCancel}>Cancel</button>
        </div>
      </div>
    );
  }

  if (step === 'preview' || step === 'naming') {
    return (
      <div style={{ maxWidth: 600 }}>
        <h2 style={{ marginBottom: 8 }}>
          {step === 'preview' ? `Preview — ${parsedQuestions.length} questions found` : 'Name Your Question Bank'}
        </h2>
        {step === 'preview' && (
          <div style={{ maxHeight: 300, overflowY: 'auto', marginBottom: 16 }}>
            {parsedQuestions.slice(0, 5).map((q, i) => (
              <div key={i} className="card" style={{ marginBottom: 8, padding: 12 }}>
                <div style={{ fontSize: 11, color: '#8b9cb0', marginBottom: 4 }}>Q{i + 1} · {q.type.replace('_', ' ')}</div>
                <div style={{ fontSize: 13 }}>{q.question.slice(0, 120)}{q.question.length > 120 ? '…' : ''}</div>
              </div>
            ))}
            {parsedQuestions.length > 5 && (
              <div style={{ color: '#8b9cb0', fontSize: 12, padding: '4px 0' }}>…and {parsedQuestions.length - 5} more</div>
            )}
          </div>
        )}
        <div className="form-row">
          <label className="form-label">Question bank name</label>
          <input
            className="form-input"
            value={bankName}
            onChange={e => setBankName(e.target.value)}
            placeholder="e.g. Network+ Study Guide"
          />
        </div>
        {error && <div style={{ color: '#f44336', fontSize: 12, marginBottom: 10 }}>{error}</div>}
        <div style={{ display: 'flex', gap: 10 }}>
          <button className="btn btn-primary" onClick={handleSave}>💾 Save to Library</button>
          <button className="btn btn-secondary" onClick={onCancel}>Cancel</button>
        </div>
      </div>
    );
  }

  return <div style={{ color: '#8b9cb0' }}>Saving…</div>;
}
