import esbuild from 'esbuild';

export async function resolve(specifier, context, nextResolve) {
  const result = await nextResolve(specifier, context);
  if (result.url.includes('/src/') && (result.url.endsWith('.js') || result.url.endsWith('.jsx') || result.url.endsWith('.tsx'))) {
    return { ...result, format: 'module' };
  }
  return result;
}

export async function load(url, context, nextLoad) {
  if (url.endsWith('.jsx') || url.endsWith('.tsx') || (url.includes('/src/') && url.endsWith('.js'))) {
    const result = await nextLoad(url, { ...context, format: 'module' });
    const code = typeof result.source === 'string' ? result.source : new TextDecoder().decode(result.source);
    const transformed = await esbuild.transform(code, {
      loader: url.endsWith('.tsx') ? 'tsx' : url.endsWith('.jsx') ? 'jsx' : 'js',
      format: 'esm',
    });
    return {
      format: 'module',
      shortCircuit: true,
      source: transformed.code,
    };
  }
  return nextLoad(url, context);
}
