import * as vscode from 'vscode';
import type { CdkBackend, RuleInfo, SkillInfo } from './cdkBackend';

interface GroupNode {
  kind: 'group';
  id: 'skills' | 'rules';
  label: string;
}

interface SkillNode {
  kind: 'skill';
  skill: SkillInfo;
}

interface RuleNode {
  kind: 'rule';
  rule: RuleInfo;
}

export type GovernanceNode = GroupNode | SkillNode | RuleNode;

/**
 * Renders the project's `.claude/` skill and rule registry as a tree.
 * Backend access is deferred through a factory so the view reflects the
 * current workspace folder and `cdk.cliPath` setting on every refresh.
 */
export class GovernanceTreeProvider implements vscode.TreeDataProvider<GovernanceNode> {
  private readonly onDidChangeTreeDataEmitter = new vscode.EventEmitter<void>();
  readonly onDidChangeTreeData = this.onDidChangeTreeDataEmitter.event;

  constructor(private readonly resolveBackend: () => CdkBackend | undefined) {}

  refresh(): void {
    this.onDidChangeTreeDataEmitter.fire();
  }

  dispose(): void {
    this.onDidChangeTreeDataEmitter.dispose();
  }

  getTreeItem(node: GovernanceNode): vscode.TreeItem {
    switch (node.kind) {
      case 'group': {
        const item = new vscode.TreeItem(node.label, vscode.TreeItemCollapsibleState.Expanded);
        item.contextValue = `cdk.group.${node.id}`;
        item.iconPath = new vscode.ThemeIcon(node.id === 'skills' ? 'symbol-method' : 'law');
        return item;
      }
      case 'skill': {
        const { skill } = node;
        const item = new vscode.TreeItem(skill.name, vscode.TreeItemCollapsibleState.None);
        item.description = skill.isCustom ? 'custom' : (skill.model ?? undefined);
        item.tooltip = skill.description ?? undefined;
        item.iconPath = new vscode.ThemeIcon(skill.isCustom ? 'star-full' : 'symbol-method');
        item.contextValue = 'cdk.skill';
        item.resourceUri = vscode.Uri.file(skill.path);
        item.command = openFileCommand(skill.path);
        return item;
      }
      case 'rule': {
        const { rule } = node;
        const item = new vscode.TreeItem(rule.name, vscode.TreeItemCollapsibleState.None);
        item.description = rule.title ?? undefined;
        item.iconPath = new vscode.ThemeIcon('law');
        item.contextValue = 'cdk.rule';
        item.resourceUri = vscode.Uri.file(rule.path);
        item.command = openFileCommand(rule.path);
        return item;
      }
    }
  }

  async getChildren(node?: GovernanceNode): Promise<GovernanceNode[]> {
    const backend = this.resolveBackend();
    if (!backend) {
      return [];
    }

    if (!node) {
      return [
        { kind: 'group', id: 'skills', label: 'Skills' },
        { kind: 'group', id: 'rules', label: 'Rules' },
      ];
    }

    if (node.kind === 'group' && node.id === 'skills') {
      const skills = await backend.getSkillInventory();
      return skills.map((skill) => ({ kind: 'skill', skill }));
    }

    if (node.kind === 'group' && node.id === 'rules') {
      const rules = await backend.getRules();
      return rules.map((rule) => ({ kind: 'rule', rule }));
    }

    return [];
  }
}

function openFileCommand(fsPath: string): vscode.Command {
  return {
    command: 'vscode.open',
    title: 'Open',
    arguments: [vscode.Uri.file(fsPath)],
  };
}
