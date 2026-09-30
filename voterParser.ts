import { normalizeBengaliText, normalizeDate, bengaliToEnglishDigits } from './bengaliNormalizer.ts';
import { DbVoter } from './db.ts';

export interface ExtractedVoter {
  serialNumber: string;
  name: string;
  voterNumber: string;
  fatherName: string;
  motherName: string;
  occupation: string;
  dateOfBirth: string;
  address: string;
  originalText: string;
  ocrConfidence: number;
}

export interface DocumentHeaderInfo {
  district?: string;
  upazila?: string;
  unionName?: string;
  ward?: string;
  voterArea?: string;
  voterAreaCode?: string;
}

/**
 * Clean OCR artifacts commonly produced by Tesseract/Traineddata on old Bengali voter fonts
 */
export function cleanBengaliOcrArtifacts(raw: string): string {
  if (!raw) return '';

  return raw
    // Common OCR misreadings of voter list label keywords
    .replace(/Ïভাটার/g, 'ভোটার')
    .replace(/ভাটার/g, 'ভোটার')
    .replace(/নńর/g, 'নম্বর')
    .replace(/নং:/g, 'নং:')
    .replace(/িপতা:/g, 'পিতা:')
    .replace(/জĥ/g, 'জন্ম')
    .replace(/তািরখ/g, 'তারিখ')
    .replace(/িঠকানা/g, 'ঠিকানা')
    .replace(/Ïপশা/g, 'পেশা')
    .replace(/Ïজলা/g, 'জেলা')
    .replace(/উপেজলা/g, 'উপজেলা')
    .replace(/Ïপৗরসভা/g, 'পৌরসভা')
    .replace(/কËাŒটনেমŒট/g, 'ক্যান্টনমেন্ট')
    .replace(/ÏবাডÎ/g, 'বোর্ড')
    .replace(/ওয়াডÎ/g, 'ওয়ার্ড')
    .replace(/Ïদয়াড়া/g, 'দেয়াড়া')
    .replace(/Ïতঘিরয়া/g, 'তেঘরিয়া')
    .replace(/Ïতঘািরয়া/g, 'তেঘরিয়া')
    .replace(/Ïমাছাঃ/g, 'মোছাঃ')
    .replace(/Ïমাঃ/g, 'মোঃ')
    .replace(/Ïবগম/g, 'বেগম')
    .replace(/Ĵকােশর/g, 'প্রকাশের')
    .replace(/সবÎেমাট/g, 'সর্বমোট')
    .replace(/Ïমাট/g, 'মোট')
    .replace(/পুƁষ/g, 'পুরুষ')
    .replace(/মিহলা/g, 'মহিলা')
    .replace(/চূড়াĢ/g, 'চূড়ান্ত')
    .replace(/িনবÎাচন/g, 'নির্বাচন')
    .replace(/কিমশন/g, 'কমিশন')
    .replace(/অûল/g, 'অঞ্চল')
    .replace(/ডাকঘর/g, 'ডাকঘর')
    .replace(/ÏপাŞেকাড/g, 'পোস্টকোড')
    .replace(/গৃিহনী/g, 'গৃহিনী')
    .replace(/ছাĔ\/ছাĔী/g, 'ছাত্র/ছাত্রী')
    .replace(/ăাইভার/g, 'ড্রাইভার')
    .replace(/Řিমক/g, 'শ্রমিক')
    .replace(/িশÙক/g, 'শিক্ষক')
    .replace(/বËবসা/g, 'ব্যবসা')
    .replace(/ডিল/g, 'ডলি')
    .replace(/বাſ/g, 'বানু')
    .replace(/ভান/g, 'বানু')
    .replace(/ভাſ/g, 'ভানু');
}

/**
 * Extract document header metadata from page text
 */
