import chalk from 'chalk';
import fs from 'fs-extra';
import path from 'path';
import { execSync } from 'child_process';
import {
  CLAUDE_MD_MAX_LINES,
  SKILL_MD_MAX_LINES,
  STOP_HOOK_MAX_TIMEOUT_SEC,
} from '../utils/constants.js';
import {
  parseSkillFile,
  countBodyLines,
  allowedToolsHasCommas,
} from '../utils/skill-frontmatter.js';
import {
  parseActiveSkills,
  parseStopHookTestCmd,
  claudeMdContainsCommand,
  hasPlaceholder,
  detectPipelineTier,
  detectPhaseCountTier,
  detectSecurityVariant,
  expectedSecurityVariant,
  detectStackSync,
} from '../utils/doctor-cross-file.js';
import { fileURLToPath } from 'url';
import { ANTHROPIC_FILES, detectScaffoldedTier } from './upgrade.js';
import {
  readTeamSettings,
  violatesMinTier,
  isSkillBlocked,
  getRequiredSkills,
} from '../utils/team-settings.js';

const __doctorDirname = path.dirname(fileURLToPath(import.meta.url));
const TEMPLATES_DIR_FOR_DOCTOR = path.resolve(__doctorDirname, '../../templates');

const checks = [
  {
    id: 'claude-cli',
    label: 'Claude Code CLI installed',
    check: () => {
      try {
        execSync('claude --version', { stdio: 'pipe' });
        return { pass: true };
      } catch {
        return { pass: false, fix: 'Install Claude Code: https://claude.ai/code' };
      }
    },
  },
  {
    id: 'claude-md',
    label: 'CLAUDE.md present',
    check: (cwd) => {
      const exists = fs.existsSync(path.join(cwd, 'CLAUDE.md'));
      return {
        pass: exists,
        fix: 'Run `tierward init` to scaffold CLAUDE.md',
      };
    },
  },
  {
    id: 'claude-md-size',
    label: `CLAUDE.md under ${CLAUDE_MD_MAX_LINES} lines`,
    check: (cwd) => {
      const p = path.join(cwd, 'CLAUDE.md');
      if (!fs.existsSync(p)) return { pass: true, skip: true };
      const lines = fs.readFileSync(p, 'utf8').split('\n').length;
      return {
        pass: lines <= CLAUDE_MD_MAX_LINES,
        info: `${lines} lines`,
        fix: `Trim CLAUDE.md to under ${CLAUDE_MD_MAX_LINES} lines. Move stable patterns to .claude/rules/ with path-scoped files.`,
      };
    },
  },
  {
    id: 'settings-json',
    label: '.claude/settings.json present',
    check: (cwd) => {
      const exists = fs.existsSync(path.join(cwd, '.claude', 'settings.json'));
      return {
        pass: exists,
        fix: 'Run `tierward init` or copy from the template.',
      };
    },
  },
  {
    id: 'pipeline-md',
    label: '.claude/rules/pipeline.md present',
    check: (cwd) => {
      const exists = fs.existsSync(path.join(cwd, '.claude', 'rules', 'pipeline.md'));
      return {
        pass: exists,
        fix: 'Run `tierward init` to scaffold the pipeline.',
      };
    },
  },
  {
    id: 'security-rules',
    label: '.claude/rules/security.md present',
    check: (cwd) => {
      const exists = fs.existsSync(path.join(cwd, '.claude', 'rules', 'security.md'));
      return {
        pass: exists,
        warn: true,
        fix: 'Copy security.md from the tierward template.',
      };
    },
  },
  {
    id: 'gitignore-env',
    label: '.env files in .gitignore',
    check: (cwd) => {
      const p = path.join(cwd, '.gitignore');
      if (!fs.existsSync(p))
        return { pass: false, fix: 'Create a .gitignore file that excludes .env files.' };
      const content = fs.readFileSync(p, 'utf8');
      const covered = content.includes('.env') || content.includes('.env.local');
      return {
        pass: covered,
        fix: 'Add `.env*` to .gitignore to prevent accidental credential commits.',
      };
    },
  },
  {
    id: 'no-secrets-claude-md',
    label: 'No secrets in CLAUDE.md',
    check: (cwd) => {
      const p = path.join(cwd, 'CLAUDE.md');
      if (!fs.existsSync(p)) return { pass: true, skip: true };
      const content = fs.readFileSync(p, 'utf8');
      const patterns = [
        /sk_live_\w{10,}/,
        /sbp_\w{10,}/,
        /re_[a-zA-Z0-9]{10,}/,
        /password\s*[:=]\s*["'][^"']{6,}/i,
      ];
      const hit = patterns.some((r) => r.test(content));
      return {
        pass: !hit,
        fix: 'Remove credentials from CLAUDE.md immediately and rotate the exposed secret.',
      };
    },
  },
  {
    id: 'stop-hook',
    label: 'Stop hook configured (test gate)',
    check: (cwd) => {
      const p = path.join(cwd, '.claude', 'settings.json');
      if (!fs.existsSync(p))
        return {
          pass: false,
          warn: true,
          fix: 'Add a Stop hook to settings.json to enforce test-passing before task completion.',
        };
      try {
        const settings = JSON.parse(fs.readFileSync(p, 'utf8'));
        const hasStop = settings?.hooks?.Stop?.length > 0;
        return {
          pass: hasStop,
          warn: true,
          fix: 'Add a Stop hook that runs your test command. Claude cannot declare completion until tests pass.',
        };
      } catch {
        return { pass: false, fix: 'settings.json is not valid JSON.' };
      }
    },
  },
  {
    id: 'stop-hook-placeholder',
    label: 'Stop hook uses a real test command (no unfilled placeholder)',
    check: (cwd) => {
      const p = path.join(cwd, '.claude', 'settings.json');
      if (!fs.existsSync(p)) return { pass: true, skip: true };
      try {
        const settings = JSON.parse(fs.readFileSync(p, 'utf8'));
        const stopHooks = settings?.hooks?.Stop || [];
        if (stopHooks.length === 0) return { pass: true, skip: true };
        const hasPlaceholder = stopHooks.some((entry) =>
          (entry?.hooks || []).some(
            (h) => typeof h.command === 'string' && h.command.includes('[TEST_COMMAND]'),
          ),
        );
        return {
          pass: !hasPlaceholder,
          fix: 'The Stop hook still contains [TEST_COMMAND] placeholder. Edit .claude/settings.json and replace it with your actual test command (e.g. "npm test").',
        };
      } catch {
        return { pass: true, skip: true };
      }
    },
  },
  {
    id: 'codeowners',
    label: '.github/CODEOWNERS includes .claude/',
    check: (cwd) => {
      const githubDir = path.join(cwd, '.github');
      const p = path.join(githubDir, 'CODEOWNERS');
      // If .github/ is absent the user opted out of GitHub files - skip silently
      if (!fs.existsSync(githubDir)) return { skip: true };
      if (!fs.existsSync(p))
        return {
          pass: false,
          warn: true,
          fix: 'Create .github/CODEOWNERS and add /.claude/ with tech lead as required reviewer.',
        };
      const content = fs.readFileSync(p, 'utf8');
      return {
        pass: content.includes('.claude/'),
        warn: true,
        fix: 'Add `/.claude/ @tech-lead` to CODEOWNERS - Claude config changes should require human review.',
      };
    },
  },
  {
    id: 'output-style-rule',
    label: '.claude/rules/output-style.md present (all tiers)',
    check: (cwd) => {
      // output-style.md ships in every tier (0/S/M/L), so gate on the scaffold
      // signal (settings.json) rather than pipeline.md - tier 0 has no pipeline
      // but does ship output-style.md.
      const isScaffold = fs.existsSync(path.join(cwd, '.claude', 'settings.json'));
      if (!isScaffold) return { pass: true, skip: true };
      const exists = fs.existsSync(path.join(cwd, '.claude', 'rules', 'output-style.md'));
      return {
        pass: exists,
        warn: true,
        fix: 'Run `tierward upgrade` to add output-style.md, or copy from the template.',
      };
    },
  },
  {
    id: 'claudemd-standards-rule',
    label: 'docs/claudemd-standards.md present (tier M/L)',
    check: (cwd) => {
      const hasPipeline = fs.existsSync(path.join(cwd, '.claude', 'rules', 'pipeline.md'));
      if (!hasPipeline) return { pass: true, skip: true };
      const exists = fs.existsSync(path.join(cwd, 'docs', 'claudemd-standards.md'));
      return {
        pass: exists,
        warn: true,
        fix: 'Run `tierward upgrade` to add docs/claudemd-standards.md, or copy from the template.',
      };
    },
  },
  {
    id: 'pipeline-standards-rule',
    label: 'docs/pipeline-standards.md present (tier M/L)',
    check: (cwd) => {
      const hasPipeline = fs.existsSync(path.join(cwd, '.claude', 'rules', 'pipeline.md'));
      if (!hasPipeline) return { pass: true, skip: true };
      const exists = fs.existsSync(path.join(cwd, 'docs', 'pipeline-standards.md'));
      return {
        pass: exists,
        warn: true,
        fix: 'Run `tierward upgrade` to add docs/pipeline-standards.md, or copy from the template.',
      };
    },
  },
  {
    id: 'commit-skill',
    label: '.claude/skills/commit/ present (tier M/L)',
    check: (cwd) => {
      const skillsDir = path.join(cwd, '.claude', 'skills');
      if (!fs.existsSync(skillsDir)) return { pass: true, skip: true };
      const exists = fs.existsSync(path.join(skillsDir, 'commit', 'SKILL.md'));
      return {
        pass: exists,
        warn: true,
        fix: 'Run `tierward upgrade` to add the commit skill, or copy from the template.',
      };
    },
  },
  {
    id: 'skill-allowed-tools',
    label: 'Skills using Playwright declare allowed-tools frontmatter',
    check: (cwd) => {
      const skillsDir = path.join(cwd, '.claude', 'skills');
      if (!fs.existsSync(skillsDir)) return { pass: true, skip: true };
      const missingTools = [];
      try {
        const skills = fs.readdirSync(skillsDir);
        for (const skill of skills) {
          const skillFile = path.join(skillsDir, skill, 'SKILL.md');
          if (!fs.existsSync(skillFile)) continue;
          const content = fs.readFileSync(skillFile, 'utf8');
          const usesPlaywright = content.includes('browser_');
          const hasAllowedTools = content.startsWith('---') && content.includes('allowed-tools');
          if (usesPlaywright && !hasAllowedTools) missingTools.push(skill);
        }
      } catch {
        return { pass: true, skip: true };
      }
      return {
        pass: missingTools.length === 0,
        warn: true,
        info: missingTools.length > 0 ? missingTools.join(', ') : undefined,
        fix: `Add 'allowed-tools: Playwright' frontmatter to: ${missingTools.join(', ')}`,
      };
    },
  },
  {
    id: 'skill-allowed-tools-syntax',
    label: `Skills use space-separated allowed-tools (Anthropic spec)`,
    check: (cwd) => {
      const skillsDir = path.join(cwd, '.claude', 'skills');
      if (!fs.existsSync(skillsDir)) return { pass: true, skip: true };
      const offenders = [];
      try {
        for (const skill of fs.readdirSync(skillsDir)) {
          const skillFile = path.join(skillsDir, skill, 'SKILL.md');
          if (!fs.existsSync(skillFile)) continue;
          const { fields } = parseSkillFile(fs.readFileSync(skillFile, 'utf8'));
          if (allowedToolsHasCommas(fields.allowedTools)) offenders.push(skill);
        }
      } catch {
        return { pass: true, skip: true };
      }
      return {
        pass: offenders.length === 0,
        warn: true,
        info: offenders.length > 0 ? offenders.join(', ') : undefined,
        fix: `Replace commas with spaces in allowed-tools frontmatter (Anthropic spec: space-separated string or YAML list). Affected: ${offenders.join(', ')}`,
      };
    },
  },
  {
    id: 'skill-md-size-budget',
    label: `Skill bodies respect Anthropic ≤ ${SKILL_MD_MAX_LINES} lines guideline`,
    check: (cwd) => {
      const skillsDir = path.join(cwd, '.claude', 'skills');
      if (!fs.existsSync(skillsDir)) return { pass: true, skip: true };
      const oversize = [];
      try {
        for (const skill of fs.readdirSync(skillsDir)) {
          const skillFile = path.join(skillsDir, skill, 'SKILL.md');
          if (!fs.existsSync(skillFile)) continue;
          const { body } = parseSkillFile(fs.readFileSync(skillFile, 'utf8'));
          const lines = countBodyLines(body);
          if (lines > SKILL_MD_MAX_LINES) oversize.push(`${skill} (${lines})`);
        }
      } catch {
        return { pass: true, skip: true };
      }
      return {
        pass: oversize.length === 0,
        warn: true,
        info: oversize.length > 0 ? oversize.join(', ') : undefined,
        fix: `Extract detailed sections into sibling reference files (progressive disclosure). Over budget: ${oversize.join(', ')}`,
      };
    },
  },
  {
    id: 'settings-no-placeholders',
    label: '.claude/settings.json has no unfilled placeholders',
    check: (cwd) => {
      const p = path.join(cwd, '.claude', 'settings.json');
      if (!fs.existsSync(p)) return { pass: true, skip: true };
      const raw = fs.readFileSync(p, 'utf8');
      const pass = !hasPlaceholder(raw);
      return {
        pass,
        warn: true,
        info: pass ? undefined : 'placeholder tokens like [TEST_COMMAND] still present',
        fix: 'Fill or remove [UPPERCASE_TOKEN] placeholders in .claude/settings.json before using the scaffold.',
      };
    },
  },
  {
    id: 'claudemd-stop-hook-test-cmd-match',
    label: 'CLAUDE.md Key Commands include the Stop hook test command',
    check: (cwd) => {
      const claudePath = path.join(cwd, 'CLAUDE.md');
      const settingsPath = path.join(cwd, '.claude', 'settings.json');
      if (!fs.existsSync(claudePath) || !fs.existsSync(settingsPath)) {
        return { pass: true, skip: true };
      }
      let settings;
      try {
        settings = JSON.parse(fs.readFileSync(settingsPath, 'utf8'));
      } catch {
        return { pass: true, skip: true };
      }
      const testCmd = parseStopHookTestCmd(settings);
      if (!testCmd || hasPlaceholder(testCmd)) return { pass: true, skip: true };
      const claudeMd = fs.readFileSync(claudePath, 'utf8');
      const pass = claudeMdContainsCommand(claudeMd, testCmd);
      return {
        pass,
        warn: true,
        info: pass
          ? undefined
          : `Stop hook runs "${testCmd}" but CLAUDE.md Key Commands does not mention it`,
        fix: `Align CLAUDE.md Key Commands with Stop hook: add "${testCmd}" or update the Stop hook to match.`,
      };
    },
  },
  {
    id: 'claudemd-skills-directory-parity',
    label: 'CLAUDE.md Active Skills matches .claude/skills/ directories',
    check: (cwd) => {
      const claudePath = path.join(cwd, 'CLAUDE.md');
      const skillsDir = path.join(cwd, '.claude', 'skills');
      if (!fs.existsSync(claudePath) || !fs.existsSync(skillsDir)) {
        return { pass: true, skip: true };
      }
      const claudeMd = fs.readFileSync(claudePath, 'utf8');
      const declared = new Set(parseActiveSkills(claudeMd));
      if (declared.size === 0) return { pass: true, skip: true };
      let installed;
      try {
        installed = new Set(
          fs
            .readdirSync(skillsDir, { withFileTypes: true })
            .filter((e) => e.isDirectory() && !e.name.startsWith('custom-'))
            .map((e) => e.name),
        );
      } catch {
        return { pass: true, skip: true };
      }
      const declaredMissing = [...declared].filter((s) => !installed.has(s));
      const installedNotDeclared = [...installed].filter((s) => !declared.has(s));
      const pass = declaredMissing.length === 0 && installedNotDeclared.length === 0;
      const problems = [];
      if (declaredMissing.length)
        problems.push(`declared but missing: ${declaredMissing.join(', ')}`);
      if (installedNotDeclared.length)
        problems.push(`installed but not declared: ${installedNotDeclared.join(', ')}`);
      return {
        pass,
        warn: true,
        info: pass ? undefined : problems.join(' · '),
        fix: 'Align CLAUDE.md "## Active Skills" with the directories under .claude/skills/ (custom-* skills are exempt).',
      };
    },
  },
  {
    id: 'pipeline-md-tier-coherence',
    label: 'pipeline.md H1 matches its phase structure (Tier S/M/L self-consistency)',
    check: (cwd) => {
      const p = path.join(cwd, '.claude', 'rules', 'pipeline.md');
      if (!fs.existsSync(p)) return { pass: true, skip: true };
      const content = fs.readFileSync(p, 'utf8');
      const declaredTier = detectPipelineTier(content);
      if (declaredTier === 'unknown') {
        return {
          pass: false,
          warn: true,
          info: 'pipeline.md H1 does not declare a tier (Fast Lane / Tier M / Tier L)',
          fix: 'Restore the canonical H1 from the Tierward template (Fast Lane Pipeline, Standard Development Pipeline - Tier M, or Full Development Pipeline - Tier L).',
        };
      }
      const bodyTier = detectPhaseCountTier(content);
      const pass = bodyTier === 'unknown' || bodyTier === declaredTier;
      return {
        pass,
        warn: true,
        info: pass
          ? undefined
          : `H1 declares Tier ${declaredTier.toUpperCase()} but phase markers look like Tier ${bodyTier.toUpperCase()}`,
        fix: 'Reconcile pipeline.md: H1 and phase sections must agree on tier. Reinstall via `tierward init --tier=<tier>` (choose "Existing project") if in doubt.',
      };
    },
  },
  {
    id: 'security-md-stack-alignment',
    label: 'security.md variant matches the detected stack',
    check: (cwd) => {
      const securityPath = path.join(cwd, '.claude', 'rules', 'security.md');
      if (!fs.existsSync(securityPath)) return { pass: true, skip: true };
      const stack = detectStackSync(cwd);
      if (!stack) return { pass: true, skip: true, info: 'stack not detectable in this directory' };
      const securityMd = fs.readFileSync(securityPath, 'utf8');
      const actual = detectSecurityVariant(securityMd);
      if (actual === 'unknown') {
        return {
          pass: false,
          warn: true,
          info: 'security.md variant could not be identified (H1 and content markers absent)',
          fix: 'Reinstall security.md via `tierward upgrade` so the correct variant is written.',
        };
      }
      const hasApi = fs.existsSync(path.join(cwd, 'CLAUDE.md'))
        ? /^##\s*API/im.test(fs.readFileSync(path.join(cwd, 'CLAUDE.md'), 'utf8'))
        : true;
      const expected = expectedSecurityVariant(stack, hasApi);
      const pass = actual === expected;
      return {
        pass,
        warn: true,
        info: pass
          ? undefined
          : `stack "${stack}" expects "${expected}" variant, found "${actual}"`,
        fix: `Reinstall security.md for stack "${stack}" via \`tierward upgrade\` — expected variant "${expected}".`,
      };
    },
  },
  {
    id: 'context-review-c12',
    label: 'context-review.md includes C12 (canonical docs currency)',
    check: (cwd) => {
      const p = path.join(cwd, '.claude', 'rules', 'context-review.md');
      if (!fs.existsSync(p)) return { pass: true, skip: true };
      const content = fs.readFileSync(p, 'utf8');
      return {
        pass: content.includes('C12'),
        warn: true,
        fix: 'Run `tierward upgrade` to update context-review.md to include C12 (canonical docs currency check).',
      };
    },
  },
  {
    id: 'stop-hook-timeout',
    label: 'Stop hook has timeout configured',
    check: (cwd) => {
      const p = path.join(cwd, '.claude', 'settings.json');
      if (!fs.existsSync(p)) return { pass: true, skip: true };
      try {
        const settings = JSON.parse(fs.readFileSync(p, 'utf8'));
        const stopHooks = settings?.hooks?.Stop || [];
        if (stopHooks.length === 0) return { pass: true, skip: true };
        const allHaveTimeout = stopHooks.every((entry) => {
          // Timeout can be at outer level (entry.timeout) or inner level (entry.hooks[].timeout)
          if (typeof entry.timeout === 'number' && entry.timeout <= STOP_HOOK_MAX_TIMEOUT_SEC)
            return true;
          const inner = entry.hooks || [];
          return inner.every(
            (h) => typeof h.timeout === 'number' && h.timeout <= STOP_HOOK_MAX_TIMEOUT_SEC,
          );
        });
        return {
          pass: allHaveTimeout,
          warn: true,
          fix: 'Add "timeout": 300 to each Stop hook entry in .claude/settings.json (value is in seconds). Without a timeout, a hanging test command blocks Claude indefinitely.',
        };
      } catch {
        return { pass: true, skip: true };
      }
    },
  },
  {
    id: 'anthropic-files-current',
    label:
      'Anthropic-influenced files (arch-audit, claudemd-standards, pipeline-standards) match the installed Tierward template',
    check: (cwd) => {
      const tier = detectScaffoldedTier(cwd);
      if (!tier) return { pass: true, skip: true };
      const drifted = [];
      for (const entry of ANTHROPIC_FILES) {
        const targetPath = path.join(cwd, entry.target);
        if (!fs.existsSync(targetPath)) continue;
        const templatePath = entry.template
          ? path.join(TEMPLATES_DIR_FOR_DOCTOR, entry.template)
          : entry.templateTierAware
            ? path.join(TEMPLATES_DIR_FOR_DOCTOR, entry.templateTierAware.replace('{TIER}', tier))
            : null;
        if (!templatePath || !fs.existsSync(templatePath)) continue;
        const tpl = fs.readFileSync(templatePath, 'utf8');
        const tgt = fs.readFileSync(targetPath, 'utf8');
        if (tpl !== tgt) drifted.push(entry.target);
      }
      return {
        pass: drifted.length === 0,
        warn: true,
        info: drifted.length > 0 ? `drift: ${drifted.join(', ')}` : undefined,
        fix: `Run \`tierward upgrade --anthropic\` to view diff, then \`--anthropic --apply\` to refresh${drifted.length > 0 ? ` (${drifted.length} file${drifted.length === 1 ? '' : 's'})` : ''}.`,
      };
    },
  },
  {
    id: 'team-settings-compliance',
    label: 'Repo state matches .claude/team-settings.json (minTier, blockedSkills, requiredSkills)',
    check: (cwd) => {
      let settings;
      try {
        settings = readTeamSettings(cwd);
      } catch (err) {
        return {
          pass: false,
          warn: true,
          info: err.message,
          fix: 'Edit .claude/team-settings.json to match the schema (minTier: s|m|l, allowedSkills/blockedSkills/requiredSkills as string arrays).',
        };
      }
      if (!settings) return { pass: true, skip: true };

      const violations = [];
      const tier = detectScaffoldedTier(cwd);
      if (tier) {
        const minViolation = violatesMinTier(settings, tier);
        if (minViolation) {
          violations.push(`minTier=${minViolation} but scaffold is tier ${tier}`);
        }
      }

      const skillsDir = path.join(cwd, '.claude', 'skills');
      const installed = fs.existsSync(skillsDir)
        ? fs
            .readdirSync(skillsDir, { withFileTypes: true })
            .filter((e) => e.isDirectory())
            .map((e) => e.name)
        : [];

      const blockedPresent = installed.filter((s) => isSkillBlocked(settings, s));
      if (blockedPresent.length > 0) {
        violations.push(`blocked skills installed: ${blockedPresent.join(', ')}`);
      }

      const required = getRequiredSkills(settings);
      const missingRequired = required.filter((s) => !installed.includes(s));
      if (missingRequired.length > 0) {
        violations.push(`required skills missing: ${missingRequired.join(', ')}`);
      }

      return {
        pass: violations.length === 0,
        warn: true,
        info: violations.length > 0 ? violations.join('; ') : undefined,
        fix:
          violations.length > 0
            ? 'Resolve each violation: re-init at the higher tier, remove blocked skills with `rm -rf .claude/skills/<name>`, add required skills with `tierward add skill <name>`.'
            : undefined,
      };
    },
  },
  {
    id: 'team-settings-runtime-hook',
    label:
      '`team-settings.json` runtime enforcement hook is wired (`.claude/hooks/team-settings-enforcement.mjs` + PreToolUse Skill matcher in settings.json)',
    check: (cwd) => {
      const teamSettingsPath = path.join(cwd, '.claude', 'team-settings.json');
      if (!fs.existsSync(teamSettingsPath)) return { pass: true, skip: true };

      const hookScript = path.join(cwd, '.claude', 'hooks', 'team-settings-enforcement.mjs');
      if (!fs.existsSync(hookScript)) {
        return {
          pass: false,
          warn: true,
          info: 'team-settings.json present but `.claude/hooks/team-settings-enforcement.mjs` missing — runtime enforcement disabled (CLI-side enforcement only).',
          fix: 'Run `tierward upgrade` to refresh the hook script, or copy it manually from the Tierward template.',
        };
      }

      const settingsPath = path.join(cwd, '.claude', 'settings.json');
      if (!fs.existsSync(settingsPath)) {
        return {
          pass: false,
          warn: true,
          info: 'team-settings.json + hook script present, but `.claude/settings.json` missing — hook will not fire.',
          fix: 'Run `tierward init` to scaffold settings.json, or restore from the Tierward template.',
        };
      }

      try {
        const settings = JSON.parse(fs.readFileSync(settingsPath, 'utf8'));
        const preToolUse = settings?.hooks?.PreToolUse || [];
        const skillMatcher = preToolUse.find((entry) => entry.matcher === 'Skill');
        const hasHook = skillMatcher?.hooks?.some(
          (h) => typeof h.command === 'string' && /team-settings-enforcement\.mjs/.test(h.command),
        );
        if (!hasHook) {
          return {
            pass: false,
            warn: true,
            info: '`.claude/settings.json` does not register the team-settings PreToolUse hook for the Skill matcher.',
            fix: 'Add a PreToolUse entry with matcher \'Skill\' that runs `node "$CLAUDE_PROJECT_DIR/.claude/hooks/team-settings-enforcement.mjs"` (timeout: 5).',
          };
        }
      } catch (err) {
        return {
          pass: false,
          warn: true,
          info: `Could not parse settings.json: ${err.message}`,
          fix: 'Fix the JSON syntax in .claude/settings.json.',
        };
      }

      return { pass: true };
    },
  },
  {
    id: 'permissions-no-duplicates',
    label: 'No duplicate entries in permissions deny list',
    check: (cwd) => {
      const p = path.join(cwd, '.claude', 'settings.json');
      if (!fs.existsSync(p)) return { pass: true, skip: true };
      try {
        const settings = JSON.parse(fs.readFileSync(p, 'utf8'));
        const deny = settings?.permissions?.deny;
        if (!Array.isArray(deny) || deny.length === 0) return { pass: true, skip: true };
        const seen = new Set();
        const dupes = [];
        for (const entry of deny) {
          if (seen.has(entry)) dupes.push(entry);
          seen.add(entry);
        }
        return {
          pass: dupes.length === 0,
          warn: true,
          info: dupes.length > 0 ? `duplicates: ${dupes.join(', ')}` : undefined,
          fix: `Remove duplicate entries from permissions.deny in .claude/settings.json: ${dupes.join(', ')}`,
        };
      } catch {
        return { pass: true, skip: true };
      }
    },
  },
];

export async function doctor(options = {}) {
  const cwd = process.cwd();
  const ciMode = options.ci === true;
  const reportMode = options.report === true;

  const results = [];
  let passed = 0;
  let warned = 0;
  let failed = 0;
  let skipped = 0;

  for (const item of checks) {
    const result = item.check(cwd);

    if (result.skip) {
      skipped++;
      results.push({ id: item.id, label: item.label, status: 'skip' });
      continue;
    }

    if (result.pass) {
      passed++;
      results.push({ id: item.id, label: item.label, status: 'pass', info: result.info || null });
    } else if (result.warn) {
      warned++;
      results.push({
        id: item.id,
        label: item.label,
        status: 'warn',
        info: result.info || null,
        fix: result.fix,
      });
    } else {
      failed++;
      results.push({
        id: item.id,
        label: item.label,
        status: 'fail',
        info: result.info || null,
        fix: result.fix,
      });
    }
  }

  // --report: emit JSON and exit
  if (reportMode) {
    const report = {
      timestamp: new Date().toISOString(),
      cwd,
      summary: { passed, warned, failed, skipped },
      checks: results,
    };
    process.stdout.write(JSON.stringify(report, null, 2) + '\n');
    if (failed > 0) process.exit(1);
    return;
  }

  // --ci: silent mode - no output, just exit code
  if (ciMode) {
    if (failed > 0) process.exit(1);
    return;
  }

  // interactive mode (default)
  console.log();
  console.log(chalk.bold('tierward doctor') + chalk.dim(` - ${cwd}`));
  console.log();

  for (const r of results) {
    if (r.status === 'skip') continue;
    if (r.status === 'pass') {
      const info = r.info ? chalk.dim(` (${r.info})`) : '';
      console.log(`  ${chalk.green('✓')} ${r.label}${info}`);
    } else if (r.status === 'warn') {
      console.log(`  ${chalk.yellow('⚠')} ${r.label}`);
      console.log(`    ${chalk.dim(r.fix)}`);
    } else {
      console.log(`  ${chalk.red('✗')} ${r.label}`);
      console.log(`    ${chalk.dim(r.fix)}`);
    }
  }

  console.log();
  console.log(
    chalk.bold('Results: ') +
      chalk.green(`${passed} passed`) +
      ' · ' +
      (warned > 0 ? chalk.yellow(`${warned} warnings`) : chalk.dim('0 warnings')) +
      ' · ' +
      (failed > 0 ? chalk.red(`${failed} failed`) : chalk.dim('0 failed')),
  );

  if (failed > 0) {
    console.log();
    console.log(chalk.red('Fix the failing checks before starting development.'));
    process.exit(1);
  }

  if (warned > 0) {
    console.log();
    console.log(chalk.dim('Review the warnings above - some may not apply to your setup.'));
  }

  console.log();
}
