import React, { useState, useEffect } from 'react';
import type { TimedMode, QuizStartConfig, WaterfallProgress, Question, QuestionOption } from '../types';

interface Props {
  bankId: number;
  questionCount: number;
  onStart: (config: QuizStartConfig) => void;
  onCancel: () => void;
  initialPracticeIds?: number[];
}

export function QuizSetup({ bankId, questionCount, onStart, onCancel, initialPracticeIds }: Props) {
  const [callMode, setCallMode] = useState<'normal' | 'waterfall' | 'practice'>('normal');
  const [dailyCount, setDailyCount] = useState('10');
  const [waterfallProgress, setWaterfallProgress] = useState<WaterfallProgress | null>(null);
  const [timedMode, setTimedMode] = useState<TimedMode>('none');
  const [totalMinutes, setTotalMinutes] = useState('90');
  const [perQuestionSeconds, setPerQuestionSeconds] = useState('60');
  const [showAnswerImmediately, setShowAnswerImmediately] = useState(true);
  const [scramble, setScramble] = useState(false);
  const [rangeFrom, setRangeFrom] = useState('1');
  const [rangeTo, setRangeTo] = useState(String(questionCount));

  useEffect(() => { setRangeTo(String(questionCount)); }, [questionCount]);

  // Practice mode state
  const [practiceQuestions, setPracticeQuestions] = useState<Question[]>([]);
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [practiceLoading, setPracticeLoading] = useState(false);

  // Question editor state
  const [editingQuestion, setEditingQuestion] = useState<Question | null>(null);
  const [editText, setEditText] = useState('');
  const [editOptions, setEditOptions] = useState<QuestionOption[]>([]);
  const [editCorrect, setEditCorrect] = useState<Set<string>>(new Set());
  const [editExplanation, setEditExplanation] = useState('');
  const [editImageData, setEditImageData] = useState<string | null>(null);
  const [editSaving, setEditSaving] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);

  useEffect(() => {
    if (initialPracticeIds && initialPracticeIds.length > 0) setCallMode('practice');
  }, []);

  useEffect(() => {
    window.electronAPI.getWaterfallProgress(bankId).then(setWaterfallProgress);
  }, [bankId]);

  useEffect(() => {
    if (callMode !== 'practice') return;
    setPracticeLoading(true);
    window.electronAPI.loadQuestions(bankId).then(qs => {
      setPracticeQuestions(qs);
      if (initialPracticeIds && initialPracticeIds.length > 0) {
        setSelectedIds(new Set(initialPracticeIds));
      } else {
        setSelectedIds(new Set(qs.map(q => q.id)));
      }
      setPracticeLoading(false);
    });
  }, [callMode, bankId]);

  const toggleQuestion = (id: number) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const openEditor = (q: Question) => {
    setEditingQuestion(q);
    setEditText(q.questionText);
    setEditOptions(q.options.map(o => ({ ...o })));
    setEditCorrect(new Set(q.correctAnswers));
    setEditExplanation(q.explanation ?? '');
    setEditImageData(q.imageData ?? null);
    setEditError(null);
  };

  const handleImageFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => setEditImageData(reader.result as string);
    reader.readAsDataURL(file);
    e.target.value = '';
  };

  const addOption = () => {
    const letters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
    const usedIds = new Set(editOptions.map(o => o.id));
    const nextId = letters.split('').find(l => !usedIds.has(l)) ?? String(editOptions.length + 1);
    setEditOptions(prev => [...prev, { id: nextId, text: '' }]);
  };

  const removeOption = (id: string) => {
    setEditOptions(prev => prev.filter(o => o.id !== id));
    setEditCorrect(prev => { const n = new Set(prev); n.delete(id); return n; });
  };

  const toggleEditCorrect = (id: string) => {
    setEditCorrect(prev => {
      const n = new Set(prev);
      if (n.has(id)) n.delete(id); else n.add(id);
      return n;
    });
  };

  const saveEdit = async () => {
    if (!editingQuestion || editSaving) return;
    const options = editOptions.filter(o => o.text.trim());
    const correctAnswers = [...editCorrect].filter(id => options.some(o => o.id === id));
    if (!editText.trim()) { setEditError('Question text is required.'); return; }
    if (options.length === 0) { setEditError('At least one option is required.'); return; }
    if (correctAnswers.length === 0) { setEditError('At least one correct answer must be selected.'); return; }
    setEditSaving(true);
    setEditError(null);
    try {
      await window.electronAPI.updateQuestion({
        id: editingQuestion.id,
        questionText: editText.trim(),
        options,
        correctAnswers,
        explanation: editExplanation.trim() || null,
        imageData: editImageData,
      });
      setPracticeQuestions(prev => prev.map(q =>
        q.id === editingQuestion.id
          ? { ...q, questionText: editText.trim(), options, correctAnswers, explanation: editExplanation.trim() || null, imageData: editImageData }
          : q
      ));
      setEditingQuestion(null);
    } catch (e) {
      setEditError(e instanceof Error ? e.message : 'Save failed.');
    } finally {
      setEditSaving(false);
    }
  };

  const handleStart = () => {
    const totalLimit = (timedMode === 'total' || timedMode === 'both')
      ? parseInt(totalMinutes, 10) * 60 : null;
    const perQLimit = (timedMode === 'per_question' || timedMode === 'both')
      ? parseInt(perQuestionSeconds, 10) : null;

    if (totalLimit !== null && !Number.isFinite(totalLimit)) return;
    if (perQLimit !== null && !Number.isFinite(perQLimit)) return;
    if (callMode === 'practice' && selectedIds.size === 0) return;

    const from = Math.max(1, Math.min(parseInt(rangeFrom, 10) || 1, questionCount));
    const to = Math.max(from, Math.min(parseInt(rangeTo, 10) || questionCount, questionCount));

    const quizMode: QuizStartConfig['quizMode'] =
      callMode === 'waterfall'
        ? { mode: 'waterfall', dailyCount: Math.max(1, parseInt(dailyCount, 10) || 10) }
        : callMode === 'practice'
        ? { mode: 'practice', questionIds: [...selectedIds] }
        : { mode: 'normal', rangeFrom: from, rangeTo: to };

    onStart({ timedMode, totalTimeLimit: totalLimit, perQuestionTimeLimit: perQLimit, showAnswerImmediately, quizMode, scramble });
  };

  return (
    <div className="modal-overlay">
      <div className="modal">
        <h2>Quiz Setup</h2>
        <p style={{ color: '#8b9cb0', fontSize: 12, marginBottom: 16 }}>{questionCount} questions</p>

        <div className="form-row">
          <label className="form-label">Call Mode</label>
          <div className="radio-group">
            {([
              ['normal', 'Normal'],
              ['waterfall', 'Waterfall'],
              ['practice', 'Practice'],
            ] as ['normal' | 'waterfall' | 'practice', string][]).map(([val, label]) => (
              <div
                key={val}
                className={`radio-option${callMode === val ? ' selected' : ''}`}
                onClick={() => setCallMode(val)}
              >
                <span style={{
                  width: 14, height: 14, borderRadius: '50%',
                  border: `2px solid ${callMode === val ? '#2196f3' : '#4a5568'}`,
                  background: callMode === val ? '#2196f3' : 'transparent',
                  flexShrink: 0,
                  display: 'inline-block',
                }} />
                {label}
              </div>
            ))}
          </div>
        </div>

        {callMode === 'normal' && (
          <div className="form-row">
            <label className="form-label">Question range</label>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <input
                className="form-input"
                type="number"
                min="1"
                max={questionCount}
                value={rangeFrom}
                onChange={e => setRangeFrom(e.target.value)}
                style={{ width: 70 }}
              />
              <span style={{ color: '#8b9cb0', fontSize: 13 }}>to</span>
              <input
                className="form-input"
                type="number"
                min="1"
                max={questionCount}
                value={rangeTo}
                onChange={e => setRangeTo(e.target.value)}
                style={{ width: 70 }}
              />
              <span style={{ color: '#8b9cb0', fontSize: 12 }}>
                ({Math.max(0, Math.min(parseInt(rangeTo, 10) || 0, questionCount) - Math.max(1, parseInt(rangeFrom, 10) || 1) + 1)} questions)
              </span>
            </div>
          </div>
        )}

        {callMode === 'waterfall' && (
          <div className="form-row">
            <label className="form-label">Daily questions</label>
            <input
              className="form-input"
              type="number"
              min="1"
              max={questionCount}
              value={dailyCount}
              onChange={e => setDailyCount(e.target.value)}
            />
            {waterfallProgress && waterfallProgress.introducedCount < questionCount && (
              <p style={{ color: '#8b9cb0', fontSize: 11, marginTop: 6 }}>
                {waterfallProgress.introducedCount} of {questionCount} introduced &nbsp;·&nbsp; last session {formatDate(waterfallProgress.lastSessionDate)}
              </p>
            )}
            {waterfallProgress && waterfallProgress.introducedCount >= questionCount && (
              <p style={{ color: '#8b9cb0', fontSize: 11, marginTop: 6 }}>
                All questions introduced — daily full review
              </p>
            )}
          </div>
        )}

        {callMode === 'practice' && (
          <div className="form-row">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
              <label className="form-label" style={{ margin: 0 }}>
                {practiceLoading
                  ? 'Loading questions…'
                  : `${selectedIds.size} of ${practiceQuestions.length} selected`}
              </label>
              {!practiceLoading && practiceQuestions.length > 0 && (
                <div style={{ display: 'flex', gap: 6 }}>
                  <button
                    className="btn btn-secondary"
                    style={{ padding: '2px 10px', fontSize: 11 }}
                    onClick={() => setSelectedIds(new Set(practiceQuestions.map(q => q.id)))}
                  >
                    All
                  </button>
                  <button
                    className="btn btn-secondary"
                    style={{ padding: '2px 10px', fontSize: 11 }}
                    onClick={() => setSelectedIds(new Set())}
                  >
                    None
                  </button>
                  <button
                    className="btn btn-secondary"
                    style={{ padding: '2px 10px', fontSize: 11 }}
                    onClick={async () => {
                      const flagged = await window.electronAPI.getFlaggedQuestions(bankId);
                      setSelectedIds(new Set(flagged.map(f => f.questionId)));
                    }}
                  >
                    🚩 Flagged
                  </button>
                </div>
              )}
            </div>

            {!practiceLoading && (
              <div style={{
                maxHeight: 220,
                overflowY: 'auto',
                border: '1px solid #2d3748',
                borderRadius: 4,
              }}>
                {practiceQuestions.map((q, i) => {
                  const checked = selectedIds.has(q.id);
                  return (
                    <div
                      key={q.id}
                      onClick={() => toggleQuestion(q.id)}
                      style={{
                        display: 'flex',
                        alignItems: 'flex-start',
                        gap: 10,
                        padding: '7px 10px',
                        cursor: 'pointer',
                        borderBottom: i < practiceQuestions.length - 1 ? '1px solid #1e2a3a' : 'none',
                        background: checked ? '#1a2a3e' : 'transparent',
                        userSelect: 'none',
                      }}
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => toggleQuestion(q.id)}
                        onClick={e => e.stopPropagation()}
                        style={{ marginTop: 2, flexShrink: 0 }}
                      />
                      <span style={{ color: '#5a7a9a', fontSize: 11, minWidth: 30, flexShrink: 0 }}>
                        Q{q.orderIndex + 1}
                      </span>
                      <span style={{ fontSize: 12, lineHeight: '1.4', color: checked ? '#e2e8f0' : '#8b9cb0', flex: 1 }}>
                        {q.questionText.length > 120
                          ? q.questionText.slice(0, 120) + '…'
                          : q.questionText}
                      </span>
                      <button
                        className="btn btn-secondary"
                        style={{ padding: '2px 8px', fontSize: 10, flexShrink: 0, marginTop: 1 }}
                        onClick={e => { e.stopPropagation(); openEditor(q); }}
                      >
                        Edit
                      </button>
                    </div>
                  );
                })}
              </div>
            )}

            {!practiceLoading && selectedIds.size === 0 && (
              <p style={{ color: '#e57373', fontSize: 11, marginTop: 6 }}>
                Select at least one question to start.
              </p>
            )}
          </div>
        )}

        <div className="form-row">
          <label className="form-label">Timer</label>
          <div className="radio-group">
            {([
              ['none', 'No timer'],
              ['total', 'Total time limit'],
              ['per_question', 'Per-question time limit'],
              ['both', 'Both'],
            ] as [TimedMode, string][]).map(([val, label]) => (
              <div
                key={val}
                className={`radio-option${timedMode === val ? ' selected' : ''}`}
                onClick={() => setTimedMode(val)}
              >
                <span style={{
                  width: 14, height: 14, borderRadius: '50%',
                  border: `2px solid ${timedMode === val ? '#2196f3' : '#4a5568'}`,
                  background: timedMode === val ? '#2196f3' : 'transparent',
                  flexShrink: 0,
                  display: 'inline-block',
                }} />
                {label}
              </div>
            ))}
          </div>
        </div>

        {(timedMode === 'total' || timedMode === 'both') && (
          <div className="form-row">
            <label className="form-label">Total time (minutes)</label>
            <input
              className="form-input"
              type="number"
              min="1"
              max="360"
              value={totalMinutes}
              onChange={e => setTotalMinutes(e.target.value)}
            />
          </div>
        )}

        {(timedMode === 'per_question' || timedMode === 'both') && (
          <div className="form-row">
            <label className="form-label">Per-question time (seconds)</label>
            <input
              className="form-input"
              type="number"
              min="10"
              max="300"
              value={perQuestionSeconds}
              onChange={e => setPerQuestionSeconds(e.target.value)}
            />
          </div>
        )}

        <div className="form-row">
          <label className="form-label">Show correct answer after each question?</label>
          <div className="radio-group">
            {([true, false] as const).map(val => (
              <div
                key={String(val)}
                className={`radio-option${showAnswerImmediately === val ? ' selected' : ''}`}
                onClick={() => setShowAnswerImmediately(val)}
              >
                <span style={{
                  width: 14, height: 14, borderRadius: '50%',
                  border: `2px solid ${showAnswerImmediately === val ? '#2196f3' : '#4a5568'}`,
                  background: showAnswerImmediately === val ? '#2196f3' : 'transparent',
                  flexShrink: 0,
                  display: 'inline-block',
                }} />
                {val ? 'Yes — show answer and explanation immediately' : 'No — show all results at the end'}
              </div>
            ))}
          </div>
        </div>

        <div className="form-row">
          <label className="form-label">Scramble question order?</label>
          <div className="radio-group">
            {([false, true] as const).map(val => (
              <div
                key={String(val)}
                className={`radio-option${scramble === val ? ' selected' : ''}`}
                onClick={() => setScramble(val)}
              >
                <span style={{
                  width: 14, height: 14, borderRadius: '50%',
                  border: `2px solid ${scramble === val ? '#2196f3' : '#4a5568'}`,
                  background: scramble === val ? '#2196f3' : 'transparent',
                  flexShrink: 0,
                  display: 'inline-block',
                }} />
                {val ? 'Yes — randomize order each session' : 'No — original order'}
              </div>
            ))}
          </div>
        </div>

        <div style={{ display: 'flex', gap: 10, marginTop: 20 }}>
          <button
            className="btn btn-primary"
            onClick={handleStart}
            disabled={callMode === 'practice' && selectedIds.size === 0}
          >
            &#x25B6; Start Quiz
          </button>
          <button className="btn btn-secondary" onClick={onCancel}>Cancel</button>
        </div>
      </div>

      {editingQuestion && (
        <div className="modal-overlay" style={{ zIndex: 200 }}>
          <div className="modal" style={{ maxWidth: 580, maxHeight: '85vh', display: 'flex', flexDirection: 'column' }}>
            <h3 style={{ marginBottom: 4 }}>Edit Question</h3>
            <p style={{ color: '#5a7a9a', fontSize: 11, marginBottom: 16 }}>Q{editingQuestion.orderIndex + 1}</p>

            <div style={{ overflowY: 'auto', flex: 1 }}>
              <div className="form-row">
                <label className="form-label">Question text</label>
                <textarea
                  value={editText}
                  onChange={e => setEditText(e.target.value)}
                  rows={4}
                  style={{ width: '100%', background: '#0d1117', border: '1px solid #2d3748', borderRadius: 4, color: '#e2e8f0', padding: '8px 10px', fontSize: 13, lineHeight: 1.5, resize: 'vertical', boxSizing: 'border-box' }}
                />
              </div>

              <div className="form-row">
                <label className="form-label">Image <span style={{ color: '#5a7a9a', fontWeight: 400 }}>(optional)</span></label>
                {editImageData ? (
                  <div>
                    <img
                      src={editImageData}
                      alt="Question image"
                      style={{ maxWidth: '100%', maxHeight: 200, borderRadius: 4, border: '1px solid #2d3748', marginBottom: 8, display: 'block' }}
                    />
                    <div style={{ display: 'flex', gap: 8 }}>
                      <label className="btn btn-secondary" style={{ cursor: 'pointer', fontSize: 11, padding: '3px 10px' }}>
                        Replace
                        <input type="file" accept="image/*" style={{ display: 'none' }} onChange={handleImageFile} />
                      </label>
                      <button
                        className="btn btn-secondary"
                        style={{ fontSize: 11, padding: '3px 10px', color: '#e57373' }}
                        onClick={() => setEditImageData(null)}
                      >
                        Remove image
                      </button>
                    </div>
                  </div>
                ) : (
                  <label className="btn btn-secondary" style={{ cursor: 'pointer', fontSize: 11, padding: '3px 10px', display: 'inline-block' }}>
                    + Add image
                    <input type="file" accept="image/*" style={{ display: 'none' }} onChange={handleImageFile} />
                  </label>
                )}
              </div>

              <div className="form-row">
                <label className="form-label">Options <span style={{ color: '#5a7a9a', fontWeight: 400 }}>(check = correct answer)</span></label>
                {editOptions.map((opt, i) => (
                  <div key={opt.id} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                    <input
                      type="checkbox"
                      checked={editCorrect.has(opt.id)}
                      onChange={() => toggleEditCorrect(opt.id)}
                      style={{ flexShrink: 0 }}
                    />
                    <span style={{ color: '#5a7a9a', fontSize: 12, minWidth: 18, flexShrink: 0, fontWeight: 700 }}>{opt.id}</span>
                    <input
                      className="form-input"
                      value={opt.text}
                      onChange={e => setEditOptions(prev => prev.map((o, j) => j === i ? { ...o, text: e.target.value } : o))}
                      style={{ flex: 1 }}
                      placeholder="Option text"
                    />
                    <button
                      className="btn btn-secondary"
                      style={{ padding: '3px 8px', fontSize: 12, flexShrink: 0, color: '#e57373' }}
                      onClick={() => removeOption(opt.id)}
                      disabled={editOptions.length <= 1}
                      title="Remove option"
                    >
                      ✕
                    </button>
                  </div>
                ))}
                <button
                  className="btn btn-secondary"
                  style={{ fontSize: 11, padding: '3px 10px', marginTop: 4 }}
                  onClick={addOption}
                >
                  + Add option
                </button>
              </div>

              <div className="form-row">
                <label className="form-label">Explanation <span style={{ color: '#5a7a9a', fontWeight: 400 }}>(optional)</span></label>
                <textarea
                  value={editExplanation}
                  onChange={e => setEditExplanation(e.target.value)}
                  rows={3}
                  style={{ width: '100%', background: '#0d1117', border: '1px solid #2d3748', borderRadius: 4, color: '#e2e8f0', padding: '8px 10px', fontSize: 13, lineHeight: 1.5, resize: 'vertical', boxSizing: 'border-box' }}
                  placeholder="Why is the answer correct? (shown during practice)"
                />
              </div>
            </div>

            {editError && (
              <p style={{ color: '#e57373', fontSize: 12, marginTop: 8, marginBottom: 0 }}>{editError}</p>
            )}

            <div style={{ display: 'flex', gap: 10, marginTop: 16, paddingTop: 12, borderTop: '1px solid #1e2a3a' }}>
              <button className="btn btn-primary" onClick={saveEdit} disabled={editSaving}>
                {editSaving ? 'Saving…' : 'Save'}
              </button>
              <button className="btn btn-secondary" onClick={() => setEditingQuestion(null)} disabled={editSaving}>
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function formatDate(iso: string): string {
  const [year, month, day] = iso.split('-').map(Number);
  return new Date(year, month - 1, day).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}