export function extractDocumentHeader(text: string): DocumentHeaderInfo {
  const cleaned = cleanBengaliOcrArtifacts(text);
  const info: DocumentHeaderInfo = {};

  // District: জেলা: [value]
  const distMatch = cleaned.match(/জেলা\s*:\s*([^\n\r,]+)/i);
  if (distMatch) info.district = distMatch[1].trim();

  // Upazila/Thana: উপজেলা/থানা\s*:\s*([^\n\r,]+)
  const upaMatch = cleaned.match(/উপজেলা(?:\/থানা)?\s*:\s*([^\n\r,]+)/i);
  if (upaMatch) info.upazila = upaMatch[1].trim();

  // Union: ইউনিয়ন/ওয়ার্ড/ক্যাঃ বোঃ\s*:\s*([^\n\r,]+)
  const unionMatch = cleaned.match(/ইউনিয়ন(?:\/[^\:]+)?\s*:\s*([^\n\r,]+)/i);
  if (unionMatch) info.unionName = unionMatch[1].trim();

  // Ward: ওয়ার্ড নম্বর\s*(?:\([^\)]+\))?\s*:\s*([০-৯0-9]+)/i
  const wardMatch = cleaned.match(/ওয়ার্ড\s*নম্বর[^\:]*:\s*([০-৯0-9]+)/i);
  if (wardMatch) info.ward = wardMatch[1].trim();

  // Voter Area: ভোটার এলাকার নাম\s*:\s*([^\n\r,]+)
  const areaMatch = cleaned.match(/ভোটার\s*এলাকার\s*নাম\s*:\s*([^\n\r,]+)/i);
  if (areaMatch) info.voterArea = areaMatch[1].trim();

  // Voter Area Code: ভোটার এলাকার নম্বর\s*:\s*([০-৯0-9]+)/i
  const codeMatch = cleaned.match(/ভোটার\s*এলাকার\s*(?:কোড|নম্বর|নং)\s*:\s*([০-৯0-9]+)/i);
  if (codeMatch) info.voterAreaCode = codeMatch[1].trim();

  return info;
}

/**
 * Parse page text into individual voter records
 */
export function parseVoterRecordsFromPage(
  rawPageText: string,
  docHeader: DocumentHeaderInfo,
  documentId: string,
  pdfFileName: string,
  pageNumber: number
): DbVoter[] {
  const cleaned = cleanBengaliOcrArtifacts(rawPageText);
  const results: DbVoter[] = [];

  // Match voter blocks starting with serial number e.g. "০০০১. নাম:" or "১২৩৪. নাম:" or "০০০১."
  // RegEx to find voter record beginnings
  const serialRegex = /(?:^|\n|\r)\s*([০-৯0-9]{3,5})\s*[\.\:\-]?\s*(?:নাম\s*:|মাইগ্রেট|স্থানান্তরিত)/g;
  const matches = [...cleaned.matchAll(serialRegex)];

  if (matches.length === 0) {
    // Fallback: try splitting by "নাম:" if serial numbers aren't prefixing cleanly
    const nameMatches = [...cleaned.matchAll(/(?:^|\n|\r)\s*(?:([০-৯0-9]+)\s*[\.\:\-]?)?\s*নাম\s*:\s*([^\n\r]+)/g)];
    if (nameMatches.length > 0) {
      for (let i = 0; i < nameMatches.length; i++) {
        const startIdx = nameMatches[i].index || 0;
        const endIdx = i + 1 < nameMatches.length ? (nameMatches[i + 1].index || cleaned.length) : cleaned.length;
        const block = cleaned.substring(startIdx, endIdx);
        const voter = parseSingleVoterBlock(block, docHeader, documentId, pdfFileName, pageNumber, nameMatches[i][1] || `${i + 1}`);
        if (voter) results.push(voter);
      }
    }
    return results;
  }

  for (let i = 0; i < matches.length; i++) {
    const match = matches[i];
    const serial = match[1];
    const startIdx = match.index || 0;
    const endIdx = i + 1 < matches.length ? (matches[i + 1].index || cleaned.length) : cleaned.length;
    const block = cleaned.substring(startIdx, endIdx).trim();

    // Check if migrated
    if (block.includes('মাইগ্রেট') || block.includes('স্থানান্তরিত')) {
      // Skipped or marked as migrated
      continue;
    }

    const voter = parseSingleVoterBlock(block, docHeader, documentId, pdfFileName, pageNumber, serial);
    if (voter) {
      results.push(voter);
    }
  }

  return results;
}

/**
 * Parse an individual block containing a single voter's fields
 */
