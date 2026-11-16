import { execFile } from 'node:child_process';
import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

/** macOS Vision OCR. Accepts images and the first page of a PDF. */
const OCR_SCRIPT = String.raw`
import Foundation
import Vision
import AppKit
import PDFKit

let path = CommandLine.arguments[1]
var image: CGImage? = nil

if path.lowercased().hasSuffix(".pdf"),
   let doc = PDFDocument(url: URL(fileURLWithPath: path)),
   let page = doc.page(at: 0) {
  let rect = page.bounds(for: .mediaBox)
  let scale: CGFloat = 2.0
  let width = max(1, Int(rect.width * scale))
  let height = max(1, Int(rect.height * scale))
  if let ctx = CGContext(
    data: nil, width: width, height: height, bitsPerComponent: 8, bytesPerRow: 0,
    space: CGColorSpaceCreateDeviceRGB(),
    bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue
  ) {
    ctx.setFillColor(NSColor.white.cgColor)
    ctx.fill(CGRect(x: 0, y: 0, width: width, height: height))
    ctx.scaleBy(x: scale, y: scale)
    page.draw(with: .mediaBox, to: ctx)
    image = ctx.makeImage()
  }
} else if let source = NSImage(contentsOfFile: path),
          let tiff = source.tiffRepresentation,
          let rep = NSBitmapImageRep(data: tiff) {
  image = rep.cgImage
}

guard let cgImage = image else {
  FileHandle.standardError.write(Data("unsupported document".utf8))
  exit(2)
}

let request = VNRecognizeTextRequest()
request.recognitionLevel = .accurate
request.usesLanguageCorrection = true
request.recognitionLanguages = ["en-US"]

let handler = VNImageRequestHandler(cgImage: cgImage, options: [:])
try handler.perform([request])

struct Segment { let text: String; let x: CGFloat; let y: CGFloat }
var segments: [Segment] = []
for observation in request.results ?? [] {
  guard let candidate = observation.topCandidates(1).first else { continue }
  let box = observation.boundingBox
  segments.append(Segment(text: candidate.string, x: box.minX, y: box.midY))
}

// Rebuild visual rows so columns stay on the same line.
segments.sort { $0.y > $1.y }
var rows: [[Segment]] = []
for segment in segments {
  if let anchor = rows.last?.first, abs(anchor.y - segment.y) < 0.008 {
    rows[rows.count - 1].append(segment)
  } else {
    rows.append([segment])
  }
}

for row in rows {
  print(row.sorted { $0.x < $1.x }.map { $0.text }.joined(separator: "  "))
}
`;

export interface ExtractedLineItem {
  description: string;
  quantity: number;
  unitPrice: number;
}

export interface ExtractedReceipt {
  vendorName: string;
  date: string;
  amount: number;
  lineItems: ExtractedLineItem[];
}

/** Run text recognition and return the raw lines. */
export async function recogniseText(filePath: string): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), 'microbalance-ocr-'));
  const script = join(dir, 'ocr.swift');
  await writeFile(script, OCR_SCRIPT, 'utf8');
  const { stdout } = await execFileAsync('swift', [script, filePath], {
    timeout: 90_000,
    maxBuffer: 4 * 1024 * 1024,
  });
  return stdout.trim();
}

const NUMBER = /\d[\d,]*(?:\.\d{1,2})?/g;

const numbersIn = (line: string): number[] =>
  (line.match(NUMBER) ?? [])
    .map((raw) => Number(raw.replace(/,/g, '')))
    .filter((value) => Number.isFinite(value));

const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

const normaliseDate = (line: string): string | null => {
  const iso = line.match(/\b(\d{4})-(\d{2})-(\d{2})\b/);
  if (iso) return iso[0];

  const numeric = line.match(/\b(\d{1,2})[\/.-](\d{1,2})[\/.-](\d{2,4})\b/);
  if (numeric) {
    let [, a, b, c] = numeric;
    let year = Number(c);
    if (c.length === 2) year += year > 70 ? 1900 : 2000;
    const first = Number(a);
    const second = Number(b);
    const day = first > 12 ? first : second > 12 ? second : first;
    const month = first > 12 ? second : second > 12 ? first : second;
    if (month >= 1 && month <= 12 && day >= 1 && day <= 31) {
      return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    }
  }

  const named = line.match(/\b(\d{1,2})\s+([A-Za-z]{3,9})\s+(\d{4})\b/);
  if (named) {
    const parsed = new Date(`${named[2]} ${named[1]}, ${named[3]}`);
    if (!Number.isNaN(parsed.getTime())) return parsed.toISOString().slice(0, 10);
  }

  return null;
};

const cleanDescription = (line: string): string =>
  line
    .replace(NUMBER, ' ')
    .replace(/[₦$#]/g, ' ')
    .replace(/\s{2,}/g, ' ')
    .replace(/^[\s|.,:-]+|[\s|.,:-]+$/g, '')
    .trim();

const SKIP = /(subtotal|sub total|total|vat|tax|discount|change|balance|cash|amount due)/i;

/** Heuristic receipt parser: vendor, date, total, and priced line items. */
export function parseReceipt(text: string): ExtractedReceipt {
  const lines = text
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line !== '');

  let date = '';
  for (const line of lines) {
    const candidate = normaliseDate(line);
    if (candidate !== null) {
      date = candidate;
      break;
    }
  }

  let amount = 0;
  const totalLine = lines.find((line) => /(grand\s*total|total|amount\s*due)/i.test(line));
  if (totalLine) {
    const values = numbersIn(totalLine);
    if (values.length > 0) amount = values[values.length - 1];
  }
  if (amount === 0) {
    for (const line of lines) {
      for (const value of numbersIn(line)) amount = Math.max(amount, value);
    }
  }

  const vendorName =
    lines.find((line) => {
      if (ISO_DATE.test(line) || normaliseDate(line) !== null) return false;
      if (/(receipt|invoice|tax invoice)/i.test(line)) return false;
      if (!/[A-Za-z]{3}/.test(line)) return false;
      return line.length <= 60;
    }) ?? 'Unknown vendor';

  const lineItems: ExtractedLineItem[] = [];
  for (const line of lines) {
    if (SKIP.test(line)) continue;
    if (normaliseDate(line) !== null) continue;
    if (line === vendorName) continue;
    const values = numbersIn(line);
    if (values.length < 2) continue;

    const firstCell = (line.split(/\s{2,}/)[0] ?? '').trim();
    const description = firstCell.length >= 3 ? firstCell : cleanDescription(line);
    if (description.length < 3) continue;

    let quantity = 1;
    let unitPrice = 0;
    if (values.length >= 3) {
      quantity = values[values.length - 3] || 1;
      unitPrice = values[values.length - 2];
    } else {
      quantity = values[0] || 1;
      unitPrice = quantity > 0 ? values[values.length - 1] / quantity : 0;
    }
    if (!Number.isFinite(unitPrice) || unitPrice <= 0) continue;

    lineItems.push({
      description,
      quantity: Number(quantity.toFixed(2)),
      unitPrice: Number(unitPrice.toFixed(2)),
    });
  }

  if (lineItems.length === 0 && amount > 0) {
    lineItems.push({ description: 'Receipt total', quantity: 1, unitPrice: amount });
  }

  return { vendorName, date, amount, lineItems };
}
