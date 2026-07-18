import { useState, useEffect, useRef } from 'react';
import { buscarCie10, type Cie10Resultado } from '../lib/recetas';
import { Icon } from './index';

/**
 * Buscador del catálogo CIE-10 (14,485 códigos).
 *
 * Solo busca y despliega resultados; el padre decide qué hacer con el código
 * elegido (Consulta acumula chips, Receta guarda uno solo). La búsqueda va al
 * servidor con debounce — el catálogo no cabe en memoria del cliente.
 */
export function Cie10Picker({ onSelect, excluir = [], placeholder = 'Buscar por código o descripción…', sexoPaciente, autoFocus }: {
  onSelect: (c: Cie10Resultado) => void;
  excluir?: string[];
  placeholder?: string;
  /** Sexo del paciente ('M'/'F'), para avisar si el código no le corresponde. */
  sexoPaciente?: 'M' | 'F' | null;
  autoFocus?: boolean;
}) {
  const [query, setQuery]     = useState('');
  const [results, setResults] = useState<Cie10Resultado[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState(false);
  const [abierto, setAbierto] = useState(false);
  // Descarta respuestas que lleguen fuera de orden (el usuario sigue tecleando).
  const reqId = useRef(0);
  const boxRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const q = query.trim();
    if (q.length < 2) { setResults([]); setLoading(false); setError(false); return; }
    setLoading(true);
    const id = ++reqId.current;
    const t = setTimeout(() => {
      buscarCie10(q, 20)
        .then((r) => { if (id === reqId.current) { setResults(r); setError(false); setLoading(false); } })
        .catch((e) => { console.error(e); if (id === reqId.current) { setResults([]); setError(true); setLoading(false); } });
    }, 250);
    return () => clearTimeout(t);
  }, [query]);

  // Cerrar al hacer clic fuera.
  useEffect(() => {
    if (!abierto) return;
    const h = (e: MouseEvent) => { if (!boxRef.current?.contains(e.target as Node)) setAbierto(false); };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, [abierto]);

  const visibles = results.filter((c) => !excluir.includes(c.codigo));
  const q = query.trim();

  const elegir = (c: Cie10Resultado) => { onSelect(c); setQuery(''); setResults([]); setAbierto(false); };

  return (
    <div style={{ position: 'relative' }} ref={boxRef}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, border: '1px solid var(--outline-variant)', borderRadius: 12, padding: '10px 14px', background: 'var(--surface)' }}>
        <Icon name="search" size={20} style={{ color: 'var(--on-surface-variant)' }} />
        <input
          value={query}
          autoFocus={autoFocus}
          onChange={(e) => { setQuery(e.target.value); setAbierto(true); }}
          onFocus={() => setAbierto(true)}
          placeholder={placeholder}
          style={{ flex: 1, minWidth: 0, border: 'none', outline: 'none', background: 'transparent', color: 'var(--on-surface)', fontSize: 14.5, fontFamily: 'var(--font-body)' }} />
        {loading && <Icon name="progress_activity" size={18} style={{ color: 'var(--on-surface-variant)' }} />}
        {!loading && query && (
          <button onClick={() => { setQuery(''); setResults([]); }} aria-label="Limpiar búsqueda"
            style={{ display: 'flex', border: 'none', background: 'none', padding: 0, cursor: 'pointer' }}>
            <Icon name="close" size={18} style={{ color: 'var(--on-surface-variant)' }} />
          </button>
        )}
      </div>

      {abierto && q.length >= 2 && !loading && (
        <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, marginTop: 4, background: 'var(--surface-container-high)', borderRadius: 12, boxShadow: 'var(--elev-3)', zIndex: 30, padding: 6, maxHeight: 340, overflowY: 'auto' }}>
          {error ? (
            <div style={{ padding: '10px 12px', fontSize: 12.5, color: 'var(--error)' }}>
              No se pudo buscar en el catálogo. Revisa tu conexión.
            </div>
          ) : visibles.length === 0 ? (
            <div style={{ padding: '10px 12px', fontSize: 12.5, color: 'var(--on-surface-variant)' }}>
              Sin resultados para «{q}».
            </div>
          ) : visibles.map((c) => {
            // El catálogo restringe 1,058 códigos a un solo sexo.
            const noCuadra = !!(c.sexo && sexoPaciente && c.sexo !== sexoPaciente);
            return (
              <button key={c.codigo} onClick={() => elegir(c)} className="state-layer"
                style={{ display: 'block', width: '100%', textAlign: 'left', border: 'none', cursor: 'pointer', padding: '9px 12px', borderRadius: 8, background: 'transparent', color: 'var(--on-surface)', fontFamily: 'var(--font-body)', position: 'relative' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                  <span style={{ fontWeight: 700, fontSize: 13, color: 'var(--primary)', fontVariantNumeric: 'tabular-nums' }}>{c.codigo}</span>
                  {noCuadra && (
                    <span title={`Código exclusivo de sexo ${c.sexo === 'F' ? 'femenino' : 'masculino'}`}
                      style={{ display: 'inline-flex', alignItems: 'center', gap: 3, fontSize: 10.5, fontWeight: 700, padding: '1px 7px', borderRadius: 999, background: 'var(--warning-container)', color: 'var(--on-warning-container)' }}>
                      <Icon name="warning" size={12} />{c.sexo === 'F' ? 'Solo mujer' : 'Solo hombre'}
                    </span>
                  )}
                  {c.daga && <span title="Código de etiología: no debe usarse solo" style={{ fontSize: 10.5, fontWeight: 700, padding: '1px 7px', borderRadius: 999, background: 'var(--surface-container-highest)', color: 'var(--on-surface-variant)' }}>Daga †</span>}
                  {c.asterisco && <span title="Código de manifestación: solo como código adicional" style={{ fontSize: 10.5, fontWeight: 700, padding: '1px 7px', borderRadius: 999, background: 'var(--surface-container-highest)', color: 'var(--on-surface-variant)' }}>Asterisco *</span>}
                </div>
                <div style={{ fontSize: 13.5, marginTop: 2, lineHeight: 1.35 }}>{c.descripcion}</div>
                {c.capitulo && (
                  <div style={{ fontSize: 11, color: 'var(--on-surface-variant)', marginTop: 2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{c.capitulo}</div>
                )}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