function parseSingleVoterBlock(
  block: string,
  header: DocumentHeaderInfo,
  documentId: string,
  pdfFileName: string,
  pageNumber: number,
  fallbackSerial: string
): DbVoter | null {
  // Extract serial number if present
  let serialNumber = fallbackSerial;
  const serialMatch = block.match(/^([০-৯0-9]{1,5})\s*[\.\:\-]/);
  if (serialMatch) {
    serialNumber = serialMatch[1];
  }

  // Extract Name: নাম\s*:\s*([^\n\r]+)
  const nameMatch = block.match(/নাম\s*:\s*([^\n\r]+)/i);
  if (!nameMatch) return null;
  const name = nameMatch[1].replace(/ভোটার.*$/, '').trim();
  if (!name || name.length < 2) return null;

  // Extract Voter Number: ভোটার\s*(?:নম্বর|নং)\s*:\s*([০-৯0-9]{8,20})/i
  let voterNumber = '';
  const voterNoMatch = block.match(/ভোটার\s*(?:নম্বর|নং|নńর)\s*:\s*([০-৯0-9]+)/i);
  if (voterNoMatch) {
    voterNumber = voterNoMatch[1].trim();
  }

  // Extract Father: পিতা\s*:\s*([^\n\r]+)/i or স্বামী\s*:\s*([^\n\r]+)/i
  let fatherName = '';
  const fatherMatch = block.match(/(?:পিতা|স্বামী|িপতা)\s*:\s*([^\n\r]+)/i);
  if (fatherMatch) {
    fatherName = fatherMatch[1].replace(/মাতা.*$/, '').trim();
  }

  // Extract Mother: মাতা\s*:\s*([^\n\r]+)/i
  let motherName = '';
  const motherMatch = block.match(/মাতা\s*:\s*([^\n\r]+)/i);
  if (motherMatch) {
    motherName = motherMatch[1].replace(/(?:পেশা|জন্ম|ঠিকানা).*$/, '').trim();
  }

  // Extract Occupation: পেশা\s*:\s*([^,\n\r]+)/i
  let occupation = '';
  const occMatch = block.match(/(?:পেশা|Ïপশা)\s*:\s*([^,\n\r]+)/i);
  if (occMatch) {
    occupation = occMatch[1].replace(/জন্ম.*$/, '').trim();
  }

  // Extract Date of Birth: জন্ম\s*তারিখ\s*:\s*([০-৯0-9\/\-\.]+)/i
  let dateOfBirth = '';
  const dobMatch = block.match(/(?:জন্ম\s*তারিখ|জĥ\s*তািরখ)\s*:\s*([০-৯0-9\/\-\.]+)/i);
  if (dobMatch) {
    dateOfBirth = dobMatch[1].trim();
  }

  // Extract Address: ঠিকানা\s*:\s*([^\n\r]+(?:\n[^\n\r]+)?)/i
  let address = '';
  const addrMatch = block.match(/(?:ঠিকানা|িঠকানা)\s*:\s*([\s\S]+?)(?=\n\s*[০-৯0-9]+\.|$)/i);
  if (addrMatch) {
    address = addrMatch[1].replace(/\s+/g, ' ').trim();
  }

  const id = `${documentId}_p${pageNumber}_s${serialNumber}_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;

  // Normalizations for ultra-fast and resilient indexing
  const norm_name = normalizeBengaliText(name);
  const norm_father = normalizeBengaliText(fatherName);
  const norm_mother = normalizeBengaliText(motherName);
  const norm_dob = normalizeDate(dateOfBirth);
  const norm_voter_no = bengaliToEnglishDigits(voterNumber);
  const norm_address = normalizeBengaliText(address);

  // Consolidated search text containing all field variations
  const norm_all = [
    norm_name,
    norm_father,
    norm_mother,
    norm_dob,
    norm_voter_no,
    voterNumber,
    serialNumber,
    bengaliToEnglishDigits(serialNumber),
    norm_address,
    normalizeBengaliText(occupation),
    normalizeBengaliText(header.voterArea || ''),
    normalizeBengaliText(header.district || ''),
    normalizeBengaliText(header.upazila || '')
  ].filter(Boolean).join(' ');

  return {
    id,
    document_id: documentId,
    serial_number: serialNumber,
    name,
    voter_number: voterNumber,
    father_name: fatherName,
    mother_name: motherName,
    occupation,
    date_of_birth: dateOfBirth,
    address,
    district: header.district || '',
    upazila: header.upazila || '',
    union_name: header.unionName || '',
    ward: header.ward || '',
    voter_area: header.voterArea || '',
    voter_area_code: header.voterAreaCode || '',
    pdf_file_name: pdfFileName,
    page_number: pageNumber,
    original_text: block,
    ocr_confidence: 0.95,
    bounding_boxes: '',
    norm_name,
    norm_father,
    norm_mother,
    norm_dob,
    norm_voter_no,
    norm_address,
    norm_all,
    created_at: new Date().toISOString()
  };
}
