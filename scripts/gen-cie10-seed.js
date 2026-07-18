/**
 * Genera los archivos sql/2026-07-18_cie10_seed_NN.sql a partir del catálogo
 * del Hospital Juárez de México (datos.gob.mx).
 *
 *   node gen-seed.js <catalogo_cie10.csv> <dir-sql>
 *
 * Reglas de mapeo CATALOG_KEY -> codigo (validadas contra la tabla en prod):
 *   ABCD (D != X)          -> "ABC.D"   ej. E119  -> E11.9
 *   ABCX (CODIGOX = SI)    -> "ABC"     ej. I10X  -> I10,  J00X -> J00
 *   ABC  (3 caracteres)    -> "ABC"     encabezado de categoría, nunca vigente
 * Cuando una clave X y su fila de 3 caracteres colisionan (12 casos), gana la
 * fila X: es la presentación codificable de la categoría.
 */
const fs = require('fs');
const path = require('path');

function parseCsv(text) {
  const rows = []; let row = [], field = '', q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) {
      if (c === '"') { if (text[i + 1] === '"') { field += '"'; i++; } else q = false; }
      else field += c;
    } else if (c === '"') q = true;
    else if (c === ',') { row.push(field); field = ''; }
    else if (c === '\r') { /* ignora */ }
    else if (c === '\n') { row.push(field); rows.push(row); row = []; field = ''; }
    else field += c;
  }
  if (field !== '' || row.length) { row.push(field); rows.push(row); }
  return rows;
}

const [, , csvPath, outDir] = process.argv;
const rows = parseCsv(fs.readFileSync(csvPath, 'utf8'));
const head = rows[0];
// El catálogo trae una fila centinela ("9999"/"9999", sin capítulo). Todo código
// CIE-10 real empieza con letra, así que ese filtro la descarta.
const data = rows.slice(1).filter((r) => r.length > 5 && /^[A-Z]/.test(r[2]));
const ix = (n) => head.indexOf(n);
const [K, N, CX, V, DS, SX, CC, CAP, AST, DAG] =
  ['CATALOG_KEY', 'NOMBRE', 'CODIGOX', 'VALID', 'DIA_SIS', 'LSEX', 'CLAVE_CAPITULO', 'CAPITULO', 'ASTERISCO', 'DAGA'].map(ix);

const si = (v) => v === 'SI';
const codigoDe = (key) => (key.length === 4 ? (key.endsWith('X') ? key.slice(0, 3) : `${key.slice(0, 3)}.${key[3]}`) : key);

// Las filas X se procesan al final para que ganen sobre el encabezado de 3 caracteres.
const orden = [...data].sort((a, b) => Number(a[K].endsWith('X')) - Number(b[K].endsWith('X')));
const porCodigo = new Map();
for (const r of orden) {
  porCodigo.set(codigoDe(r[K]), {
    codigo: codigoDe(r[K]),
    descripcion: r[N].trim(),
    capitulo_clave: r[CC] === 'NO' ? null : r[CC],
    capitulo: r[CAP] === 'NO' ? null : r[CAP].trim(),
    vigente: si(r[V]),
    consulta_externa: si(r[DS]),
    sexo: r[SX] === 'HOMBRE' ? 'M' : r[SX] === 'MUJER' ? 'F' : null,
    asterisco: si(r[AST]),
    daga: r[DAG] === '+',
  });
}

const filas = [...porCodigo.values()].sort((a, b) => a.codigo.localeCompare(b.codigo, 'en'));
const q = (v) => (v === null ? 'null' : `'${String(v).replace(/'/g, "''")}'`);
const b = (v) => (v ? 'true' : 'false');
const tupla = (f) => `(${q(f.codigo)},${q(f.descripcion)},${q(f.capitulo_clave)},${q(f.capitulo)},${b(f.vigente)},${b(f.consulta_externa)},${q(f.sexo)},${b(f.asterisco)},${b(f.daga)})`;

const COLS = '(codigo, descripcion, capitulo_clave, capitulo, vigente, consulta_externa, sexo, asterisco, daga)';
const CONFLICT = `on conflict (codigo) do update set
  descripcion      = excluded.descripcion,
  capitulo_clave   = excluded.capitulo_clave,
  capitulo         = excluded.capitulo,
  vigente          = excluded.vigente,
  consulta_externa = excluded.consulta_externa,
  sexo             = excluded.sexo,
  asterisco        = excluded.asterisco,
  daga             = excluded.daga;`;

const TAM = 2500;
const partes = Math.ceil(filas.length / TAM);
for (let p = 0; p < partes; p++) {
  const trozo = filas.slice(p * TAM, (p + 1) * TAM);
  const nn = String(p + 1).padStart(2, '0');
  const sql = `-- Catálogo CIE-10 — parte ${p + 1} de ${partes} (${trozo.length} códigos: ${trozo[0].codigo} … ${trozo[trozo.length - 1].codigo})
-- Fuente: Catálogo CIE-10, Hospital Juárez de México — datos.gob.mx/dataset/catalogo_cie_10
-- Generado el 2026-07-18. Requiere haber corrido antes 2026-07-18_cie10_catalogo.sql
-- Idempotente: se puede volver a correr sin duplicar.
insert into cie10 ${COLS} values
${trozo.map(tupla).join(',\n')}
${CONFLICT}
`;
  fs.writeFileSync(path.join(outDir, `2026-07-18_cie10_seed_${nn}.sql`), sql, 'utf8');
  console.log(`  seed_${nn}.sql  ${String(trozo.length).padStart(5)} filas  ${(Buffer.byteLength(sql) / 1024).toFixed(0).padStart(4)} KB  ${trozo[0].codigo} … ${trozo[trozo.length - 1].codigo}`);
}

console.log(`\ntotal: ${filas.length} códigos únicos (de ${data.length} filas del CSV, ${data.length - filas.length} colapsadas por la regla X)`);
console.log(`  vigentes:         ${filas.filter((f) => f.vigente).length}`);
console.log(`  consulta externa: ${filas.filter((f) => f.vigente && f.consulta_externa).length}`);
console.log(`  restringidos por sexo: ${filas.filter((f) => f.sexo).length}`);
['A09', 'I10', 'J00', 'E11.9', 'E66.9', 'F32.9', 'A33', 'U07.1'].forEach((c) => {
  const f = porCodigo.get(c);
  console.log(`  ${c.padEnd(6)} -> ${f ? `${f.vigente ? 'vigente' : 'NO vig'} | ${f.descripcion}` : '(no existe)'}`);
});
