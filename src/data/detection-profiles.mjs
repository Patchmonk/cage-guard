/**
 * Detection profiles: default patterns to find during onboarding.
 * This is DATA, not logic. Adding a profile means adding a key here.
 * No other code changes are needed when profiles change.
 */

export const DETECTION_PROFILES = {
  'node-core': [
    'package.json', 'package-lock.json', 'npm-shrinkwrap.json',
    '.npmrc', '.nvmrc', '.node-version',
  ],
  'typescript': [
    'tsconfig*.json',
  ],
  'linters-formatters': [
    'eslint.config.*', '.eslintrc*', '.prettierrc*', 'prettier.config.*',
    '.editorconfig', '.ls-lint.yml', 'biome.json', 'biome.jsonc',
    '.stylelintrc*', 'stylelint.config.*',
  ],
  'bundlers-build': [
    'vite.config.*', 'webpack.config.*', 'rollup.config.*',
    'esbuild.config.*', 'parcel.config.*', 'wxt.config.*',
    'postcss.config.*', 'tailwind.config.*', 'babel.config.*', '.babelrc*',
  ],
  'testing': [
    'vitest.config.*', 'jest.config.*', '.mocharc*',
    'karma.conf.*', 'playwright.config.*', 'cypress.config.*',
  ],
  'ci-cd': [
    '.github/workflows/**', '.gitlab-ci.yml', 'Jenkinsfile',
    '.circleci/config.yml', '.travis.yml',
  ],
  'build-scripts': [
    'scripts/**',
  ],
  'governance-docs': [
    'governance.config.*', 'ARCHITECTURE.md',
  ],
  'python': [
    'pyproject.toml', 'setup.py', 'setup.cfg', 'requirements*.txt',
    'Pipfile', 'poetry.lock', '.flake8', '.pylintrc',
    'mypy.ini', 'ruff.toml', 'tox.ini', 'pytest.ini',
  ],
  'rust': [
    'Cargo.toml', 'Cargo.lock', 'rustfmt.toml', 'clippy.toml',
  ],
  'go': [
    'go.mod', 'go.sum', '.golangci.yml',
  ],
  'docker': [
    'Dockerfile*', 'docker-compose*.yml', 'docker-compose*.yaml', '.dockerignore',
  ],
  'version-control': [
    '.gitignore', '.gitattributes',
  ],
};

export const SKIP_DIRECTORIES = [
  'node_modules', '.git', 'dist', 'build', '.output', '.cache',
  'coverage', '__pycache__', '.venv', 'vendor', 'target', '.next', '.nuxt',
];
