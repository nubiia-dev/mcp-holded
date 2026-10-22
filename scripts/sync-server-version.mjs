#!/usr/bin/env node
/**
 * Sincroniza la versión de los manifiestos que npm no toca — server.json
 * (MCP Registry) y manifest.json (extensión MCPB) — con la versión que
 * semantic-release acaba de calcular. Se ejecuta en la fase `prepare`, antes
 * de que @semantic-release/git commitee los assets.
 */
import { readFileSync, writeFileSync } from 'node:fs';

const version = process.argv[2];

if (!version) {
  console.error('Uso: node scripts/sync-server-version.mjs <version>');
  process.exit(1);
}

// server.json: la versión aparece en la raíz y en cada entrada de packages.
const server = JSON.parse(readFileSync('server.json', 'utf8'));

server.version = version;
if (Array.isArray(server.packages)) {
  for (const pkg of server.packages) {
    pkg.version = version;
  }
}

writeFileSync('server.json', `${JSON.stringify(server, null, 2)}\n`);

// manifest.json se edita como texto: reserializarlo perdería el formato
// (líneas en blanco entre bloques, arrays en una sola línea) que hace legible
// un fichero con descripciones largas.
const manifest = readFileSync('manifest.json', 'utf8');
const versionLine = /^( {2}"version": ")[^"]*(")/m;

if (!versionLine.test(manifest)) {
  console.error('No se encontró el campo "version" de nivel superior en manifest.json');
  process.exit(1);
}

writeFileSync('manifest.json', manifest.replace(versionLine, `$1${version}$2`));

console.log(`server.json y manifest.json sincronizados a la versión ${version}`);
