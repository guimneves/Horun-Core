import { useEffect, useState } from 'react'
import QRCode from 'qrcode'

// QR code pra colar na bancada do equipamento — aponta pra própria
// página de detalhe dele, então quem escaneia com o celular já cai lá.
export function EquipmentQrCode({ equipmentName }: { equipmentName: string }) {
  const [dataUrl, setDataUrl] = useState<string | null>(null)

  useEffect(() => {
    QRCode.toDataURL(window.location.href, { margin: 1, width: 220 })
      .then(setDataUrl)
      .catch(() => setDataUrl(null))
  }, [])

  if (!dataUrl) return null

  return (
    <div className="flex flex-col items-center gap-2">
      <div id="equipment-qr-print" className="flex flex-col items-center gap-2">
        <img src={dataUrl} alt={`QR code de ${equipmentName}`} className="rounded-lg" style={{ background: '#fff', padding: 8 }} />
        <span className="text-sm font-semibold">{equipmentName}</span>
      </div>
      <button
        onClick={() => window.print()}
        className="text-xs underline"
        style={{ color: 'var(--color-primary)' }}
      >
        imprimir
      </button>
      <style>{`
        @media print {
          body * { visibility: hidden; }
          #equipment-qr-print, #equipment-qr-print * { visibility: visible; }
          #equipment-qr-print { position: fixed; top: 40px; left: 0; right: 0; text-align: center; }
        }
      `}</style>
    </div>
  )
}
