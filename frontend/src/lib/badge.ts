import QRCode from 'qrcode'
import { API_BASE, type BadgeData } from '../api/client'
import badgeBack from '../assets/badge-back.png'
import badgeFront from '../assets/badge-front.png'

// Crachá automático (Prompt 8.3 item 7, pedido do usuário em 2026-10-20), no
// modelo do NQTR ("Modelo 2.ai"): cartão de 60,45 × 92,2 mm, frente com foto
// no círculo amarelo, nome, título e QR code (vCard); verso com contato,
// e-mail, contato de emergência, alergias e condições médicas e tipo
// sanguíneo. Os fundos (faixas e logos) foram tirados do modelo, sem textos,
// foto nem QR. Gerado no navegador (jsPDF), uma página por face.

const W = 60.45
const H = 92.2
const CX = W / 2
// círculo amarelo da frente (medido no modelo)
const PHOTO = { cx: 30.16, cy: 38.21, d: 28.2 }
const QR = { x: 22.29, y: 69.03, size: 15.9 }
const NAME_COLOR: [number, number, number] = [240, 79, 79] // #f04f4f
const TEXT_COLOR: [number, number, number] = [35, 31, 32] // #231f20
const SITE = 'www.nqtr.iq.ufrj.br'
const ORG = 'NQTR — IQ-UFRJ'

type Doc = InstanceType<(typeof import('jspdf'))['jsPDF']>

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.crossOrigin = 'use-credentials'
    img.onload = () => resolve(img)
    img.onerror = reject
    img.src = src
  })
}

/** Foto recortada em círculo (cobre o círculo, centralizada), em PNG. */
async function circlePhoto(userId: number): Promise<string | null> {
  try {
    const res = await fetch(`${API_BASE}/users/${userId}/photo`, { credentials: 'include' })
    if (!res.ok) return null
    const url = URL.createObjectURL(await res.blob())
    try {
      const img = await loadImage(url)
      const size = 700
      const canvas = document.createElement('canvas')
      canvas.width = canvas.height = size
      const ctx = canvas.getContext('2d')
      if (!ctx) return null
      ctx.beginPath()
      ctx.arc(size / 2, size / 2, size / 2, 0, Math.PI * 2)
      ctx.clip()
      const scale = Math.max(size / img.naturalWidth, size / img.naturalHeight)
      const w = img.naturalWidth * scale
      const h = img.naturalHeight * scale
      ctx.drawImage(img, (size - w) / 2, (size - h) / 2, w, h)
      return canvas.toDataURL('image/png')
    } finally {
      URL.revokeObjectURL(url)
    }
  } catch {
    return null
  }
}

function vcardEscape(v: string): string {
  return v.replace(/\\/g, '\\\\').replace(/,/g, '\\,').replace(/;/g, '\\;').replace(/\n/g, '\\n')
}

/** QR da frente: o celular lê e oferece salvar o contato (funciona sem rede). */
export function badgeVcard(b: BadgeData): string {
  const full = (b.full_name || b.name).trim()
  const parts = full.split(/\s+/)
  const last = parts.length > 1 ? parts[parts.length - 1] : ''
  const first = parts.length > 1 ? parts.slice(0, -1).join(' ') : full
  const lines = [
    'BEGIN:VCARD',
    'VERSION:3.0',
    `N:${vcardEscape(last)};${vcardEscape(first)};;;`,
    `FN:${vcardEscape(full)}`,
    `ORG:${vcardEscape(ORG)}`,
    b.title ? `TITLE:${vcardEscape(b.title)}` : '',
    b.email ? `EMAIL;TYPE=INTERNET:${b.email}` : '',
    b.phone ? `TEL;TYPE=CELL:${b.phone}` : '',
    `URL:https://${SITE}`,
    'END:VCARD',
  ]
  return lines.filter(Boolean).join('\n')
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  return ((parts[0]?.[0] ?? '') + (parts.length > 1 ? parts[parts.length - 1][0] : '')).toUpperCase()
}

/** Texto centrado numa linha só, encolhendo a fonte até caber. */
function fitLine(doc: Doc, text: string, y: number, maxW: number, size: number, minSize: number) {
  let s = size
  doc.setFontSize(s)
  while (s > minSize && doc.getTextWidth(text) > maxW) {
    s -= 0.5
    doc.setFontSize(s)
  }
  if (doc.getTextWidth(text) > maxW) {
    const lines = doc.splitTextToSize(text, maxW) as string[]
    doc.text(lines.slice(0, 2), CX, y, { align: 'center' })
    return
  }
  doc.text(text, CX, y, { align: 'center' })
}

