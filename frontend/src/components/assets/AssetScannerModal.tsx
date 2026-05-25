import React, { useEffect, useRef, useState } from 'react';
import { Html5Qrcode, Html5QrcodeSupportedFormats } from 'html5-qrcode';
import { Upload, X, AlertTriangle } from 'lucide-react';
import Modal from '../ui/Modal';
import Button from '../ui/Button';
import { assetsApi } from '../../lib/api';
import AssetScanResultModal, { ScanPayload } from './AssetScanResultModal';

const SCANNER_REGION_ID = 'asset-qr-scanner-region';
const URI_PREFIX = 'dsync://asset-scan/';
const TOKEN_RE = /^[A-Za-z0-9_-]{20,64}$/;

function extractToken(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const trimmed = raw.trim();
  const candidate = trimmed.startsWith(URI_PREFIX)
    ? trimmed.slice(URI_PREFIX.length)
    : trimmed;
  return TOKEN_RE.test(candidate) ? candidate : null;
}

interface Props {
  open: boolean;
  onClose: () => void;
}

/**
 * Camera-based asset QR scanner with a Zia upload fallback.
 *
 * - The camera continuously scans for QR codes via html5-qrcode (uses
 *   BarcodeDetector when available, falls back to a wasm decoder).
 * - On detection, we extract the dsync:// token and hit `/scan/:token`.
 * - "Upload photo instead" lets the user pick a file from disk; the server
 *   decodes it via Zia Barcode Scanner and resolves to the same payload.
 */
const AssetScannerModal: React.FC<Props> = ({ open, onClose }) => {
  const scannerRef = useRef<Html5Qrcode | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<ScanPayload | null>(null);

  // Lifecycle — start the camera when the modal opens, stop when it closes.
  useEffect(() => {
    if (!open) return;
    let cancelled = false;

    const start = async () => {
      try {
        const instance = new Html5Qrcode(SCANNER_REGION_ID, {
          formatsToSupport: [Html5QrcodeSupportedFormats.QR_CODE],
          verbose: false,
        });
        scannerRef.current = instance;

        await instance.start(
          { facingMode: 'environment' },
          {
            fps: 10,
            qrbox: { width: 240, height: 240 },
            aspectRatio: 1,
          },
          (decoded) => {
            // Defensive: html5-qrcode can fire repeatedly for the same code.
            if (cancelled) return;
            void handleDecoded(decoded);
          },
          () => { /* per-frame "no code yet" — ignore */ },
        );
      } catch (err) {
        if (!cancelled) {
          setError(
            err instanceof Error && err.message.includes('NotAllowed')
              ? 'Camera access was denied. Use "Upload photo instead" below.'
              : 'Could not open the camera. Use "Upload photo instead" below.',
          );
        }
      }
    };

    void start();
    return () => {
      cancelled = true;
      const inst = scannerRef.current;
      if (inst) {
        inst.stop().catch(() => { /* ignore — modal closing */ })
          .finally(() => { inst.clear(); });
        scannerRef.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const handleDecoded = async (raw: string) => {
    const token = extractToken(raw);
    if (!token) {
      setError('Not a recognised asset QR code.');
      return;
    }
    if (busy) return;
    setError(null);
    setBusy(true);
    // Pause the camera while we resolve — keeps us from re-firing on the same code.
    try { await scannerRef.current?.pause(true); } catch { /* not running */ }
    try {
      const payload = await assetsApi.scan.byToken(token);
      setResult(payload as ScanPayload);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not resolve QR code');
      try { scannerRef.current?.resume(); } catch { /* not paused */ }
    } finally {
      setBusy(false);
    }
  };

  const handleUpload = async (file: File) => {
    if (busy) return;
    setError(null);
    setBusy(true);
    try { await scannerRef.current?.pause(true); } catch { /* not running */ }
    try {
      const payload = await assetsApi.scan.decodeImage(file);
      setResult(payload as ScanPayload);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not decode image');
      try { scannerRef.current?.resume(); } catch { /* not paused */ }
    } finally {
      setBusy(false);
    }
  };

  const dismissResult = () => {
    setResult(null);
    // Resume scanning for the next code so the user can keep going.
    try { scannerRef.current?.resume(); } catch { /* not paused */ }
  };

  return (
    <>
      <Modal open={open && !result} onClose={onClose} title="Scan Asset QR" size="md">
        <div className="space-y-4">
          <div
            id={SCANNER_REGION_ID}
            className="w-full aspect-square bg-gray-900 rounded-xl overflow-hidden relative"
          >
            {busy && (
              <div className="absolute inset-0 flex items-center justify-center bg-black/40 text-white text-sm">
                Resolving…
              </div>
            )}
          </div>

          {error && (
            <div className="flex items-start gap-2 bg-red-50 border border-red-100 rounded-lg px-3 py-2">
              <AlertTriangle size={14} className="text-red-500 shrink-0 mt-0.5" />
              <p className="text-xs text-red-700 leading-snug">{error}</p>
            </div>
          )}

          <p className="text-xs text-gray-500 text-center">
            Point your camera at the asset sticker. Token rotates automatically when the asset is returned.
          </p>

          <input
            ref={fileInputRef}
            type="file"
            accept="image/png,image/jpeg"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) void handleUpload(file);
              if (fileInputRef.current) fileInputRef.current.value = '';
            }}
          />

          <div className="flex items-center gap-2">
            <Button
              variant="secondary"
              icon={<Upload size={14} />}
              onClick={() => fileInputRef.current?.click()}
              disabled={busy}
              className="flex-1"
            >
              Upload photo instead
            </Button>
            <Button variant="ghost" icon={<X size={14} />} onClick={onClose}>
              Close
            </Button>
          </div>
        </div>
      </Modal>

      <AssetScanResultModal
        open={!!result}
        payload={result}
        onClose={() => {
          dismissResult();
          onClose();
        }}
        onScanAnother={dismissResult}
      />
    </>
  );
};

export default AssetScannerModal;
