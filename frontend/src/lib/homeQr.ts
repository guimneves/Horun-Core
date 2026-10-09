import QRCode from 'qrcode'
import horunIcon from '../assets/horun-icon.png'

// QR code da página inicial do Horun — para cartaz na porta do laboratório,
// mesa de entrada etc. Quem escaneia cai no Horun (no login, se não estiver
// logado). Gerado no navegador, sem rede.

/** Endereço que o QR abre: a raiz do site, sem nada da tela atual. */
export function homeUrl(): string {
  return `${window.location.origin}/`
}

export function homeQrDataUrl(width = 600): Promise<string> {
  return QRCode.toDataURL(homeUrl(), { margin: 2, width, errorCorrectionLevel: 'M' })
}

/** PNG do QR (para colar em slide, e-mail, mensagem). */
export async function downloadHomeQrPng(filename = 'horun-qr-code.png'): Promise<void> {
  const a = document.createElement('a')
  a.href = await homeQrDataUrl(1000)
  a.download = filename
  a.click()
}

async function iconDataUrl(): Promise<{ data: string; ratio: number } | null> {
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image()
      el.onload = () => resolve(el)
      el.onerror = reject
      el.src = horunIcon
    })
    const ratio = img.naturalWidth / Math.max(1, img.naturalHeight)
    const canvas = document.createElement('canvas')
    canvas.height = Math.min(240, img.naturalHeight)
    canvas.width = Math.round(canvas.height * ratio)
    canvas.getContext('2d')?.drawImage(img, 0, 0, canvas.width, canvas.height)
    return { data: canvas.toDataURL('image/png'), ratio }
  } catch {
    return null
  }
}

/** Cartaz A4: ícone + "Horun", o QR grande e o endereço embaixo. */
export async function downloadHomeQrPdf(filename = 'horun-qr-code.pdf'): Promise<void> {
  const { jsPDF } = await import('jspdf')
  const doc = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'portrait', compress: true })
  const W = 210
  const icon = await iconDataUrl()

  const head = 'Horun'
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(34)
  const textW = doc.getTextWidth(head)
  const iconH = 18
  const iconW = icon ? iconH * icon.ratio : 0
  const startX = (W - (iconW + (icon ? 5 : 0) + textW)) / 2
  if (icon) doc.addImage(icon.data, 'PNG', startX, 30, iconW, iconH, undefined, 'FAST')
  doc.setTextColor(21, 33, 111) // azul-escuro do Horun
  doc.text(head, startX + iconW + (icon ? 5 : 0), 30 + iconH * 0.75)

  doc.setFont('helvetica', 'normal')
  doc.setFontSize(13)
  doc.setTextColor(90)
  doc.text('Laboratório NQTR · Instituto de Química, UFRJ', W / 2, 62, { align: 'center' })

  const size = 130
  doc.addImage(await homeQrDataUrl(1200), 'PNG', (W - size) / 2, 75, size, size, undefined, 'FAST')

  doc.setFontSize(15)
  doc.setTextColor(20)
  doc.text('Aponte a câmera do celular para entrar no Horun', W / 2, 222, { align: 'center' })
  doc.setFontSize(12)
  doc.setTextColor(110)
  doc.text(homeUrl().replace(/\/$/, ''), W / 2, 232, { align: 'center' })
  doc.save(filename)
}
