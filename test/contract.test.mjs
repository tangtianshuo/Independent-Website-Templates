import assert from 'node:assert/strict';
import test from 'node:test';
import Ajv from 'ajv';
import addFormats from 'ajv-formats';
import schema from '../contracts/schema-v1/contract-snapshot.schema.json' with { type: 'json' };
import { contractFixture } from './contract-fixture.mjs';

const ajv = new Ajv({ allErrors: true });
addFormats(ajv);
const validate = ajv.compile(schema);

test('contract snapshot v1 fixture is valid', () => {
  assert.equal(validate(contractFixture()), true, ajv.errorsText(validate.errors));
});

test('contract snapshot v1 rejects unknown root fields and malformed template identity', () => {
  assert.equal(validate({ ...contractFixture(), unknown: true }), false);
  assert.equal(validate({ ...contractFixture(), template: { id: 'bad id', version: 'latest' } }), false);
});
