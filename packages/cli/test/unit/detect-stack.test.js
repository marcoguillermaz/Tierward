import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs-extra';
import path from 'path';
import os from 'os';
import { detectStack } from '../../src/utils/detect-stack.js';

describe('detectStack — tech stack identification', () => {
  let tmpDir;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'tierward-detect-stack-'));
  });

  afterEach(async () => {
    await fs.remove(tmpDir);
  });

  it('empty directory returns default "other" stack', async () => {
    const result = await detectStack(tmpDir);
    assert.equal(result.techStack, 'other');
    assert.deepEqual(result.detectedFiles, []);
  });

  it('package.json + tsconfig.json → node-ts', async () => {
    await fs.writeJson(path.join(tmpDir, 'package.json'), { name: 't', version: '0.0.1' });
    await fs.writeJson(path.join(tmpDir, 'tsconfig.json'), { compilerOptions: {} });
    const result = await detectStack(tmpDir);
    assert.equal(result.techStack, 'node-ts');
    assert.equal(result.typeCheckCommand, 'npx tsc --noEmit');
    assert.ok(result.detectedFiles.includes('package.json'));
  });

  it('package.json without tsconfig → node-js', async () => {
    await fs.writeJson(path.join(tmpDir, 'package.json'), { name: 't', version: '0.0.1' });
    const result = await detectStack(tmpDir);
    assert.equal(result.techStack, 'node-js');
  });

  it('package.json + typescript in devDependencies → node-ts', async () => {
    await fs.writeJson(path.join(tmpDir, 'package.json'), {
      name: 't',
      devDependencies: { typescript: '^5.0.0' },
    });
    const result = await detectStack(tmpDir);
    assert.equal(result.techStack, 'node-ts');
  });

  it('pyproject.toml → python', async () => {
    await fs.writeFile(path.join(tmpDir, 'pyproject.toml'), '[project]\nname="t"\n');
    const result = await detectStack(tmpDir);
    assert.equal(result.techStack, 'python');
    assert.equal(result.installCommand, 'pip install -r requirements.txt');
    assert.equal(result.testCommand, 'pytest');
  });

  it('go.mod → go', async () => {
    await fs.writeFile(path.join(tmpDir, 'go.mod'), 'module example\ngo 1.21\n');
    const result = await detectStack(tmpDir);
    assert.equal(result.techStack, 'go');
    assert.equal(result.testCommand, 'go test ./...');
  });

  it('Gemfile → ruby', async () => {
    await fs.writeFile(path.join(tmpDir, 'Gemfile'), "source 'https://rubygems.org'\n");
    const result = await detectStack(tmpDir);
    assert.equal(result.techStack, 'ruby');
    assert.equal(result.installCommand, 'bundle install');
  });

  it('pom.xml → java', async () => {
    await fs.writeFile(path.join(tmpDir, 'pom.xml'), '<project></project>');
    const result = await detectStack(tmpDir);
    assert.equal(result.techStack, 'java');
    assert.equal(result.installCommand, 'mvn install');
  });

  it('build.gradle.kts → kotlin', async () => {
    await fs.writeFile(path.join(tmpDir, 'build.gradle.kts'), 'plugins { kotlin("jvm") }');
    const result = await detectStack(tmpDir);
    assert.equal(result.techStack, 'kotlin');
  });

  it('build.gradle (non-kts) → java via gradle', async () => {
    await fs.writeFile(path.join(tmpDir, 'build.gradle'), "apply plugin: 'java'");
    const result = await detectStack(tmpDir);
    assert.equal(result.techStack, 'java');
  });

  it('Package.swift → swift', async () => {
    await fs.writeFile(path.join(tmpDir, 'Package.swift'), '// swift-tools-version:5.5\n');
    const result = await detectStack(tmpDir);
    assert.equal(result.techStack, 'swift');
    assert.equal(result.testCommand, 'swift test');
  });

  it('*.csproj → dotnet', async () => {
    await fs.writeFile(path.join(tmpDir, 'app.csproj'), '<Project></Project>');
    const result = await detectStack(tmpDir);
    assert.equal(result.techStack, 'dotnet');
    assert.equal(result.installCommand, 'dotnet restore');
  });

  it('Cargo.toml → rust', async () => {
    await fs.writeFile(path.join(tmpDir, 'Cargo.toml'), '[package]\nname = "t"\n');
    const result = await detectStack(tmpDir);
    assert.equal(result.techStack, 'rust');
    assert.equal(result.testCommand, 'cargo test');
  });
});

