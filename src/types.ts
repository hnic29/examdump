export type QuestionType = 'multiple_choice' | 'true_false' | 'multi_select';
export type TimedMode = 'none' | 'total' | 'per_question' | 'both';

export interface QuestionOption {
  id: string;
  text: string;
}

export interface QuestionLink {
  text: string;
  url: string;
}

export interface QuestionBank {
  id: number;
  name: string;
  sourceFile: string;
  /** Unix timestamp in seconds */
  createdAt: number;
  questionCount: number;
}

export interface Question {
  id: number;
  bankId: number;
  questionText: string;
  questionType: QuestionType;
  options: QuestionOption[];
  correctAnswers: string[];
  explanation: string | null;
  links: QuestionLink[] | null;
  orderIndex: number;
}

export interface QuizAttempt {
  id: number;
  bankId: number;
  /** Unix timestamp in seconds */
  startedAt: number;
  /** Unix timestamp in seconds; null until the attempt is completed */
  completedAt: number | null;
  timedMode: TimedMode;
  totalTimeLimit: number | null;
  perQuestionTimeLimit: number | null;
  showAnswerImmediately: boolean;
  /** Percentage score 0–100, null until the attempt is completed */
  score: number | null;
  totalQuestions: number;
  correctCount: number;
}

export interface QuestionResponse {
  id: number;
  attemptId: number;
  questionId: number;
  selectedAnswers: string[];
  isCorrect: boolean;
  timeTaken: number;
}

export interface ParsedQuestion {
  question: string;
  type: QuestionType;
  options: QuestionOption[];
  /** snake_case intentional — matches the AI prompt's JSON output format */
  correct_answers: string[];
  explanation: string | null;
  links: QuestionLink[] | null;
}

export interface ParseResult {
  success: boolean;
  questions: ParsedQuestion[];
  confidence: number;
}

export interface CreateAttemptInput {
  bankId: number;
  timedMode: TimedMode;
  totalTimeLimit: number | null;
  perQuestionTimeLimit: number | null;
  showAnswerImmediately: boolean;
  totalQuestions: number;
}

export interface SaveResponseInput {
  attemptId: number;
  questionId: number;
  selectedAnswers: string[];
  isCorrect: boolean;
  timeTaken: number;
}

export interface CompleteAttemptInput {
  attemptId: number;
  correctCount: number;
  score: number;
}

export interface ElectronAPI {
  importFile: () => Promise<{ text: string; fileName: string } | null>;
  parseFile: (text: string) => Promise<ParseResult>;
  ingestJSON: (json: string, name: string) => Promise<{ id: number; questionCount: number }>;
  loadBanks: () => Promise<QuestionBank[]>;
  loadQuestions: (bankId: number) => Promise<Question[]>;
  deleteBank: (bankId: number) => Promise<void>;
  createAttempt: (input: CreateAttemptInput) => Promise<number>;
  saveResponse: (input: SaveResponseInput) => Promise<void>;
  completeAttempt: (input: CompleteAttemptInput) => Promise<void>;
  getHistory: (bankId: number) => Promise<QuizAttempt[]>;
  getResponses: (attemptId: number) => Promise<QuestionResponse[]>;
  openPanel: (url: string) => Promise<void>;
  closePanel: () => Promise<void>;
  generatePrompt: (text: string) => Promise<string>;
  copyToClipboard: (text: string) => Promise<void>;
  onPanelStateChanged: (cb: (open: boolean) => void) => () => void;
}
