export interface HandoffQualityInput {
  preferenceCount: number;
  activeProblemCount: number;
  decisionCount: number;
  noteCount: number;
  hiddenNonConfirmedCount: number;
}

export interface HandoffProfile {
  runCommands: string[];
  verificationCommands: string[];
}

export interface HandoffQuality {
  score: number;
  gaps: string[];
  runCommands: string[];
  verificationCommands: string[];
}

export function getHandoffProfile(): HandoffProfile {
  return {
    runCommands: [
      'npm.cmd run dev',
      'npm.cmd run dev:server',
      'npm.cmd run dev:gui',
    ],
    verificationCommands: [
      'npm.cmd run build:backend',
      'npm.cmd run typecheck:gui',
      'npm.cmd run check',
    ],
  };
}

export function buildHandoffQuality(input: HandoffQualityInput): HandoffQuality {
  const profile = getHandoffProfile();
  const gaps = [
    input.preferenceCount === 0 ? 'No confirmed user preferences.' : '',
    input.activeProblemCount === 0 ? 'No confirmed active risks or problems.' : '',
    input.decisionCount === 0 ? 'No confirmed recent decisions.' : '',
    input.noteCount === 0 ? 'No confirmed recent implementation notes.' : '',
    input.hiddenNonConfirmedCount > 0 ? 'There are non-confirmed memories hidden from default context.' : '',
  ].filter(Boolean);

  return {
    score: Math.max(0, 100 - gaps.length * 15),
    gaps,
    ...profile,
  };
}
