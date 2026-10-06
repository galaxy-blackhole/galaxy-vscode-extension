const CANDIDATES = [".ts", ".tsx", "/index.ts", "/index.tsx"];

/** Append a TypeScript extension when a relative import has none and the bare path is missing. */
export async function resolve(specifier, context, nextResolve) {
  try {
    return await nextResolve(specifier, context);
  } catch (error) {
    if (!specifier.startsWith(".") || /.[cm]?[jt]sx?$/.test(specifier)) throw error;
    for (const candidate of CANDIDATES) {
      try {
        return await nextResolve(specifier + candidate, context);
      } catch { /* keep looking */ }
    }
    throw error;
  }
}
