import * as vscode from 'vscode';
import { parseSkillHeader } from './ccBridge';

/**
 * Adds a "Run in Claude Code" codelens at the top of a user-invocable
 * `SKILL.md`. The lens triggers `tierward.runSkillByName`, which bridges to Claude
 * Code. Skills without `user-invocable: true` get no lens.
 */
export class SkillCodeLensProvider implements vscode.CodeLensProvider {
  provideCodeLenses(document: vscode.TextDocument): vscode.CodeLens[] {
    const header = parseSkillHeader(document.getText());
    if (!header.name || !header.userInvocable) {
      return [];
    }
    return [
      new vscode.CodeLens(new vscode.Range(0, 0, 0, 0), {
        title: `$(play) Run /${header.name} in Claude Code`,
        command: 'tierward.runSkillByName',
        arguments: [header.name],
      }),
    ];
  }
}
