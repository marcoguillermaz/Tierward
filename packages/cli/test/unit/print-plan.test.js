import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

// printStarCta is a side-effectful console printer — we test it by capturing
// stdout rather than mocking, keeping the test honest about what users see.

let captured = '';
const origWrite = process.stdout.write.bind(process.stdout);

function captureStart() {
  captured = '';
  process.stdout.write = (chunk) => {
    captured += chunk;
    return true;
  };
}

function captureEnd() {
  process.stdout.write = origWrite;
  return captured;
}

// Lazy import so the module loads after we've verified exports exist.
const { printStarCta } = await import('../../src/utils/print-plan.js');

describe('printStarCta', () => {
  it('prints the GitHub URL', () => {
    captureStart();
    printStarCta();
    const out = captureEnd();
    assert.ok(out.includes('github.com/marcoguillermaz/Tierward'), 'GitHub URL present');
  });

  it('prints the star symbol', () => {
    captureStart();
    printStarCta();
    const out = captureEnd();
    assert.ok(out.includes('★'), 'star symbol present');
  });

  it('is suppressed when doctorPassed is explicitly false', () => {
    captureStart();
    printStarCta({ doctorPassed: false });
    const out = captureEnd();
    assert.equal(out, '', 'no output when doctor reported failures');
  });

  it('is shown when doctorPassed is true', () => {
    captureStart();
    printStarCta({ doctorPassed: true });
    const out = captureEnd();
    assert.ok(out.includes('★'), 'shown when doctor passed');
  });

  it('is shown when doctorPassed is undefined (greenfield / discovery paths)', () => {
    captureStart();
    printStarCta({ doctorPassed: undefined });
    const out = captureEnd();
    assert.ok(out.includes('★'), 'shown when no doctor context');
  });

  it('is shown with no argument (default)', () => {
    captureStart();
    printStarCta();
    const out = captureEnd();
    assert.ok(out.includes('★'), 'shown with no argument');
  });
});
