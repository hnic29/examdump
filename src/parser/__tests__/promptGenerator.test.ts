import { describe, it, expect } from 'vitest';
import { generatePrompt } from '../promptGenerator';

describe('generatePrompt', () => {
  it('includes the document text between markers', () => {
    const prompt = generatePrompt('Hello exam content');
    expect(prompt).toContain('--- DOCUMENT START ---');
    expect(prompt).toContain('Hello exam content');
    expect(prompt).toContain('--- DOCUMENT END ---');
  });

  it('includes the JSON schema in the prompt', () => {
    const prompt = generatePrompt('content');
    expect(prompt).toContain('"questions"');
    expect(prompt).toContain('"correct_answers"');
    expect(prompt).toContain('multiple_choice');
    expect(prompt).toContain('multi_select');
    expect(prompt).toContain('true_false');
  });
});
