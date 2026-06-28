import React, { useState } from 'react';
import type { ParsedQuestion } from '../types';

type ImportStep = 'idle' | 'parsing' | 'interactive-check' | 'partial' | 'preview' | 'ai-fallback' | 'naming' | 'saving' | 'saved';

interface ImportResult {
  text: string;
  fileName: string;
  isJson: boolean;
  images: string[];
}

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
  const [expectedCount, setExpectedCount] = useState(0);
  const [sourceWasJson, setSourceWasJson] = useState(false);
  const [savedBankId, setSavedBankId] = useState<number | null>(null);
  const [importResult, setImportResult] = useState<ImportResult | null>(null);

  const doParse = async (text: string, images: string[]) => {
    const parsed = await window.electronAPI.parseFile(text, images);

    if (parsed.questions.length === 0) {
      const p = await window.electronAPI.generatePrompt(text);
      setPrompt(p);
      setStep('ai-fallback');
      return;
    }

    setParsedQuestions(parsed.questions);
    setExpectedCount(parsed.expectedCount);

    if (parsed.expectedCount > parsed.questions.length) {
      setStep('partial');
    } else {
      setStep('preview');
    }
  };

  const handlePickFile = async () => {
    setError('');
    setStep('parsing');
    try {
      const result = await window.electronAPI.importFile();
      if (!result) {
        setStep('idle');
        return;
      }
      setFileName(result.fileName);
      setExtractedText(result.text);
      setSourceWasJson(result.isJson);
      setBankName(result.fileName.replace(/\.[^.]+$/, ''));
      setImportResult(result);

      // JSON file — validate and go straight to preview
      if (result.isJson) {
        const parsed = JSON.parse(result.text) as { questions: unknown[] };
        if (!Array.isArray(parsed.questions) || parsed.questions.length === 0) {
          setError('JSON file must have a "questions" array with at least one item.');
          setStep('idle');
          return;
        }
        setParsedQuestions(parsed.questions as ParsedQuestion[]);
        setStep('preview');
        return;
      }

      // DOCX files: ask whether the file has interactive questions with embedded images.
      // Image extraction already happened in the main process (mammoth.convertToHtml),
      // so we just decide here whether to pass those images to the parser.
      const ext = result.fileName.split('.').pop()?.toLowerCase();
      if (ext === 'docx' || ext === 'doc') {
        setStep('interactive-check');
        return;
      }

      // PDF / TXT — no image extraction possible, parse directly
      await doParse(result.text, []);
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Unknown error reading file.';
      setError(msg);
      setStep('idle');
    }
  };

  const handleInteractiveYes = async () => {
    setStep('parsing');
    await doParse(importResult!.text, importResult!.images);
  };

  const handleInteractiveNo = async () => {
    setStep('parsing');
    await doParse(importResult!.text, []);
  };

  const handleCopyPrompt = async () => {
    await window.electronAPI.copyToClipboard(prompt);
  };

  const handleParseAllWithAI = async () => {
    const p = await window.electronAPI.generatePrompt(extractedText);
    setPrompt(p);
    setStep('ai-fallback');
  };

  const handlePasteImport = async () => {
    setError('');
    try {
      const parsed = JSON.parse(pasteJson) as { questions: unknown[] };
      if (!Array.isArray(parsed.questions) || parsed.questions.length === 0) {
        setError('JSON must have a "questions" array with at least one item.');
        return;
      }
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
      const res = await window.electronAPI.ingestJSON(JSON.stringify({ questions: parsedQuestions }), bankName.trim());
      setSavedBankId(res.id);
      setStep('saved');
    } catch (e) {
      setError('Failed to save question bank. Please try again.');
      setStep('naming');
    }
  };

  const handleDownloadGenerated = async () => {
    setError('');
    try {
      const json = JSON.stringify({ questions: parsedQuestions }, null, 2);
      await window.electronAPI.saveGeneratedJson(json, bankName || fileName);
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Failed to download JSON.';
      setError(msg);
    }
  };

  if (step === 'idle' || step === 'parsing') {
    return (
      <div style={{ maxWidth: 500 }}>
        <h2 style={{ marginBottom: 16 }}>Import Question Bank</h2>
        <p style={{ color: '#8b9cb0', fontSize: 13, marginBottom: 20 }}>
          Supported formats: PDF, DOCX, TXT, JSON (previously exported bank)
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

  if (step === 'interactive-check') {
    return (
      <div style={{ maxWidth: 560 }}>
        <h2 style={{ marginBottom: 8 }}>Interactive Question Images?</h2>
        <p style={{ color: '#c9d4e8', fontSize: 13, lineHeight: 1.6, marginBottom: 6 }}>
          <strong>{fileName}</strong> is a DOCX file.
        </p>
        <p style={{ color: '#8b9cb0', fontSize: 13, lineHeight: 1.6, marginBottom: 20 }}>
          Does it contain interactive questions (e.g. HOTSPOT, Drag & Drop) with embedded scenario images?
          <br />
          If yes, we&apos;ll extract those images and display them alongside each interactive question during the quiz.
          Interactive questions are never scored — a <strong>Continue →</strong> button replaces the answer choices.
        </p>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <button className="btn btn-primary" onClick={handleInteractiveYes}>Yes, extract images</button>
          <button className="btn btn-secondary" onClick={handleInteractiveNo}>No, text only</button>
          <button className="btn btn-secondary" onClick={onCancel}>Cancel</button>
        </div>
      </div>
    );
  }

  if (step === 'partial') {
    const dropped = expectedCount - parsedQuestions.length;
    return (
      <div style={{ maxWidth: 560 }}>
        <h2 style={{ marginBottom: 8 }}>Some questions couldn&apos;t be read</h2>
        <p style={{ color: '#c9d4e8', fontSize: 13, lineHeight: 1.6, marginBottom: 8 }}>
          ExamDump automatically read <strong>{parsedQuestions.length}</strong> of{' '}
          <strong>{expectedCount}</strong> questions in <strong>{fileName}</strong>.
        </p>
        <p style={{ color: '#8b9cb0', fontSize: 13, lineHeight: 1.6, marginBottom: 20 }}>
          The other <strong>{dropped}</strong> couldn&apos;t be parsed from this file&apos;s layout
          (usually the A/B/C/D option letters didn&apos;t survive text extraction). You can keep the{' '}
          {parsedQuestions.length} that worked, or use the AI helper to capture all {expectedCount}.
        </p>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <button className="btn btn-primary" onClick={handleParseAllWithAI}>
            🤖 Parse all {expectedCount} with AI
          </button>
          <button className="btn btn-secondary" onClick={() => setStep('preview')}>
            Use these {parsedQuestions.length}
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
          <li>Copy the JSON from the AI&apos;s response</li>
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
                <div style={{ fontSize: 11, color: q.type === 'interactive' ? '#80cbc4' : '#8b9cb0', marginBottom: 4 }}>
                  Q{i + 1} · {q.type === 'interactive' ? 'Interactive (Unscored)' : q.type.replace('_', ' ')}
                </div>
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
          {!sourceWasJson && (
            <button className="btn btn-secondary" onClick={handleDownloadGenerated}>⬇️ Download JSON</button>
          )}
          <button className="btn btn-secondary" onClick={onCancel}>Cancel</button>
        </div>
      </div>
    );
  }

  if (step === 'saved') {
    return (
      <div style={{ maxWidth: 500 }}>
        <h2 style={{ marginBottom: 8 }}>Saved ✓</h2>
        <p style={{ color: '#c9d4e8', fontSize: 13, marginBottom: 20 }}>
          {parsedQuestions.length} questions saved to "{bankName}".
        </p>
        <div style={{ display: 'flex', gap: 10 }}>
          {!sourceWasJson && savedBankId != null && (
            <button className="btn btn-secondary" onClick={() => window.electronAPI.exportBank(savedBankId)}>
              ⬇️ Download JSON
            </button>
          )}
          <button className="btn btn-primary" onClick={onComplete}>Done</button>
        </div>
      </div>
    );
  }

  return <div style={{ color: '#8b9cb0' }}>Saving…</div>;
}