describe('detectStack — suggestedTier thresholds', () => {
  let tmpDir;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'tierward-detect-tier-'));
  });

  afterEach(async () => {
    await fs.remove(tmpDir);
  });

  async function writeNFiles(dir, n, ext = 'js') {
    await Promise.all(
      Array.from({ length: n }, (_, i) =>
        fs.writeFile(path.join(dir, `file${i}.${ext}`), '// placeholder'),
      ),
    );
  }

  // Node-web thresholds: > 100 → 'l', > 30 → 'm', else 's'
  it('node-ts with 10 files → suggestedTier "s"', async () => {
    await fs.writeJson(path.join(tmpDir, 'package.json'), { name: 't' });
    await fs.writeJson(path.join(tmpDir, 'tsconfig.json'), {});
    await writeNFiles(tmpDir, 10, 'ts');
    const result = await detectStack(tmpDir);
    assert.equal(result.suggestedTier, 's');
  });

  it('node-ts with 50 files → suggestedTier "m"', async () => {
    await fs.writeJson(path.join(tmpDir, 'package.json'), { name: 't' });
    await fs.writeJson(path.join(tmpDir, 'tsconfig.json'), {});
    await writeNFiles(tmpDir, 50, 'ts');
    const result = await detectStack(tmpDir);
    assert.equal(result.suggestedTier, 'm');
  });

  // Medium thresholds (python): > 80 → 'l', > 20 → 'm', else 's'
  it('python with 10 files → suggestedTier "s"', async () => {
    await fs.writeFile(path.join(tmpDir, 'pyproject.toml'), '[project]\nname="t"\n');
    await writeNFiles(tmpDir, 10, 'py');
    const result = await detectStack(tmpDir);
    assert.equal(result.suggestedTier, 's');
  });

  it('python with 30 files → suggestedTier "m"', async () => {
    await fs.writeFile(path.join(tmpDir, 'pyproject.toml'), '[project]\nname="t"\n');
    await writeNFiles(tmpDir, 30, 'py');
    const result = await detectStack(tmpDir);
    assert.equal(result.suggestedTier, 'm');
  });

  // Compact thresholds (rust): > 60 → 'l', > 15 → 'm', else 's'
  it('rust with 5 files → suggestedTier "s"', async () => {
    await fs.writeFile(path.join(tmpDir, 'Cargo.toml'), '[package]\nname = "t"\n');
    await writeNFiles(tmpDir, 5, 'rs');
    const result = await detectStack(tmpDir);
    assert.equal(result.suggestedTier, 's');
  });

  it('rust with 25 files → suggestedTier "m"', async () => {
    await fs.writeFile(path.join(tmpDir, 'Cargo.toml'), '[package]\nname = "t"\n');
    await writeNFiles(tmpDir, 25, 'rs');
    const result = await detectStack(tmpDir);
    assert.equal(result.suggestedTier, 'm');
  });

  // Go uses compact thresholds (same as rust)
  it('go with 20 files → suggestedTier "m"', async () => {
    await fs.writeFile(path.join(tmpDir, 'go.mod'), 'module example\n');
    await writeNFiles(tmpDir, 20, 'go');
    const result = await detectStack(tmpDir);
    assert.equal(result.suggestedTier, 'm');
  });
});
