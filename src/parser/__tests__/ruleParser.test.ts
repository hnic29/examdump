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
});
