export function normalizeAureaManifest(rawManifest, fallbackProject = {}) {
  const root = rawManifest && typeof rawManifest === 'object' ? rawManifest : {};
  const meta = root.AureaPlugin && typeof root.AureaPlugin === 'object' ? root.AureaPlugin : root;

  const detectedVersion = Number(
    meta.formatVersion ??
    meta.version ??
    meta.apiVersion ??
    root.formatVersion ??
    root.version ??
    1
  ) || 1;

  const name = String(
    meta.name ??
    meta.title ??
    meta.pluginName ??
    root.name ??
    fallbackProject.name ??
    ''
  ).trim();

  const author = String(
    meta.author ??
    meta.creator ??
    root.author ??
    fallbackProject.author ??
    'NikoAjj'
  ).trim();

  const id = String(
    meta.id ??
    meta.package ??
    root.id ??
    fallbackProject.id ??
    `com.${author.toLowerCase().replace(/[^a-z0-9]/g, '') || 'creator'}.${name.toLowerCase().replace(/[^a-z0-9]/g, '') || 'plugin'}`
  ).trim();

  const entry = String(
    meta.entry ??
    meta.shader ??
    meta.main ??
    root.entry ??
    'shader.frag'
  ).trim();

  const rawParams = Array.isArray(meta.params)
    ? meta.params
    : Array.isArray(meta.parameters)
      ? meta.parameters
      : Array.isArray(root.params)
        ? root.params
        : [];

  const params = rawParams.map((p, idx) => ({
    ...p,
    id: String(p.id || p.name || `param_${idx}`),
    label: String(p.label || p.title || p.name || p.id || `Param ${idx + 1}`),
    type: String(p.type || 'float').toLowerCase()
  }));

  return {
    ...meta,
    formatVersion: detectedVersion,
    id,
    name,
    author,
    entry,
    params,
    _isWrappedAureaPlugin: Boolean(root.AureaPlugin)
  };
}

export function validatePluginProject(project) {
  const errors = [];
  if (!project || !project.files) {
    return { valid: false, errors: ['Invalid project structure.'], manifest: null };
  }

  const rawJson = project.files['plugin.json'];
  if (!rawJson) {
    return { valid: false, errors: ['Missing plugin.json file.'], manifest: null };
  }

  let parsedRaw;
  try {
    parsedRaw = JSON.parse(rawJson);
  } catch (err) {
    return { valid: false, errors: [`Invalid JSON syntax in plugin.json: ${err.message}`], manifest: null };
  }

  const manifest = normalizeAureaManifest(parsedRaw, project);

  if (!manifest.name) {
    errors.push("Plugin 'name' is required in plugin.json.");
  }

  const entryFile = manifest.entry || 'shader.frag';
  if (!project.files[entryFile]) {
    errors.push(`Entry shader file '${entryFile}' not found in project.`);
  }

  manifest.params.forEach((p, i) => {
    if (!p.id) errors.push(`Parameter #${i + 1} is missing an 'id' or 'name'.`);
  });

  return {
    valid: errors.length === 0,
    errors,
    manifest
  };
}

export function exportAureaPlugin(project) {
  const check = validatePluginProject(project);
  if (!check.valid) {
    return { ok: false, errors: check.errors };
  }

  const bundle = {
    exportedBy: 'Aurea Plugin Studio',
    detectedVersion: check.manifest.formatVersion,
    manifest: JSON.parse(project.files['plugin.json']),
    files: project.files
  };

  const blob = new Blob([JSON.stringify(bundle, null, 2)], { type: 'application/json' });
  const filename = `${check.manifest.name.replace(/\s+/g, '_')}_V${check.manifest.formatVersion}.aurea.json`;
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);

  return { ok: true, filename, manifest: check.manifest };
}
