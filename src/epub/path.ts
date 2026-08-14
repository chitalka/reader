export interface EpubReference {
  path: string;
  fragment: string;
}

function decodeUriPart(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

export function resolveArchivePath(basePath: string, reference: string): string | undefined {
  const rawPath = reference.split('#', 1)[0]?.split('?', 1)[0] ?? '';
  if (/^[a-z][a-z\d+.-]*:/iu.test(rawPath) || rawPath.startsWith('//')) return undefined;

  if (!rawPath) {
    const normalizedBase = basePath.replaceAll('\\', '/').replace(/^\/+|\/+$/gu, '');
    return normalizedBase || undefined;
  }

  const decodedPath = decodeUriPart(rawPath).replaceAll('\\', '/');
  const segments = decodedPath.startsWith('/')
    ? []
    : basePath.replaceAll('\\', '/').split('/').slice(0, -1).filter(Boolean);

  for (const segment of decodedPath.split('/')) {
    if (!segment || segment === '.') continue;
    if (segment === '..') {
      if (!segments.length) return undefined;
      segments.pop();
      continue;
    }
    segments.push(segment);
  }

  return segments.join('/');
}

export function resolveEpubReference(
  basePath: string,
  reference: string,
): EpubReference | undefined {
  const path = resolveArchivePath(basePath, reference);
  if (!path) return undefined;
  const hashIndex = reference.indexOf('#');
  const rawFragment = hashIndex >= 0 ? reference.slice(hashIndex + 1) : '';
  return { path, fragment: decodeUriPart(rawFragment) };
}
