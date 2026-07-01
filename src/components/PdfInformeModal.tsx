import { useEffect, useRef, useState } from 'react';
import { Dialog, Button, Icon, IconButton } from './index';
import { generarInformePdf, PLANTILLAS, type InformePdfData } from '../lib/pdf';

/**
 * Modal de informe: previsualiza el PDF (con la plantilla guardada de la clínica,
 * la misma que usa la receta) y permite descargar o imprimir.
 */
export function PdfInformeModal({ open, data, onClose, toast }: {
  open: boolean;
  data: InformePdfData | null;
  onClose: () => void;
  toast?: (m: string) => void;
}) {
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const blobRef = useRef<Blob | null>(null);

  const plantillaInfo = PLANTILLAS.find((p) => p.id === data?.plantilla) ?? PLANTILLAS[0];

  useEffect(() => () => { if (previewUrl) URL.revokeObjectURL(previewUrl); }, [previewUrl]);

  // Genera el PDF al abrir / cambiar de informe.
  useEffect(() => {
    if (!open || !data) return;
    let cancelado = false;
    setError(null);
    setLoading(true);
    blobRef.current = null;

    generarInformePdf(data)
      .then((blob) => {
        if (cancelado) return;
        blobRef.current = blob;
        setPreviewUrl(URL.createObjectURL(blob));
      })
      .catch((e) => { if (!cancelado) setError(e?.message ?? 'No se pudo generar el PDF'); })
      .finally(() => { if (!cancelado) setLoading(false); });

    return () => { cancelado = true; };
  }, [open, data]);

  const nombreArchivo = `Informe${data?.folio ? ' ' + data.folio.replace(/\s+/g, '') : ''}.pdf`;

  const obtenerBlob = async (): Promise<Blob> => {
    if (blobRef.current) return blobRef.current;
    const blob = await generarInformePdf(data!);
    blobRef.current = blob;
    return blob;
  };

  const descargar = async () => {
    try {
      const blob = await obtenerBlob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = nombreArchivo;
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 4000);
    } catch (e: any) { toast?.('No se pudo descargar: ' + (e?.message ?? e)); }
  };

  const imprimir = async () => {
    try {
      const blob = await obtenerBlob();
      const url = URL.createObjectURL(blob);
      const iframe = document.createElement('iframe');
      iframe.style.position = 'fixed'; iframe.style.right = '0'; iframe.style.bottom = '0';
      iframe.style.width = '0'; iframe.style.height = '0'; iframe.style.border = '0';
      iframe.src = url;
      iframe.onload = () => {
        try { iframe.contentWindow?.focus(); iframe.contentWindow?.print(); }
        catch { window.open(url, '_blank'); }
        setTimeout(() => { iframe.remove(); URL.revokeObjectURL(url); }, 60000);
      };
      document.body.appendChild(iframe);
    } catch (e: any) { toast?.('No se pudo imprimir: ' + (e?.message ?? e)); }
  };

  return (
    <Dialog open={open} onClose={onClose} width={920} style={{ height: '95vh', maxHeight: '95vh' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '16px 20px', borderBottom: '1px solid var(--outline-variant)' }}>
        <div style={{ width: 40, height: 40, borderRadius: 12, background: 'var(--primary-container)', color: 'var(--on-primary-container)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <Icon name="description" size={22} fill />
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div className="title-l" style={{ fontWeight: 700, fontSize: 17 }}>Informe médico</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12.5, color: 'var(--on-surface-variant)' }}>
            {data?.folio ? <span>Folio {data.folio}</span> : <span>Vista previa</span>}
            <span>·</span>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
              <span style={{ width: 10, height: 10, borderRadius: 3, background: plantillaInfo.color }} />
              Plantilla {plantillaInfo.nombre}
            </span>
          </div>
        </div>
        <IconButton name="close" onClick={onClose} />
      </div>

      {/* Vista previa */}
      <div style={{ flex: 1, minWidth: 0, background: 'var(--surface-container-lowest)', display: 'flex', alignItems: 'center', justifyContent: 'center', position: 'relative' }}>
        {error ? (
          <div style={{ textAlign: 'center', padding: 32, maxWidth: 440 }}>
            <Icon name="error" size={40} style={{ color: 'var(--error)' }} />
            <div style={{ marginTop: 10, fontSize: 14, color: 'var(--on-surface)' }}>No se pudo generar la vista previa</div>
            <div style={{ marginTop: 6, fontSize: 12.5, color: 'var(--on-surface-variant)' }}>{error}</div>
            <div style={{ marginTop: 8, fontSize: 12, color: 'var(--on-surface-variant)' }}>¿El servicio de PDF está corriendo?</div>
          </div>
        ) : (
          <>
            {previewUrl && (
              <iframe title="Vista previa del informe" src={previewUrl}
                style={{ width: '100%', height: '100%', border: 'none', opacity: loading ? 0.4 : 1, transition: 'opacity .2s' }} />
            )}
            {loading && (
              <div style={{ position: 'absolute', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10, color: 'var(--on-surface-variant)' }}>
                <Icon name="progress_activity" size={32} style={{ animation: 'spin 1s linear infinite' }} />
                <span style={{ fontSize: 13 }}>Generando vista previa…</span>
              </div>
            )}
          </>
        )}
      </div>

      {/* Footer */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 10, padding: '14px 20px', borderTop: '1px solid var(--outline-variant)' }}>
        <Button variant="text" onClick={onClose}>Cerrar</Button>
        <Button variant="outlined" icon="print" onClick={imprimir} disabled={loading || !!error}>Imprimir</Button>
        <Button variant="filled" icon="download" onClick={descargar} disabled={loading || !!error}>Descargar PDF</Button>
      </div>
    </Dialog>
  );
}
