import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const projectRoot = process.cwd();

describe('LumaChat Phase 1: Foundation Tests', () => {
  test('Directory structure contains required layers', () => {
    const requiredDirs = [
      path.join(projectRoot, 'src', 'app'),
      path.join(projectRoot, 'src', 'components'),
      path.join(projectRoot, 'src', 'lib'),
      path.join(projectRoot, 'src', 'types'),
      path.join(projectRoot, 'tests'),
    ];

    for (const dir of requiredDirs) {
      assert.ok(
        fs.existsSync(dir),
        `Required layer directory missing: ${path.relative(projectRoot, dir)}`
      );
    }
  });

  test('Safe .env.example exists and contains no leaked secrets', () => {
    const envExamplePath = path.join(projectRoot, '.env.example');
    assert.ok(fs.existsSync(envExamplePath), '.env.example must exist');

    const content = fs.readFileSync(envExamplePath, 'utf-8');
    assert.match(content, /ADMIN_CODE=/);
    assert.match(content, /KV_REST_API_URL=/);
    assert.match(content, /KV_REST_API_TOKEN=/);

    // Verify it contains only placeholder values
    assert.ok(
      content.includes('your_secure_admin_passcode_here') || content.includes('placeholder') || content.includes('your-upstash'),
      '.env.example should contain explicit placeholder text'
    );
    assert.ok(!content.includes('eyJh'), '.env.example must not contain real JWT or base64 secrets');
  });

  test('Centralized configuration exports LumaChat name and metadata', () => {
    const configPath = path.join(projectRoot, 'src', 'lib', 'config.ts');
    assert.ok(fs.existsSync(configPath), 'src/lib/config.ts must exist');

    const content = fs.readFileSync(configPath, 'utf-8');
    assert.match(content, /name:\s*['"]LumaChat['"]/);
    assert.match(content, /disguiseCode:\s*['"]@1234['"]/);
    assert.match(content, /messageIntervalMs:\s*1000/);
    assert.match(content, /userPresenceIntervalMs:\s*2000/);
    assert.match(content, /onlineThresholdMs:\s*6000/);
  });

  test('Type definition file defines User, Message, and DatabaseSchema', () => {
    const typesPath = path.join(projectRoot, 'src', 'types', 'index.ts');
    assert.ok(fs.existsSync(typesPath), 'src/types/index.ts must exist');

    const content = fs.readFileSync(typesPath, 'utf-8');
    assert.match(content, /interface User/);
    assert.match(content, /interface Message/);
    assert.match(content, /interface DatabaseSchema/);
    assert.match(content, /interface Reaction/);
  });

  test('Modular UI components exist and export valid React components', () => {
    const componentFiles = [
      'PasscodeModal.tsx',
      'ContactsSidebar.tsx',
      'ChatWindow.tsx',
      'AdminDashboard.tsx',
      'BeautyWebsite.tsx',
    ];

    for (const file of componentFiles) {
      const compPath = path.join(projectRoot, 'src', 'components', file);
      assert.ok(fs.existsSync(compPath), `Component file missing: ${file}`);
      const content = fs.readFileSync(compPath, 'utf-8');
      assert.match(content, /export default function/, `${file} must have a default export`);
    }
  });

  test('Tailwind CSS v4 and PostCSS configuration are present', () => {
    const postcssPath = path.join(projectRoot, 'postcss.config.mjs');
    const globalsCssPath = path.join(projectRoot, 'src', 'app', 'globals.css');

    assert.ok(fs.existsSync(postcssPath), 'postcss.config.mjs must exist');
    assert.ok(fs.existsSync(globalsCssPath), 'globals.css must exist');

    const postcssContent = fs.readFileSync(postcssPath, 'utf-8');
    assert.match(postcssContent, /@tailwindcss\/postcss/);

    const cssContent = fs.readFileSync(globalsCssPath, 'utf-8');
    assert.match(cssContent, /@import\s+["']tailwindcss["']/);
  });
});
