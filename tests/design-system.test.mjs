import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const projectRoot = process.cwd();

describe('LumaChat Phase 4: Lavender & White Design System Tests', () => {
  test('Design system CSS tokens are defined in globals.css', () => {
    const globalsCssPath = path.join(projectRoot, 'src', 'app', 'globals.css');
    assert.ok(fs.existsSync(globalsCssPath), 'globals.css must exist');

    const content = fs.readFileSync(globalsCssPath, 'utf-8');

    // Foundation color tokens
    assert.match(content, /--bg-main:\s*#F8F7FF/i);
    assert.match(content, /--bg-surface:\s*#FFFFFF/i);
    assert.match(content, /--bg-lavender:\s*#EDE9FE/i);
    assert.match(content, /--primary:\s*#7C5CFC/i);
    assert.match(content, /--lavender-deep:\s*#4C3A8C/i);

    // Semantic text & border tokens
    assert.match(content, /--text-primary:\s*#1E1B2E/i);
    assert.match(content, /--border-subtle:\s*#E8E3FA/i);

    // Accessible reduced motion
    assert.match(content, /prefers-reduced-motion:\s*reduce/i);
  });

  test('Reusable UI primitives exist and export valid React components', () => {
    const uiPrimitives = [
      'Button.tsx',
      'Input.tsx',
      'Card.tsx',
      'Badge.tsx',
      'Avatar.tsx',
      'Spinner.tsx',
      'index.ts',
    ];

    for (const file of uiPrimitives) {
      const filePath = path.join(projectRoot, 'src', 'components', 'ui', file);
      assert.ok(fs.existsSync(filePath), `UI primitive missing: ${file}`);
      const content = fs.readFileSync(filePath, 'utf-8');
      assert.ok(content.length > 50, `${file} must not be empty`);
    }
  });

  test('PasscodeModal uses design system tokens and accessible controls', () => {
    const passcodeModalPath = path.join(projectRoot, 'src', 'components', 'PasscodeModal.tsx');
    assert.ok(fs.existsSync(passcodeModalPath), 'PasscodeModal.tsx must exist');

    const content = fs.readFileSync(passcodeModalPath, 'utf-8');

    // UI primitives integrated
    assert.match(content, /Button/);
    assert.match(content, /Input/);
    assert.match(content, /Card/);
    assert.match(content, /Badge/);
    assert.match(content, /Avatar/);

    // Show/hide passcode control
    assert.match(content, /showCode/);
    assert.match(content, /EyeOff/);
    assert.match(content, /Eye/);

    // Accessible aria labels
    assert.match(content, /role="alert"/);
    assert.match(content, /aria-label=/);
  });

  test('Disguise mode preserves discreet lock button and isolation', () => {
    const beautyPath = path.join(projectRoot, 'src', 'components', 'BeautyWebsite.tsx');
    assert.ok(fs.existsSync(beautyPath), 'BeautyWebsite.tsx must exist');

    const content = fs.readFileSync(beautyPath, 'utf-8');

    // Iframe isolation intact
    assert.match(content, /<iframe/);
    assert.match(content, /allow=/);

    // Discreet lock overlay present
    assert.match(content, /onReset/);
    assert.match(content, /title="Return to Access Gate"/);
  });

  test('Application shell header and background reflect Lavender & White theme', () => {
    const pagePath = path.join(projectRoot, 'src', 'app', 'page.tsx');
    const layoutPath = path.join(projectRoot, 'src', 'app', 'layout.tsx');

    const pageContent = fs.readFileSync(pagePath, 'utf-8');
    const layoutContent = fs.readFileSync(layoutPath, 'utf-8');

    assert.match(pageContent, /bg-\[#F8F7FF\]/);
    assert.match(layoutContent, /themeColor:\s*["']#F8F7FF["']/);
  });
});
