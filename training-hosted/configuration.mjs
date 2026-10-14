const projectUrl = /^https:\/\/[a-z0-9]{20}\.supabase\.co$/;

export function hostedServerConfig(read) {
  const project = read('TRAINING_EXPECTED_SUPABASE_URL');
  const ownerEmail = read('TRAINING_OWNER_EMAIL')?.trim().toLowerCase();
  if (!projectUrl.test(project || '') || project !== read('SUPABASE_URL')) {
    throw new Error('Training project configuration missing or mismatched');
  }
  if (!ownerEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(ownerEmail)) {
    throw new Error('Training owner configuration missing');
  }
  return {project, ownerEmail};
}

export function previewProxyConfig(read) {
  const branch = read('TRAINING_PREVIEW_BRANCH');
  const project = read('TRAINING_SUPABASE_URL');
  if (read('VERCEL_ENV') !== 'preview' || read('TRAINING_PREVIEW_ENABLED') !== 'true' ||
      !branch || branch === 'main' || branch !== read('VERCEL_GIT_COMMIT_REF') ||
      !projectUrl.test(project || '')) return null;
  return {backend: project + '/functions/v1/training-preview'};
}
