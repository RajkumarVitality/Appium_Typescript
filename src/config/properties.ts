import { readFileSync } from 'node:fs';

const base64PropertyKeys = new Set(['LT_USERNAME', 'LT_ACCESS_KEY', 'UserName', 'AccessKey', 'APP_PASSWORD']);

export function loadProperties(propertyFiles: string[]): Map<string, string> {
  const properties = new Map<string, string>();
  for (const filePath of propertyFiles) {
    try {
      const fileContents = readFileSync(filePath, 'utf8');
      for (const line of fileContents.split(/\r?\n/)) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith('#') || trimmed.startsWith('!')) {
          continue;
        }
        const separatorIndex = trimmed.search(/[=:]/);
        if (separatorIndex < 0) {
          properties.set(trimmed, '');
          continue;
        }
        properties.set(trimmed.slice(0, separatorIndex).trim(), trimmed.slice(separatorIndex + 1).trim());
      }
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
        throw new Error(`Unable to read settings file ${filePath}`, { cause: error });
      }
    }
  }
  return properties;
}

export function decodeBase64Property(key: string, value: string): string {
  const prefix = 'base64:';
  if (!base64PropertyKeys.has(key) || !value.startsWith(prefix)) {
    return value;
  }

  const encoded = value.slice(prefix.length);
  const decoded = Buffer.from(encoded, 'base64');
  if (
    encoded.length === 0
    || !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(encoded)
    || decoded.toString('base64') !== encoded
    || !Buffer.from(decoded.toString('utf8'), 'utf8').equals(decoded)
  ) {
    throw new Error(`Invalid Base64 value for ${key} in lambdatest.properties.`);
  }

  return decoded.toString('utf8');
}
