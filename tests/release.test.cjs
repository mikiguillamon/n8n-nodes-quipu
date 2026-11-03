const { test } = require('node:test');
const assert = require('node:assert/strict');
const release = import('../scripts/prepare-release.mjs');

test('first publication uses the source version', async () => {
  const { selectRelease } = await release;
  assert.deepEqual(selectRelease('0.1.0', {}, 'abc'), { version: '0.1.0', skip: false });
});

test('each new commit increments the highest published stable version numerically', async () => {
  const { selectRelease } = await release;
  assert.deepEqual(selectRelease('0.1.0', {
    '0.1.9': {}, '0.1.10': {}, '1.0.0-beta.1': {},
  }, 'abc'), { version: '0.1.11', skip: false });
  assert.equal(selectRelease('0.1.0', { '1.2.3': {} }, 'abc').version, '1.2.4');
});

test('explicit minor and major source versions take precedence when newer', async () => {
  const { selectRelease } = await release;
  assert.equal(selectRelease('0.2.0', { '0.1.25': {} }, 'abc').version, '0.2.0');
  assert.throws(() => selectRelease('0.2.0-beta.1', {}, 'abc'), /stable/);
});

test('rerunning an already published commit does not publish another version', async () => {
  const { selectRelease } = await release;
  assert.deepEqual(selectRelease('0.1.0', { '0.1.8': { gitHead: 'abc' } }, 'abc'), {
    version: '0.1.8', skip: true,
  });
});

test('registry failures cannot be mistaken for an unpublished package', async () => {
  const { readVersions } = await release;
  assert.deepEqual(await readVersions('example', async () => new Response('', { status: 404 })), {});
  await assert.rejects(readVersions('example', async () => new Response('', { status: 503 })), /503/);
  await assert.rejects(readVersions('example', async () => Response.json({})), /versions/);
  assert.deepEqual(await readVersions('example', async () => Response.json({ versions: { '0.1.0': {} } })), { '0.1.0': {} });
});
