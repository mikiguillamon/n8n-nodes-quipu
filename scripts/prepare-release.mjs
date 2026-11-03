import { readFileSync, appendFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';

const stable = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/;
const compare = (a, b) => {
  const left = a.split('.').map(Number);
  const right = b.split('.').map(Number);
  return left[0] - right[0] || left[1] - right[1] || left[2] - right[2];
};

export function selectRelease(sourceVersion, versions, sha) {
  if (!stable.test(sourceVersion)) throw new Error('Automatic publishing requires a stable source version');
  const published = Object.keys(versions).filter((version) => stable.test(version)).sort(compare);
  const existing = published.find((version) => sha && versions[version].gitHead === sha);
  if (existing) return { version: existing, skip: true };
  const highest = published.at(-1);
  if (!highest || compare(sourceVersion, highest) > 0) return { version: sourceVersion, skip: false };
  const parts = highest.split('.').map(Number);
  parts[2] += 1;
  return { version: parts.join('.'), skip: false };
}

export async function readVersions(name, request = fetch) {
  const response = await request(`https://registry.npmjs.org/${encodeURIComponent(name)}`, {
    signal: AbortSignal.timeout(30_000),
    headers: { Accept: 'application/json' },
  });
  if (response.status === 404) return {};
  if (!response.ok) throw new Error(`npm registry returned HTTP ${response.status}; refusing to choose a version`);
  const data = await response.json();
  if (!data.versions || typeof data.versions !== 'object' || Array.isArray(data.versions)) {
    throw new Error('npm registry response has no valid versions object');
  }
  return data.versions;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  if (process.env.GITHUB_ACTIONS !== 'true' || !process.env.GITHUB_OUTPUT || !process.env.GITHUB_SHA) {
    throw new Error('Run this release preparation step only inside GitHub Actions');
  }
  const pkg = JSON.parse(readFileSync('package.json', 'utf8'));
  const result = selectRelease(pkg.version, await readVersions(pkg.name), process.env.GITHUB_SHA);
  if (!result.skip && result.version !== pkg.version) {
    execFileSync('npm', ['version', result.version, '--no-git-tag-version', '--ignore-scripts'], { stdio: 'inherit' });
  }
  appendFileSync(process.env.GITHUB_OUTPUT, `version=${result.version}\nskip=${result.skip}\n`);
  console.log(`${result.skip ? 'Already published' : 'Publishing'} ${pkg.name}@${result.version}`);
}