async function front(doc: Doc, b: BadgeData) {
  doc.addImage(badgeFront, 'PNG', 0, 0, W, H, 'badge-front', 'FAST')
  const photo = b.has_photo ? await circlePhoto(b.id) : null
  if (photo) {
    doc.addImage(photo, 'PNG', PHOTO.cx - PHOTO.d / 2, PHOTO.cy - PHOTO.d / 2, PHOTO.d, PHOTO.d, `photo-${b.id}`, 'FAST')
  } else {
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(26)
    doc.setTextColor(...TEXT_COLOR)
    doc.text(initials(b.name), PHOTO.cx, PHOTO.cy + 3.2, { align: 'center' })
  }
  doc.setFont('helvetica', 'bold')
  doc.setTextColor(...NAME_COLOR)
  fitLine(doc, b.name, 59.4, W - 8, 12, 8.5)
  if (b.title) {
    doc.setFont('helvetica', 'normal')
    doc.setTextColor(...TEXT_COLOR)
    fitLine(doc, b.title, 64.3, W - 10, 10, 7)
  }
  const qr = await QRCode.toDataURL(badgeVcard(b), { margin: 0, width: 360, errorCorrectionLevel: 'M' })
  doc.addImage(qr, 'PNG', QR.x, QR.y, QR.size, QR.size)
}

function back(doc: Doc, b: BadgeData) {
  doc.addImage(badgeBack, 'PNG', 0, 0, W, H, 'badge-back', 'FAST')
  const emergency = [b.emergency_contact_phone, b.emergency_contact_name ? `(${b.emergency_contact_name})` : ''].filter(Boolean).join(' ')
  const blocks: [string, string][] = [
    ['Contato:', b.phone],
    ['E-mail:', b.email],
    ['Contato de Emergência:', emergency],
    ['Alergias e Condições Médicas:', b.medical_notes],
  ].filter(([, v]) => v) as [string, string][]
  const maxW = W - 9
  // o texto acaba antes do logo do verso (~61 mm): encolhe se precisar
  for (let size = 8; size >= 6; size -= 0.5) {
    const line = size * 0.42
    let height = 0
    doc.setFontSize(size)
    for (const [, v] of blocks) height += line + (doc.splitTextToSize(v, maxW) as string[]).length * line + line * 0.7
    if (b.blood_type) height += line
    if (height <= 46 || size === 6) {
      let y = 15.6
      doc.setTextColor(...TEXT_COLOR)
      for (const [label, value] of blocks) {
        doc.setFont('helvetica', 'bold')
        doc.text(label, CX, y, { align: 'center' })
        y += line
        doc.setFont('helvetica', 'normal')
        const lines = doc.splitTextToSize(value, maxW) as string[]
        doc.text(lines, CX, y, { align: 'center', lineHeightFactor: 1.2 })
        y += lines.length * line + line * 0.7
      }
      if (b.blood_type) {
        doc.setFont('helvetica', 'bold')
        const label = 'Tipo Sanguíneo: '
        const lw = doc.getTextWidth(label)
        doc.setFont('helvetica', 'normal')
        const vw = doc.getTextWidth(b.blood_type)
        const x0 = CX - (lw + vw) / 2
        doc.setFont('helvetica', 'bold')
        doc.text(label, x0, y)
        doc.setFont('helvetica', 'normal')
        doc.text(b.blood_type, x0 + lw, y)
      }
      break
    }
  }
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(6)
  doc.setTextColor(...TEXT_COLOR)
  doc.text(SITE, 8.4, 90.6)
}

/** PDF com o crachá de cada pessoa (frente e verso, nessa ordem). */
export async function downloadBadges(badges: BadgeData[], filename = 'crachas-nqtr.pdf'): Promise<void> {
  if (!badges.length) return
  const { jsPDF } = await import('jspdf')
  const doc = new jsPDF({ unit: 'mm', format: [W, H], orientation: 'portrait', compress: true })
  for (let i = 0; i < badges.length; i++) {
    if (i > 0) doc.addPage([W, H], 'portrait')
    await front(doc, badges[i])
    doc.addPage([W, H], 'portrait')
    back(doc, badges[i])
  }
  doc.save(filename)
}
