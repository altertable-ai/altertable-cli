// The standalone JavaScript bundle also feeds every native release build.
// Keep compiler and app runtime dependencies in installed projects instead.
const MAX_BUNDLE_BYTES = 900 * 1024;

export async function checkBundleSize(path: string): Promise<void> {
  const file = Bun.file(path);
  if (!(await file.exists()) || file.size === 0) {
    throw new Error(`Missing or empty CLI bundle: ${path}.`);
  }
  const message = `CLI bundle: ${file.size.toLocaleString('en-US')} bytes / ${MAX_BUNDLE_BYTES.toLocaleString('en-US')} byte budget`;
  if (file.size > MAX_BUNDLE_BYTES) {
    throw new Error(
      `${message}. Inspect bundled dependencies before changing the budget in scripts/check-bundle-size.ts.`
    );
  }
  console.log(message);
}
