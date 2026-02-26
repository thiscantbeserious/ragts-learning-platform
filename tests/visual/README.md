# Visual Regression Tests

## Screenshot Generation

Screenshots are generated using Playwright with Chromium headless.

### Environment
- **Browser**: Chromium (Playwright managed)
- **Viewport**: 1280x720
- **maxDiffPixelRatio**: 0.05 (5% pixel tolerance)
- **threshold**: 0.2 (per-pixel color tolerance)

### Running Tests

```bash
# Run visual regression tests
npm run test:visual

# Update screenshots (generate new baselines)
npx playwright test --update-snapshots
```

### Platform Considerations

Screenshots may differ between macOS and Linux due to font rendering.
For CI consistency, consider running in a Docker container with
consistent fonts. The `maxDiffPixelRatio: 0.05` setting provides
flexibility for minor platform differences.

### Dynamic Content Masking

Tests mask dynamic content (timestamps, session IDs) using Playwright's
`mask` option to prevent false failures from changing data.
