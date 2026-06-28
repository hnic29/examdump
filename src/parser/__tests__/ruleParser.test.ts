import { describe, it, expect } from 'vitest';
import { parseExamDump } from '../ruleParser';

const SAMPLE = `Question: 1 CY0-001: Actual Exam Q&A |
Which protocol provides reliable, connection-oriented delivery at Layer 4?
A. UDP
B. TCP
C. IP
D. ICMP
Answer: B
Explanation:
TCP operates at Layer 4 and uses a three-way handshake for reliability.
Authoritative Links for Further Research:
https://example.com/tcp

Question: 2 CY0-001: Actual Exam Q&A |
Select ALL protocols that operate at Layer 4.
A. UDP
B. TCP
C. HTTP
D. FTP
Answer: A, B
Explanation:
Both UDP and TCP operate at Layer 4.`;

const NO_ANSWER_SAMPLE = `Question: 1 SY0-601 |
What is a firewall?
A. A hardware device
B. A software tool
C. Both A and B
D. Neither`;

describe('parseExamDump', () => {
  it('parses multiple_choice question correctly', () => {
    const result = parseExamDump(SAMPLE);
    expect(result.success).toBe(true);
    expect(result.questions[0].type).toBe('multiple_choice');
    expect(result.questions[0].correct_answers).toEqual(['B']);
    expect(result.questions[0].options).toHaveLength(4);
    expect(result.questions[0].options[0]).toEqual({ id: 'A', text: 'UDP' });
  });

  it('detects multi_select when multiple correct answers', () => {
    const result = parseExamDump(SAMPLE);
    expect(result.questions[1].type).toBe('multi_select');
    expect(result.questions[1].correct_answers).toEqual(['A', 'B']);
  });

  it('parses explanation text', () => {
    const result = parseExamDump(SAMPLE);
    expect(result.questions[0].explanation).toContain('three-way handshake');
  });

  it('parses authoritative links', () => {
    const result = parseExamDump(SAMPLE);
    expect(result.questions[0].links).toHaveLength(1);
    expect(result.questions[0].links![0].url).toBe('https://example.com/tcp');
  });

  it('handles questions without answers gracefully', () => {
    const result = parseExamDump(NO_ANSWER_SAMPLE);
    expect(result.questions[0].correct_answers).toEqual([]);
  });

  it('detects true_false type', () => {
    const text = `Question: 1 Test |
TCP is connectionless.
A. True
B. False
Answer: B`;
    const result = parseExamDump(text);
    expect(result.questions[0].type).toBe('true_false');
  });

  it('returns low confidence for unrecognized format', () => {
    const result = parseExamDump('This is not an exam dump at all.');
    expect(result.success).toBe(false);
    expect(result.confidence).toBeLessThan(0.5);
  });

  it('detects true_false with trailing punctuation', () => {
    const text = `Question: 1 Test |
Encryption is always symmetric.
A. True.
B. False.
Answer: B`;
    const result = parseExamDump(text);
    expect(result.questions[0].type).toBe('true_false');
  });

  it('detects multi_select from question text when no answer line', () => {
    const text = `Question: 1 Test |
Select ALL valid IP address classes.
A. Class A
B. Class B
C. Class C
D. Class D`;
    const result = parseExamDump(text);
    expect(result.questions[0].type).toBe('multi_select');
  });

  it('reports expectedCount for fully parsed dumps', () => {
    const result = parseExamDump(SAMPLE);
    expect(result.expectedCount).toBe(2);
    expect(result.questions).toHaveLength(2);
  });

  it('counts question blocks it could not parse in expectedCount', () => {
    // Q2 has lost its A./B. option-letter prefixes (real-world PDF extraction
    // failure) so it cannot be parsed — but it is still an intended question.
    const text = `Question: 1 |
A good question?
A. Option A
B. Option B
Answer: A

Question: 2 |
This question lost its option letters during extraction
European Union (EU) AI Act
International Organization for Standardization (ISO)
Answer: C`;
    const result = parseExamDump(text);
    expect(result.expectedCount).toBe(2);
    expect(result.questions).toHaveLength(1);
  });

  it('parses "Question N" headers without a colon', () => {
    const text = `Question 1   (source: page 2)
Which protocol is connection-oriented?
A. UDP
B. TCP
Correct Answer: B`;
    const result = parseExamDump(text);
    expect(result.questions).toHaveLength(1);
    expect(result.questions[0].question).toBe('Which protocol is connection-oriented?');
    expect(result.questions[0].correct_answers).toEqual(['B']);
  });

  it('recognizes "Correct Answer:" and "Answer(s):" answer lines', () => {
    const text = `Question 1 |
Pick one.
A. Foo
B. Bar
Correct Answer: A

Question 2 |
Pick two. (Choose two.)
A. Foo
B. Bar
C. Baz
Answer(s): A, C`;
    const result = parseExamDump(text);
    expect(result.questions[0].correct_answers).toEqual(['A']);
    expect(result.questions[1].correct_answers).toEqual(['A', 'C']);
    expect(result.questions[1].type).toBe('multi_select');
  });

  it('accepts "A)" option delimiters', () => {
    const text = `Question 1 |
Pick one.
A) Foo
B) Bar
Correct Answer: B`;
    const result = parseExamDump(text);
    expect(result.questions[0].options).toEqual([
      { id: 'A', text: 'Foo' },
      { id: 'B', text: 'Bar' },
    ]);
    expect(result.questions[0].correct_answers).toEqual(['B']);
  });

  it('strips a trailing [Correct] marker and uses it when no answer line', () => {
    const text = `Question 1 |
Pick one.
A. Foo
B. Bar [Correct]
C. Baz`;
    const result = parseExamDump(text);
    expect(result.questions[0].options[1]).toEqual({ id: 'B', text: 'Bar' });
    expect(result.questions[0].correct_answers).toEqual(['B']);
  });

  it('prefers the answer line over inline markers when they disagree', () => {
    const text = `Question 1 |
Pick one.
A. Foo [Correct]
B. Bar
Correct Answer: B`;
    const result = parseExamDump(text);
    expect(result.questions[0].correct_answers).toEqual(['B']);
    expect(result.questions[0].options[0]).toEqual({ id: 'A', text: 'Foo' });
  });

  it('parses an "Explanation" header without a colon', () => {
    const text = `Question 1 |
Pick one.
A. Foo
B. Bar
Correct Answer: B
Explanation
Bar is correct because of reasons.`;
    const result = parseExamDump(text);
    expect(result.questions[0].explanation).toBe('Bar is correct because of reasons.');
  });

  it('parses a full app-generated braindump block end to end', () => {
    const text = `Question 1   (source: page 2)
Which of the following job roles develops a model from business use cases?
A. Platform architect
B. AI risk analyst
C. MLOps engineer
D. Data scientist [Correct]
Correct Answer: D
Explanation
A data scientist translates business use cases into ML solutions.`;
    const result = parseExamDump(text);
    expect(result.success).toBe(true);
    expect(result.questions).toHaveLength(1);
    const q = result.questions[0];
    expect(q.question).toBe('Which of the following job roles develops a model from business use cases?');
    expect(q.options).toHaveLength(4);
    expect(q.options[3]).toEqual({ id: 'D', text: 'Data scientist' });
    expect(q.correct_answers).toEqual(['D']);
    expect(q.type).toBe('multiple_choice');
    expect(q.explanation).toContain('translates business use cases');
  });

  it('parses headerless exam dump with no "Question N" lines (CompTIA-style)', () => {
    const text = `What is the primary purpose of a firewall?
A. Encrypt network traffic
B. Filter incoming and outgoing network traffic
C. Compress data for faster transmission
D. Authenticate users before login
Answer: B
Explanation:
A firewall monitors and controls network traffic based on predefined security rules.
Authoritative Links for Further Research:
NIST Firewall Guidelines: https://example.com/nist-firewall

Which protocol operates at Layer 4 of the OSI model?
A. HTTP
B. IP
C. TCP
D. Ethernet
Answer: C
Explanation:
TCP operates at Layer 4 and provides reliable, connection-oriented delivery.`;
    const result = parseExamDump(text);
    expect(result.success).toBe(true);
    expect(result.questions).toHaveLength(2);
    expect(result.questions[0].question).toContain('primary purpose of a firewall');
    expect(result.questions[0].correct_answers).toEqual(['B']);
    expect(result.questions[0].links).toHaveLength(1);
    expect(result.questions[0].links![0].url).toBe('https://example.com/nist-firewall');
    expect(result.questions[1].question).toContain('Layer 4 of the OSI model');
    expect(result.questions[1].correct_answers).toEqual(['C']);
  });

  it('does not split on A./B. option-letter references inside explanation prose', () => {
    const text = `Which technique prevents malicious input at runtime?
A. Cross-validation
B. Feature regularization
C. Feature scaling
D. Guardrails
Answer: D
Explanation:
The other options are incorrect:
A. Cross-validation is a training technique, not a runtime security measure.
It does not prevent malicious input in production.
B. Feature regularization reduces overfitting during training only.
C. Feature scaling normalizes data ranges before training.`;
    const result = parseExamDump(text);
    expect(result.questions).toHaveLength(1);
    expect(result.questions[0].correct_answers).toEqual(['D']);
    expect(result.questions[0].explanation).toContain('Cross-validation is a training technique');
  });
});
