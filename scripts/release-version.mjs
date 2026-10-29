const semver = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/;

export function resolveReleaseVersion({ templateVersion, refName } = {}) {
  let fromRef;
  if (refName?.startsWith('release/')) {
    const branchVersion = refName.slice('release/'.length);
    if (!branchVersion.startsWith('v')) throw new Error(`Malformed release branch: ${refName}`);
    fromRef = branchVersion.slice(1);
  } else if (refName?.startsWith('aeroframe-v')) {
    fromRef = refName.slice('aeroframe-v'.length);
  } else if (refName && refName !== 'master') {
    throw new Error(`Unsupported release ref: ${refName}`);
  }

  if (fromRef !== undefined && !semver.test(fromRef)) throw new Error(`Malformed release version: ${fromRef}`);
  if (templateVersion !== undefined && !semver.test(templateVersion)) throw new Error(`Malformed TEMPLATE_VERSION: ${templateVersion}`);
  if (templateVersion && fromRef && templateVersion !== fromRef) throw new Error('TEMPLATE_VERSION does not match release ref');
  const version = templateVersion || fromRef || '1.0.3';
  if (!semver.test(version)) throw new Error(`Malformed release version: ${version}`);
  return version;
}

export function assertManifestVersion(manifest, version, templateId = 'aeroframe') {
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(templateId) || manifest?.id !== templateId || manifest.version !== version) {
    throw new Error(`Release identity ${templateId}@${version} does not match manifest`);
  }
  return manifest;
}
