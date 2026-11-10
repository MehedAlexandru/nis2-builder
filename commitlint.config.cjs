/** @type {import('@commitlint/types').UserConfig} */
module.exports = {
  extends: ['@commitlint/config-conventional'],
  rules: {
    'header-max-length': [2, 'always', 100],
    'body-max-line-length': [2, 'always', 200],
    'scope-enum': [
      2,
      'always',
      [
        'repo',
        'web',
        'api',
        'shared',
        'agent',
        'deploy',
        'ci',
        'docs',
        'security',
        'auth',
        'classification',
        'documents',
        'exports',
        'audit',
        'findings',
        'admin',
        'design',
        'i18n',
        'phase0',
      ],
    ],
  },
};
