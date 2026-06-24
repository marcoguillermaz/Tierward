import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  parseActiveSkills,
  parseStopHookTestCmd,
  claudeMdContainsCommand,
  hasPlaceholder,
  detectPipelineTier,
  detectPhaseCountTier,
  detectSecurityVariant,
  expectedSecurityVariant,
} from '../../src/utils/doctor-cross-file.js';

describe('parseActiveSkills', () => {
  it('extracts skill names from Active Skills section', () => {
    const md = `# Project

## Active Skills

- \`/arch-audit\`
- \`/commit\`
- \`/security-audit\`

## Environment
`;
    assert.deepEqual(parseActiveSkills(md), ['arch-audit', 'commit', 'security-audit']);
  });

  it('returns empty when section missing', () => {
    assert.deepEqual(parseActiveSkills('# No section here'), []);
  });

  it('ignores non-skill bullets in section', () => {
    const md = `## Active Skills\n\n- plain text\n- \`/valid-skill\`\n\n## Next`;
    assert.deepEqual(parseActiveSkills(md), ['valid-skill']);
  });
});

describe('parseStopHookTestCmd', () => {
  it('extracts command between exit 0 and ||', () => {
    const settings = {
      hooks: {
        Stop: [
          {
            hooks: [
              {
                type: 'command',
                command: '[ "$stop_hook_active" = "1" ] && exit 0; npm test || echo "fail"',
              },
            ],
          },
        ],
      },
    };
    assert.equal(parseStopHookTestCmd(settings), 'npm test');
  });

  it('returns null when no Stop hook', () => {
    assert.equal(parseStopHookTestCmd({}), null);
  });

  it('returns null on malformed shape', () => {
    assert.equal(parseStopHookTestCmd({ hooks: { Stop: 'oops' } }), null);
  });

  it('preserves placeholder when still unfilled', () => {
    const settings = {
      hooks: {
        Stop: [
          {
            hooks: [
              { command: '[ "$stop_hook_active" = "1" ] && exit 0; [TEST_COMMAND] || echo x' },
            ],
          },
        ],
      },
    };
    assert.equal(parseStopHookTestCmd(settings), '[TEST_COMMAND]');
  });

  it('extracts tier M/L command wrapped in cd + pipe to tail', () => {
    const settings = {
      hooks: {
        Stop: [
          {
            hooks: [
              {
                command:
                  '[ "$stop_hook_active" = "1" ] && exit 0; cd $CLAUDE_PROJECT_DIR && npx vitest run 2>&1 | tail -5; [[ ${PIPESTATUS[0]} -ne 0 ]] && echo x',
              },
            ],
          },
        ],
      },
    };
    assert.equal(parseStopHookTestCmd(settings), 'npx vitest run');
  });

  it('extracts tier M/L command from OUT=$(...) capture form (v1.33.5+)', () => {
    const settings = {
      hooks: {
        Stop: [
          {
            hooks: [
              {
                command:
                  '[ "$stop_hook_active" = "1" ] && exit 0; cd "$CLAUDE_PROJECT_DIR" || exit 0; OUT=$(npm run build 2>&1); CODE=$?; [ "$CODE" -ne 0 ] && { echo "$OUT" | tail -5 >&2; echo x; }; exit 0',
              },
            ],
          },
        ],
      },
    };
    assert.equal(parseStopHookTestCmd(settings), 'npm run build');
  });
});

describe('claudeMdContainsCommand', () => {
  it('finds command inside Key Commands block only', () => {
    const md = `## Key Commands\n\n\`\`\`bash\nnpm install\nnpm test\n\`\`\`\n\n## Other`;
    assert.equal(claudeMdContainsCommand(md, 'npm test'), true);
    assert.equal(claudeMdContainsCommand(md, 'pytest'), false);
  });

  it('returns false when Key Commands section missing', () => {
    assert.equal(claudeMdContainsCommand('# No commands', 'npm test'), false);
  });

  it('returns false for empty command', () => {
    assert.equal(claudeMdContainsCommand('## Key Commands\nanything', ''), false);
  });
});

describe('hasPlaceholder', () => {
  it('detects placeholder tokens', () => {
    assert.equal(hasPlaceholder('value: [TEST_COMMAND]'), true);
    assert.equal(hasPlaceholder('[FRAMEWORK_VALUE]'), true);
    assert.equal(hasPlaceholder('[A_B_C_1]'), true);
  });

  it('does not flag lowercase or mixed', () => {
    assert.equal(hasPlaceholder('[lowercase]'), false);
    assert.equal(hasPlaceholder('no brackets here'), false);
    assert.equal(hasPlaceholder('[Mixed_Case]'), false);
  });
});

describe('detectPipelineTier', () => {
  it('recognises tier S Fast Lane', () => {
    assert.equal(detectPipelineTier('# Fast Lane Pipeline\n\nstuff'), 's');
  });

  it('recognises tier M', () => {
    assert.equal(detectPipelineTier('# Standard Development Pipeline - Tier M\n'), 'm');
  });

  it('recognises tier L', () => {
    assert.equal(detectPipelineTier('# Full Development Pipeline - Tier L\n'), 'l');
  });

  it('returns unknown for unexpected H1', () => {
    assert.equal(detectPipelineTier('# Something Else'), 'unknown');
  });
});

describe('detectPhaseCountTier', () => {
  it('tier S detected via FL-N sections', () => {
    assert.equal(detectPhaseCountTier('## FL-0 Setup\n## FL-1 Implement'), 's');
  });

  it('tier L detected via Phase 1.6', () => {
    assert.equal(detectPhaseCountTier('## Phase 1\n## Phase 1.6 Visual Design\n## Phase 2'), 'l');
  });

  it('tier M detected via plain Phase N', () => {
    assert.equal(detectPhaseCountTier('## Phase 0\n## Phase 1\n## Phase 2'), 'm');
  });
});

describe('detectSecurityVariant', () => {
  it('H1 apple signature', () => {
    assert.equal(
      detectSecurityVariant('# Security Rules - Native Apple (macOS / iOS)\n'),
      'native-apple',
    );
  });

  it('H1 android signature', () => {
    assert.equal(
      detectSecurityVariant('# Security Rules - Native Android (Kotlin / Java)\n'),
      'native-android',
    );
  });

  it('H1 systems signature', () => {
    assert.equal(
      detectSecurityVariant(
        '# Security Rules - Systems & Backend (Rust / Go / .NET / Java / C++)\n',
      ),
      'systems',
    );
  });

  it('H1 web signature (exact, no suffix)', () => {
    assert.equal(detectSecurityVariant('# Security Rules\n\nmore'), 'web');
  });

  it('falls back to content markers when H1 modified', () => {
    const md = '# Custom Rules\n\nStore secrets in Android Keystore only.';
    assert.equal(detectSecurityVariant(md), 'native-android');
  });
});

describe('expectedSecurityVariant', () => {
  it('swift → native-apple', () => {
    assert.equal(expectedSecurityVariant('swift', false), 'native-apple');
  });

  it('kotlin → native-android', () => {
    assert.equal(expectedSecurityVariant('kotlin', false), 'native-android');
  });

  it('rust without API → systems', () => {
    assert.equal(expectedSecurityVariant('rust', false), 'systems');
  });

  it('rust with API → web', () => {
    assert.equal(expectedSecurityVariant('rust', true), 'web');
  });

  it('node-ts → web', () => {
    assert.equal(expectedSecurityVariant('node-ts', true), 'web');
  });
});
