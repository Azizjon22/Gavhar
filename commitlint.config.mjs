export default {
  extends: ['@commitlint/config-conventional'],
  rules: {
    'scope-enum': [1, 'always', ['backend', 'frontend', 'infra', 'docs', 'deps', 'release']],
  },
};
