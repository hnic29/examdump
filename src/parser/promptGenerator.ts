export function generatePrompt(documentText: string): string {
  return `Parse the following exam document into this exact JSON format and return ONLY the JSON, no other text:

{
  "questions": [
    {
      "question": "Question text here",
      "type": "multiple_choice",
      "options": [{"id": "A", "text": "Option text"}],
      "correct_answers": ["A"],
      "explanation": "Why this is correct, or null if not provided",
      "links": [{"text": "Link label", "url": "https://example.com"}]
    }
  ]
}

Rules:
- "type" must be one of: "multiple_choice" (one correct), "multi_select" (multiple correct), "true_false"
- For true_false: options must be [{"id":"A","text":"True"},{"id":"B","text":"False"}]
- "explanation" is null if no explanation is present in the source
- "links" is null if no authoritative links are present
- "correct_answers" is an array of option id strings, e.g. ["A"] or ["A","C"]

--- DOCUMENT START ---
${documentText}
--- DOCUMENT END ---`;
}
