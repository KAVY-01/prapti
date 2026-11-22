import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readMessage } from '../public/js/reader/read.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const fixtures = JSON.parse(
  readFileSync(path.join(here, 'fixtures', 'messages.json'), 'utf8'),
);

const tally = new Map();

function record(style, ok) {
  const row = tally.get(style) ?? { messages: 0, passed: 0 };
  row.messages += 1;
  if (ok) row.passed += 1;
  tally.set(style, row);
}

for (const entry of fixtures) {
  test(`${entry.id} [${entry.style}] ${entry.text}`, () => {
    const result = readMessage(entry.text);
    let ok = false;
    try {
      for (const [field, want] of Object.entries(entry.expected)) {
        if (field === 'warnings') {
          for (const code of want) {
            assert.ok(result.warnings.includes(code), `${entry.id}: missing warning ${code}`);
          }
        } else {
          assert.equal(result.profile[field], want, `${entry.id}: field ${field}`);
        }
      }
      for (const field of entry.must_not) {
        assert.equal(result.profile[field], undefined, `${entry.id}: ${field} must stay unset`);
      }
      ok = true;
    } finally {
      record(entry.style, ok);
    }
  });
}

after(() => {
  console.log('\nPer-style counts (messages / fully passing):');
  let total = 0;
  let passed = 0;
  for (const [style, row] of tally) {
    console.log(`  ${style.padEnd(10)} ${row.messages} / ${row.passed}`);
    total += row.messages;
    passed += row.passed;
  }
  console.log(`  ${'total'.padEnd(10)} ${total} / ${passed}`);
});
