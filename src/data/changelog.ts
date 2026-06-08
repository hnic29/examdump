export interface ChangelogEntry {
  version: string;
  date: string;
  changes: string[];
}

export const CHANGELOG: ChangelogEntry[] = [
  { version: '1.2.0', date: 'June 2026', changes: [
      'Splash screen on launch',
      'Live clock in the bottom status bar',
      'Drag-to-resize the AI / browser panel',
      'This changelog',
  ]},
  { version: '1.1.0', date: 'June 2026', changes: [
      'Resume an unfinished quiz where you left off',
      'Waterfall mode advances only after you finish the day\'s set',
  ]},
  { version: '1.0.0', date: 'June 2026', changes: ['First release'] },
];
