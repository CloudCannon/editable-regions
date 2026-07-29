# Eleventy unit test fixture

Minimal Eleventy site used by `test/unit/eleventy/*.test.ts`. Build with:

```sh
npm run test:build-eleventy-fixture
```

This installs deps and runs `eleventy`, producing `_site/register-components.js`
which the unit tests import to exercise the browser-side runtime.
