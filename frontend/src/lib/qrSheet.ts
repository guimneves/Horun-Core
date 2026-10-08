import QRCode from 'qrcode'
import horunIcon from '../assets/horun-icon.png'
import { equipmentUrl } from '../components/EquipmentQrCode'

// Folha A4 de QR codes dos equipamentos para recortar e colar nas bancadas:
// 6 por página (2 colunas × 3 linhas), cada etiqueta com o ícone do Horun, o
// QR (abre a página do equipamento) e o nome embaixo. Gerado no navegador.

export interface QrLabel {
  id: string
  name: string
  detail?: string // ex.: "Área · Tipo"
}

const PAGE_W = 210
const PAGE_H = 297
const MARGIN = 10
const COLS = 2
const ROWS = 3

/** Ícone reduzido (o PNG original é grande) e em PNG leve para o PDF. */
async function iconDataUrl(src: string, maxPx = 160): Promise<{ data: string; ratio: number }> {
  const img = await new Promise<HTMLImageElement>((resolve, reject) => {
    const el = new Image()
    el.onload = () => resolve(el)
    el.onerror = reject
    el.src = src
  })
  const ratio = img.naturalWidth / Math.max(1, img.naturalHeight)
  const h = Math.min(maxPx, img.naturalHeight)
  const canvas = document.createElement('canvas')
  canvas.width = Math.round(h * ratio)
  canvas.height = h
  canvas.getContext('2d')?.drawImage(img, 0, 0, canvas.width, canvas.height)
  return { data: canvas.toDataURL('image/png'), ratio }
}

export async function downloadQrSheet(labels: QrLabel[], filename = 'horun-qr-codes.pdf'): Promise<void> {
  // jsPDF só é baixado quando alguém pede o PDF
  const { jsPDF } = await import('jspdf')
  const doc = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'portrait', compress: true })
  const icon = await iconDataUrl(horunIcon).catch(() => null)

  const cellW = (PAGE_W - 2 * MARGIN) / COLS
  const cellH = (PAGE_H - 2 * MARGIN) / ROWS
  const perPage = COLS * ROWS

  for (let i = 0; i < labels.length; i++) {
    const label = labels[i]
    if (i > 0 && i % perPage === 0) doc.addPage()
    const slot = i % perPage
    const x = MARGIN + (slot % COLS) * cellW
    const y = MARGIN + Math.floor(slot / COLS) * cellH

    // linha de corte tracejada
    doc.setDrawColor(190)
    doc.setLineWidth(0.2)
    doc.setLineDashPattern([2, 2], 0)
    doc.rect(x, y, cellW, cellH)
    doc.setLineDashPattern([], 0)

    // cabeçalho: ícone + "Horun"
    const headY = y + 6
    if (icon) {
      const h = 8
      doc.addImage(icon.data, 'PNG', x + 6, headY, h * icon.ratio, h, 'horun-icon', 'FAST') // mesmo alias: embutido uma vez só
    }
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(11)
    doc.setTextColor(21, 33, 111) // azul-escuro do Horun
    doc.text('Horun', x + 6 + (icon ? 8 * icon.ratio + 2 : 0), headY + 5.6)
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(7.5)
    doc.setTextColor(120)
    doc.text('Escaneie para ver e reservar', x + cellW - 6, headY + 5.6, { align: 'right' })

    // QR
    const qrSize = 50
    const qr = await QRCode.toDataURL(equipmentUrl(label.id), { margin: 0, width: 400, errorCorrectionLevel: 'M' })
    const qrX = x + (cellW - qrSize) / 2
    const qrY = headY + 12
    doc.addImage(qr, 'PNG', qrX, qrY, qrSize, qrSize, undefined, 'FAST')

    // legenda
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(13)
    doc.setTextColor(20)
    const allLines = doc.splitTextToSize(label.name, cellW - 12) as string[]
    const nameLines = allLines.slice(0, 2)
    if (allLines.length > 2) nameLines[1] = `${nameLines[1].replace(/\s+\S*$/, '')}…` // nome longo: 2 linhas e reticências
    let ty = qrY + qrSize + 7
    nameLines.forEach((line) => {
      doc.text(line, x + cellW / 2, ty, { align: 'center' })
      ty += 5.5
    })
    if (label.detail) {
      doc.setFont('helvetica', 'normal')
      doc.setFontSize(9)
      doc.setTextColor(110)
      doc.text((doc.splitTextToSize(label.detail, cellW - 12) as string[])[0], x + cellW / 2, ty + 0.5, { align: 'center' })
    }
  }
  doc.save(filename)
}
