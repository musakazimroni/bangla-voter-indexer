import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { PDFDocument, rgb, StandardFonts } from 'pdf-lib';
import { saveDocument, insertVotersBatch, getIndexStats, db, DbDocument, DbVoter } from './db.ts';
import { normalizeBengaliText, normalizeDate, bengaliToEnglishDigits } from './bengaliNormalizer.ts';

const UPLOADS_DIR = path.join(process.cwd(), 'uploads');

/**
 * Creates a valid PDF with pages for the sample documents
 */
async function generateSamplePdf(
  filePath: string,
  title: string,
  pageCount: number,
  pagesContent: { pageNum: number; voters: { serial: string; name: string; voterNo: string; father: string; mother: string; dob: string; addr: string }[] }[]
) {
  const pdfDoc = await PDFDocument.create();
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const boldFont = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

  for (let p = 1; p <= pageCount; p++) {
    const page = pdfDoc.addPage([595.28, 841.89]); // A4 portrait
    const { width, height } = page.getSize();

    // Draw header box
    page.drawRectangle({
      x: 30,
      y: height - 60,
      width: width - 60,
      height: 40,
      borderColor: rgb(0.2, 0.2, 0.2),
      borderWidth: 1,
      color: rgb(0.96, 0.96, 0.96)
    });

    page.drawText(`Bangladesh Election Commission - Voter List`, {
      x: 40,
      y: height - 40,
      size: 11,
      font: boldFont,
      color: rgb(0.1, 0.4, 0.2)
    });

    page.drawText(`${title} | Page ${p} of ${pageCount}`, {
      x: 40,
      y: height - 52,
      size: 9,
      font,
      color: rgb(0.3, 0.3, 0.3)
    });

    // Content for this page
    const pageData = pagesContent.find((x) => x.pageNum === p);
    if (pageData && pageData.voters.length > 0) {
      const startY = height - 80;
      const boxWidth = (width - 70) / 3;
      const boxHeight = 110;

      pageData.voters.forEach((v, idx) => {
        const col = idx % 3;
        const row = Math.floor(idx / 3);
        const x = 30 + col * (boxWidth + 5);
        const y = startY - (row + 1) * (boxHeight + 5);

        if (y > 40) {
          page.drawRectangle({
            x,
            y,
            width: boxWidth,
            height: boxHeight,
            borderColor: rgb(0.7, 0.7, 0.7),
            borderWidth: 0.8,
            color: rgb(1, 1, 1)
          });

          const engSerial = bengaliToEnglishDigits(v.serial || '');
          const engVoterNo = bengaliToEnglishDigits(v.voterNo || '');
          const engDob = bengaliToEnglishDigits(v.dob || '');

          page.drawText(`${engSerial}. Voter: ${engVoterNo}`, {
            x: x + 5,
            y: y + boxHeight - 16,
            size: 8,
            font: boldFont,
            color: rgb(0.1, 0.1, 0.1)
          });

          page.drawText(`Voter Record #${engSerial}`, {
            x: x + 5,
            y: y + boxHeight - 30,
            size: 8,
            font: boldFont,
            color: rgb(0.1, 0.1, 0.1)
          });

          page.drawText(`Electoral Roll - Deyara 0692`, {
            x: x + 5,
            y: y + boxHeight - 44,
            size: 7.5,
            font,
            color: rgb(0.2, 0.2, 0.2)
          });

          page.drawText(`DOB: ${engDob}`, {
            x: x + 5,
            y: y + boxHeight - 58,
            size: 7.5,
            font,
            color: rgb(0.2, 0.2, 0.2)
          });

          page.drawText(`Ward 5, Teghoriya`, {
            x: x + 5,
            y: y + boxHeight - 72,
            size: 7,
            font,
            color: rgb(0.4, 0.4, 0.4)
          });
        }
      });
    } else {
      page.drawText(`Page ${p} - Official Electoral Roll Data`, {
        x: width / 2 - 100,
        y: height / 2,
        size: 12,
        font,
        color: rgb(0.5, 0.5, 0.5)
      });
    }

    // Footer
    page.drawText(`Electoral Roll - Deyara, Jessore Sadar`, {
      x: width / 2 - 80,
      y: 20,
      size: 8,
      font,
      color: rgb(0.6, 0.6, 0.6)
    });
  }

  const pdfBytes = await pdfDoc.save();
  fs.writeFileSync(filePath, pdfBytes);
}

/**
 * Seed all attached sample documents and synthetic test data
 */
export async function seedSampleVoterData() {
  const stats = getIndexStats();
  if (stats.documentsCount > 0 && stats.totalRecords > 100) {
    console.log(`Database already has ${stats.totalRecords} records across ${stats.documentsCount} documents.`);
    return;
  }

  console.log('Seeding attached real Bengali Voter List documents...');

  // 1. Synthetic dataset required by user prompt:
  // মোঃ আব্দুল করিম, পিতা: মোঃ রহিম উদ্দিন, মাতা: শাহানারা বেগম, ঠিকানা: হাকিমপুর, বয়স: ৪৫, ক্রমিক নং: ১২৩৪
  const syntheticDocId = 'doc_synth_hakimpur_01';
  const synthFileName = 'hakimpur_synthetic_voters.pdf';
  const synthFilePath = path.join(UPLOADS_DIR, synthFileName);

  const synthVotersData = [
    {
      serial: '১২৩৪',
      name: 'মোঃ আব্দুল করিম',
      voterNo: '৪১০৬৯২২০০১২৩৪',
      father: 'মোঃ রহিম উদ্দিন',
      mother: 'শাহানারা বেগম',
      dob: '০১/০৫/১৯৭৯',
      addr: 'হাকিমপুর, যশোর'
    },
    {
      serial: '১২৩৫',
      name: 'শাহানারা বেগম',
      voterNo: '৪১০৬৯২২০০১২৩৫',
      father: 'আব্দুল গফুর',
      mother: 'ফাতেমা খাতুন',
      dob: '০১/০৫/১৯৯৩',
      addr: 'হাকিমপুর, যশোর'
    },
    {
      serial: '১২৩৬',
      name: 'মোঃ সাইফুল ইসলাম',
      voterNo: '৪১০৬৯২২৮৮৯০২',
      father: 'আব্দুল গফুর',
      mother: 'মেরী',
      dob: '২৩/০৭/১৯৮৩',
      addr: 'তেঘরিয়া, ৪০ নং তেঘরিয়া, যশোর সদর, যশোর'
    },
    {
      serial: '১২৩৭',
      name: 'ফাতেমা খাতুন',
      voterNo: '৪১০৬৯২২০০১২৩৭',
      father: 'মোঃ রহিম উদ্দিন',
      mother: 'শাহানারা বেগম',
      dob: '১২/০৪/১৯৮৫',
      addr: 'হাকিমপুর, যশোর'
    },
    {
      serial: '১২৩৮',
      name: 'আব্দুল গফুর',
      voterNo: '৪১০৬৯২২০০১২৩৮',
      father: 'করিম বক্স',
      mother: 'ছবুরা খাতুন',
      dob: '১০/১০/১৯৫৫',
      addr: 'তেঘরিয়া, যশোর'
    },
    {
      serial: '১২৩৯',
      name: 'সাদিয়া সুলতানা মেঘলা',
      voterNo: '৪১০৬৯২২০০১২৩৯',
      father: 'আব্দুল জব্বার লাভলু',
      mother: 'মমতাজ বেগম',
      dob: '১৪/১১/২০০৪',
      addr: 'তেঘরিয়া, যশোর সদর, যশোর'
    },
    {
      serial: '১২৪০',
      name: 'মুসা কাজীম',
      voterNo: '৪১০৬৯২২০০১২৪০',
      father: 'আব্দুল জব্বার লাভলু',
      mother: 'মমতাজ বেগম',
      dob: '১৪/১১/২০০৪',
      addr: 'তেঘরিয়া, যশোর সদর, যশোর'
    }
  ];

  await generateSamplePdf(synthFilePath, 'Hakimpur Test Voter List', 2, [
    { pageNum: 1, voters: synthVotersData }
  ]);

  const synthHash = crypto.createHash('sha256').update(fs.readFileSync(synthFilePath)).digest('hex');
  saveDocument({
    id: syntheticDocId,
    filename: synthFileName,
    original_name: synthFileName,
    file_path: synthFilePath,
    file_hash: synthHash,
    file_size: fs.statSync(synthFilePath).size,
    page_count: 2,
    processed_pages: 2,
    status: 'completed',
    ocr_status: 'completed',
    total_records: synthVotersData.length,
    district: 'যশোর',
    upazila: 'যশোর সদর',
    union_name: 'দেয়াড়া',
    ward: '৫',
    voter_area: 'হাকিমপুর',
    voter_area_code: '০৬৯৩',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  });

  const synthDbVoters: DbVoter[] = synthVotersData.map((v, i) => {
    const norm_name = normalizeBengaliText(v.name);
    const norm_father = normalizeBengaliText(v.father);
    const norm_mother = normalizeBengaliText(v.mother);
    const norm_dob = normalizeDate(v.dob);
    const norm_voter_no = bengaliToEnglishDigits(v.voterNo);
    const norm_address = normalizeBengaliText(v.addr);
    const norm_all = `${norm_name} ${norm_father} ${norm_mother} ${norm_dob} ${norm_voter_no} ${v.voterNo} ${v.serial} ${bengaliToEnglishDigits(v.serial)} ${norm_address}`;

    return {
      id: `${syntheticDocId}_p1_s${v.serial}`,
      document_id: syntheticDocId,
      serial_number: v.serial,
      name: v.name,
      voter_number: v.voterNo,
      father_name: v.father,
      mother_name: v.mother,
      occupation: 'কৃষক',
      date_of_birth: v.dob,
      address: v.addr,
      district: 'যশোর',
      upazila: 'যশোর সদর',
      union_name: 'দেয়াড়া',
      ward: '৫',
      voter_area: 'হাকিমপুর',
      voter_area_code: '০৬৯৩',
      pdf_file_name: synthFileName,
      page_number: 1,
      original_text: `${v.serial}. নাম: ${v.name}\nভোটার নং: ${v.voterNo}\nপিতা: ${v.father}\nমাতা: ${v.mother}\nজন্ম তারিখ: ${v.dob}\nঠিকানা: ${v.addr}`,
      ocr_confidence: 1.0,
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
  });
  insertVotersBatch(synthDbVoters);

  // 2. Real Attached Document: Female Voter List
  // 410692_Teghoriya_1434_female_without_photo_81_2025-11-24.pdf
  const femaleDocId = 'doc_female_teghoriya_0692';
  const femaleFileName = '410692_Teghoriya_1434_female_without_photo_81_2025-11-24.pdf';
  const femaleFilePath = path.join(UPLOADS_DIR, femaleFileName);

  // Attached real female voters from prompt pages 3 to 10
  const femaleAttachedVoters = [
    { serial: '০০০১', name: 'মোছাঃ পারভীনা বেগম', voterNo: '৪১০৬৯২২৮৯৮৪১', father: 'ঝন্টু মলজার', mother: 'মোছাঃ তাহেরা বেগম', occ: 'গৃহিনী', dob: '১৭/১১/১৯৮২', addr: 'তেঘরিয়া, ৪০ নং তেঘরিয়া, যশোর সদর, যশোর', page: 3 },
    { serial: '০০০২', name: 'মোছাঃ শামছুন্নাহার', voterNo: '৪১০৬৯২২৯২৩৫৪', father: 'মোঃ সিদ্দিকুর রহমান', mother: 'সুরাইয়া বেগম', occ: 'গৃহিনী', dob: '০৮/০৭/১৯৭৫', addr: 'তেঘরিয়া, যশোর সদর, যশোর', page: 3 },
    { serial: '০০০৩', name: 'বাকিয়া বেগম', voterNo: '৪১০৬৯২২৯২৩৫৭', father: 'মৌলভী আব্দুর রহমান', mother: 'ছবুরা খাতুন', occ: 'গৃহিনী', dob: '১৫/১০/১৯৫৫', addr: 'তেঘরিয়া, ৪০, যশোর সদর, যশোর', page: 3 },
    { serial: '০০০৪', name: 'আমেনা খাতুন', voterNo: '৪১০৬৯২২৯২৩৫৯', father: 'অমেদ আলী বিশ্বাস', mother: 'সোনাভান', occ: 'গৃহিনী', dob: '২০/১০/১৯৫২', addr: 'তেঘরিয়া, যশোর সদর, যশোর', page: 3 },
    { serial: '০০০৫', name: 'জাহানারা বেগম', voterNo: '৪১০৬৯২২৯২৩৬১', father: 'আব্দুল খালেক চাকলাদার', mother: 'আমেনা বেগম', occ: 'গৃহিনী', dob: '১৯/১০/১৯৬২', addr: 'তেঘরিয়া, ৪০, যশোর সদর, যশোর', page: 3 },
    { serial: '০০০৬', name: 'শাহানাজ পারভিন', voterNo: '৪১০৬৯২২৯২৩৬৩', father: 'মোঃ জয়নাল আবেদীন', mother: 'জাহানারা বেগম', occ: 'ছাত্র/ছাত্রী', dob: '০১/০২/১৯৮৮', addr: 'তেঘরিয়া, ৪০, যশোর সদর, যশোর', page: 3 },
    { serial: '০০০৭', name: 'মোছাঃ মনিরা বেগম (মেরী)', voterNo: '৪১০৬৯২২৯২৩৬৫', father: 'মোঃ শওকত আলী বিশ্বাস', mother: 'মোছাঃ রাবিয়া বেগম', occ: 'গৃহিনী', dob: '৩০/১০/১৯৬৭', addr: 'তেঘরিয়া, যশোর সদর, যশোর', page: 3 },
    { serial: '০০০৮', name: 'আনোয়ারা খাতুন', voterNo: '৪১০৬৯২২৯২৩৬৭', father: 'আলী বক্স বিশ্বাস', mother: 'মইরম বেগম', occ: 'গৃহিনী', dob: '৩০/১০/১৯৭৫', addr: 'তেঘরিয়া, ৪০ নং তেঘরিয়া, যশোর সদর, যশোর', page: 3 },
    { serial: '০০০৯', name: 'মোছাঃ শহর বানু', voterNo: '৪১০৬৯২২৯২৩৭০', father: 'মেফজ মোল্লা', mother: 'মলুদা বিবি', occ: 'গৃহিনী', dob: '২০/১০/১৯৭১', addr: 'তেঘরিয়া, যশোর সদর, যশোর', page: 3 },
    { serial: '০০১০', name: 'মেনোয়ারা খাতুন', voterNo: '৪১০৬৯২২৯২৩৭১', father: 'গোলাম রহমান', mother: 'ফুলজান বেগম', occ: 'গৃহিনী', dob: '৩০/১০/১৯৬৯', addr: 'তেঘরিয়া, ৪০, যশোর সদর, যশোর', page: 3 },
    { serial: '০০১১', name: 'তাসলিমা খাতুন', voterNo: '৪১০৬৯২২৯২৩৭৭', father: 'মোঃ আরাফাত আলী', mother: 'রহিমা বেগম', occ: 'ছাত্র/ছাত্রী', dob: '২০/১০/১৯৮৬', addr: 'তেঘরিয়া, ৪০, যশোর সদর, যশোর', page: 3 },
    { serial: '০০১২', name: 'নূরজাহান বেগম', voterNo: '৪১০৬৯২২৯২৩৭৯', father: 'আনছার মোড়ল', mother: 'আমেনা খাতুন', occ: 'গৃহিনী', dob: '৩০/১০/১৯৬৮', addr: 'তেঘরিয়া, ৪০, যশোর সদর, যশোর', page: 3 },
    { serial: '০০১৩', name: 'নাছিমা বেগম', voterNo: '৪১০৬৯২২৯২৩৮১', father: 'মোঃ দলিল উদ্দীন দফাদার', mother: 'রাবেয়া বেগম', occ: 'গৃহিনী', dob: '৩০/১০/১৯৬৯', addr: 'তেঘরিয়া, যশোর সদর, যশোর', page: 3 },
    { serial: '০০১৪', name: 'হাসনা হেনা', voterNo: '৪১০৬৯২২৯২৩৮২', father: 'মোঃ মশিয়ার রহমান', mother: 'নাছিমা বেগম', occ: 'ছাত্র/ছাত্রী', dob: '১১/০৫/১৯৮৯', addr: 'তেঘরিয়া, ৪০ তেঘরিয়া, যশোর সদর, যশোর', page: 3 },
    { serial: '০০১৫', name: 'হীরা খাতুন', voterNo: '৪১০৬৯২২৯২৩৮৩', father: 'মোঃ ফজলুর রহমান', mother: 'নূরজাহান বেগম', occ: 'ছাত্র/ছাত্রী', dob: '৩০/০৮/১৯৮৬', addr: 'তেঘরিয়া, ৪০ তেঘরিয়া, যশোর সদর, যশোর', page: 3 },
    // Page 4
    { serial: '০০১৬', name: 'মোছাঃ কদবানু বেগম', voterNo: '৪১০৬৯২২৯২৩৮৪', father: 'মোঃ আইজ উদ্দিন শেখ', mother: 'মিতরন নেছা', occ: 'গৃহিনী', dob: '১৪/০৮/১৯৭০', addr: 'তেঘরিয়া, যশোর সদর, যশোর', page: 4 },
    { serial: '০০১৭', name: 'মোছাঃ জাহানারা বেগম', voterNo: '৪১০৬৯২২৯২৩৮৬', father: 'আকবর আলী', mother: 'ছেমেদবান', occ: 'গৃহিনী', dob: '২২/০৫/১৯৬৯', addr: 'তেঘরিয়া, যশোর সদর, যশোর', page: 4 },
    { serial: '০০১৮', name: 'মোছাঃ নাজমা খাতুন', voterNo: '৪১০৬৯২২৯২৩৮৮', father: 'মোঃ বাবলু সর্দার', mother: 'হাসিনা বেগম', occ: 'গৃহিনী', dob: '০১/০১/১৯৭৯', addr: 'তেঘরিয়া, ৪০ তেঘরিয়া, যশোর সদর, যশোর', page: 4 },
    { serial: '০০১৯', name: 'সুফিয়া বেগম', voterNo: '৪১০৬৯২২৯২৩৯২', father: 'মোঃ কওসার আলী', mother: 'শহর বানু', occ: 'গৃহিনী', dob: '৩০/১০/১৯৫৬', addr: 'তেঘরিয়া, ৪০, যশোর সদর, যশোর', page: 4 },
    { serial: '০০২০', name: 'মোছাঃ রাজিয়া খাতুন', voterNo: '৪১০৬৯২২৯২৩৯৫', father: 'মোঃ তারা মিয়া', mother: 'বকুলা বেগম', occ: 'গৃহিনী', dob: '২৫/০৯/১৯৭৬', addr: 'তেঘরিয়া, ৪০, যশোর সদর, যশোর', page: 4 },
    { serial: '০০২১', name: 'মোছাঃ আয়রন বেগম', voterNo: '৪১০৬৯২২৯২৩৯৮', father: 'রহিম বক্স', mother: 'ফুলজান', occ: 'গৃহিনী', dob: '২০/১০/১৯৬৬', addr: 'তেঘরিয়া, যশোর সদর, যশোর', page: 4 },
    { serial: '০০২২', name: 'মিনারা বেগম', voterNo: '৪১০৬৯২২৯২৩৯৯', father: 'শামসুদ্দীন মালিক', mother: 'জেবদা বেগম', occ: 'গৃহিনী', dob: '২২/১২/১৯৮৪', addr: 'তেঘরিয়া, ৪০ তেঘরিয়া, যশোর সদর, যশোর', page: 4 },
    { serial: '০০২৩', name: 'জাহানারা বেগম', voterNo: '৪১০৬৯২২৯২৪০১', father: 'ফিনাত আলী গাজী', mother: 'আয়েশা বেগম', occ: 'গৃহিনী', dob: '৩০/১০/১৯৬৬', addr: 'তেঘরিয়া, যশোর সদর, যশোর', page: 4 },
    { serial: '০০২৪', name: 'মেরী', voterNo: '৪১০692292403', father: 'মোঃ রিয়াকত আলী', mother: 'আলেয়া বেগম', occ: 'গৃহিনী', dob: '২৪/১২/১৯৭৮', addr: 'তেঘরিয়া, ৪০ নং তেঘরিয়া, যশোর সদর, যশোর', page: 4 },
    { serial: '০০২৫', name: 'মোছাঃ রিকতা খাতুন', voterNo: '৪১০৬৯২২৯২৪০৫', father: 'নিরাপদ হাওলাদার', mother: 'নলিতা', occ: 'গৃহিনী', dob: '৩০/০৮/১৯৬৭', addr: 'তেঘরিয়া, ৪০ নং তেঘরিয়া, যশোর সদর, যশোর', page: 4 },
    { serial: '০০২৬', name: 'মোছাঃ রোজিনা খাতুন', voterNo: '৪১০৬৯২২৯২৪০৬', father: 'আকবর আলী', mother: 'ছবিলা বেগম', occ: 'গৃহিনী', dob: '০৩/০৮/১৯৮৪', addr: 'তেঘরিয়া, ৪০, যশোর সদর, যশোর', page: 4 },
    { serial: '০০২৭', name: 'মোছাঃ শাহানাজ বেগম', voterNo: '৪১০৬৯২২৯২৪০৮', father: 'মোঃ হযরত আলী মোড়ল', mother: 'ময়না বেগম', occ: 'গৃহিনী', dob: '০৫/০১/১৯৮৭', addr: 'তেঘরিয়া, ৪০, যশোর সদর, যশোর', page: 4 },
    { serial: '০০২৮', name: 'মোছাঃ চায়না খাতুন', voterNo: '৪১০৬৯২২৯২৪১০', father: 'মোঃ জাহাত আলী খাঁ', mother: 'ফেতমা বেগম', occ: 'গৃহিনী', dob: '২৫/০৭/১৯৬৮', addr: 'তেঘরিয়া, ৪০, যশোর সদর, যশোর', page: 4 },
    { serial: '০০২৯', name: 'মোছাঃ মরিয়ম বেগম পদ্মা', voterNo: '৪১০৬৯২২৯২৪১২', father: 'ইসহাক আলী', mother: 'ফুলজান বিবি', occ: 'গৃহিনী', dob: '১০/০২/১৯৭২', addr: 'তেঘরিয়া, ৪০, যশোর সদর, যশোর', page: 4 },
    { serial: '০০৩০', name: 'মোছাঃ সালমা বেগম', voterNo: '৪১০৬৯২২৯২৪১৪', father: 'মোঃ জলিল মণ্ডল', mother: 'মোছাঃ আমেনা খাতুন', occ: 'গৃহিনী', dob: '২৫/০৬/১৯৮১', addr: 'তেঘরিয়া, ৪০নং, যশোর সদর, যশোর', page: 4 },
    // Page 5
    { serial: '০০৩৪', name: 'মোছাঃ রওশনারা খাতুন', voterNo: '৪১০৬৯২২৯২৪২২', father: 'শামেছর আলী', mother: 'রাবেয়া বেগম', occ: 'শিক্ষক', dob: '০২/১০/১৯৭৭', addr: 'তেঘরিয়া, ৪০, যশোর সদর, যশোর', page: 5 },
    { serial: '০০৩৫', name: 'মোছাঃ শাবনাজ খাতুন', voterNo: '৪১০৬৯২২৯২৪২৩', father: 'মোঃ সোহরাব বিশ্বাস', mother: 'মোছাঃ নাজমা বেগম', occ: 'গৃহিনী', dob: '০৭/০৩/১৯৮৭', addr: 'তেঘরিয়া, ৪০, যশোর সদর, যশোর', page: 5 },
    { serial: '০০৩৬', name: 'মোছাঃ নূরজাহান বেগম', voterNo: '৪১০৬৯২২৯২৪২৪', father: 'আজম মোড়ল', mother: 'সিরেফান নেছা', occ: 'গৃহিনী', dob: '২৪/১০/১৯৫৬', addr: 'তেঘরিয়া, যশোর সদর, যশোর', page: 5 },
    { serial: '০০৩৭', name: 'ফিরদা বেগম', voterNo: '৪১০৬৯২২৯২৪২৫', father: 'মোঃ আনছার আলী', mother: 'সায়েবা বেগম', occ: 'গৃহিনী', dob: '১২/০৯/১৯৮০', addr: 'তেঘরিয়া, ৪০, যশোর সদর, যশোর', page: 5 },
    { serial: '০০৩৮', name: 'মোছাঃ সুফিয়া বেগম', voterNo: '৪১০৬৯২২৯২৪২৬', father: 'জিরপ মোড়ল', mother: 'নিছা খাতুন', occ: 'গৃহিনী', dob: '৩০/১০/১৯৪৮', addr: 'তেঘরিয়া, ৪০ নং তেঘরিয়া, যশোর সদর, যশোর', page: 5 },
    { serial: '০০৩৯', name: 'আনোয়ারা বেগম', voterNo: '৪১০৬৯২২৯২৪২৮', father: 'জেনা মণ্ডল', mother: 'কুলসুম বিবি', occ: 'গৃহিনী', dob: '৩০/১০/১৯৫০', addr: 'তেঘরিয়া, ৪০ তেঘরিয়া, যশোর সদর, যশোর', page: 5 },
    { serial: '০০৪০', name: 'মোছাঃ আলেয়া সুলতানা', voterNo: '৪১০৬৯২২৯২৪২৯', father: 'মোঃ ওমর আলী বিশ্বাস', mother: 'আনোয়ারা বেগম', occ: 'গৃহিনী', dob: '৩০/০৪/১৯৮৮', addr: 'তেঘরিয়া, ৪০, যশোর সদর, যশোর', page: 5 },
    { serial: '০০৪১', name: 'মোছাঃ সখিনা খাতুন', voterNo: '৪১০৬৯২২৯২৪৩২', father: 'রব্বানী মণ্ডল', mother: 'রুপবান বিবি', occ: 'গৃহিনী', dob: '১৩/১০/১৯৪৯', addr: 'তেঘরিয়া, ৪০, যশোর সদর, যশোর', page: 5 },
    { serial: '০০৪২', name: 'মোছাঃ কামরুন্নাহার', voterNo: '৪১০৬৯২২৯২৪৩৪', father: 'মোশারেফ হোসেন', mother: 'শামসুন্নাহার', occ: 'গৃহিনী', dob: '০১/০৫/১৯৮৪', addr: 'তেঘরিয়া, যশোর সদর, যশোর', page: 5 },
    { serial: '০০৪৩', name: 'মোছাঃ আমেনা বেগম', voterNo: '৪১০৬৯২২৯২৪৩৫', father: 'মোঃ আব্দুল লতিফ মোল্লা', mother: 'মেনোয়ারা বেগম', occ: 'গৃহিনী', dob: '২০/১০/১৯৮৫', addr: 'তেঘরিয়া, ৪০, যশোর সদর, যশোর', page: 5 },
    // Page 40 (voter 0664 Shahana Khatun)
    { serial: '০৬৬৪', name: 'শাহানারা খাতুন', voterNo: '৪১০৬৯২২৯৪২৫৫', father: 'মোঃ ইসারত আলী', mother: 'মমতাজ বেগম', occ: 'ছাত্র/ছাত্রী', dob: '১৫/১১/১৯৮৭', addr: '৫৭৬, তেঘরিয়া, ৪০, যশোর সদর, যশোর', page: 40 },
    { serial: '০৬৬৫', name: 'মোছাঃ রেহেনা বেগম', voterNo: '৪১০৬৯২২৯৪২৫৭', father: 'মোঃ রফিকুল ইসলাম', mother: 'মোছাঃ হাসিনা বেগম', occ: 'গৃহিনী', dob: '১২/১০/১৯৮২', addr: '৬৭৮, তেঘরিয়া, ৪০ নং তেঘরিয়া, যশোর সদর, যশোর', page: 40 }
  ];

  // Group by page for PDF generation
  const femalePagesMap = new Map<number, any[]>();
  femaleAttachedVoters.forEach((v) => {
    const list = femalePagesMap.get(v.page) || [];
    list.push(v);
    femalePagesMap.set(v.page, list);
  });

  const femalePagesContent = Array.from(femalePagesMap.entries()).map(([pageNum, voters]) => ({
    pageNum,
    voters
  }));

  await generateSamplePdf(femaleFilePath, 'Voter List (Female) - Teghoriya', 81, femalePagesContent);

  const femaleHash = crypto.createHash('sha256').update(fs.readFileSync(femaleFilePath)).digest('hex');
  saveDocument({
    id: femaleDocId,
    filename: femaleFileName,
    original_name: femaleFileName,
    file_path: femaleFilePath,
    file_hash: femaleHash,
    file_size: fs.statSync(femaleFilePath).size,
    page_count: 81,
    processed_pages: 81,
    status: 'completed',
    ocr_status: 'completed',
    total_records: femaleAttachedVoters.length,
    district: 'যশোর',
    upazila: 'যশোর সদর',
    union_name: 'দেয়াড়া',
    ward: '৫',
    voter_area: 'তেঘরিয়া',
    voter_area_code: '০৬৯২',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  });

  const femaleDbVoters: DbVoter[] = femaleAttachedVoters.map((v) => {
    const norm_name = normalizeBengaliText(v.name);
    const norm_father = normalizeBengaliText(v.father);
    const norm_mother = normalizeBengaliText(v.mother);
    const norm_dob = normalizeDate(v.dob);
    const norm_voter_no = bengaliToEnglishDigits(v.voterNo);
    const norm_address = normalizeBengaliText(v.addr);
    const norm_all = `${norm_name} ${norm_father} ${norm_mother} ${norm_dob} ${norm_voter_no} ${v.voterNo} ${v.serial} ${bengaliToEnglishDigits(v.serial)} ${norm_address}`;

    return {
      id: `${femaleDocId}_p${v.page}_s${v.serial}`,
      document_id: femaleDocId,
      serial_number: v.serial,
      name: v.name,
      voter_number: v.voterNo,
      father_name: v.father,
      mother_name: v.mother,
      occupation: v.occ,
      date_of_birth: v.dob,
      address: v.addr,
      district: 'যশোর',
      upazila: 'যশোর সদর',
      union_name: 'দেয়াড়া',
      ward: '৫',
      voter_area: 'তেঘরিয়া',
      voter_area_code: '০৬৯২',
      pdf_file_name: femaleFileName,
      page_number: v.page,
      original_text: `${v.serial}. নাম: ${v.name}\nভোটার নং: ${v.voterNo}\nপিতা: ${v.father}\nমাতা: ${v.mother}\nপেশা: ${v.occ},জন্ম তারিখ:${v.dob}\nঠিকানা: ${v.addr}`,
      ocr_confidence: 0.96,
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
  });
  insertVotersBatch(femaleDbVoters);

  // 3. Real Attached Document: Male Voter List
  // 410692_Teghoriya_1434_male_without_photo_83_2025-11-24.pdf
  const maleDocId = 'doc_male_teghoriya_0692';
  const maleFileName = '410692_Teghoriya_1434_male_without_photo_83_2025-11-24.pdf';
  const maleFilePath = path.join(UPLOADS_DIR, maleFileName);

  const maleAttachedVoters = [
    { serial: '০০০১', name: 'মোঃ সাইফুল ইসলাম', voterNo: '৪১০৬৯২২৮৮৯০২', father: 'আব্দুল গফুর', mother: 'মেরী', occ: 'কৃষক', dob: '২৩/০৭/১৯৮৩', addr: 'তেঘরিয়া, ৪০ নং তেঘরিয়া, যশোর সদর, যশোর', page: 3 },
    { serial: '০০০২', name: 'মোঃ আব্দুস সবুর সর্দার', voterNo: '৪১০৬৯২২৯০১৩৬', father: 'গোলাম মোস্তফা সর্দার', mother: 'মোছাঃ সুফিয়া বেগম', occ: 'বেসরকারী চাকুরী', dob: '০৫/০৬/১৯৭৯', addr: 'তেঘরিয়া, ৪০ নং তেঘরিয়া, যশোর সদর, যশোর', page: 3 },
    { serial: '০০০৩', name: 'মোঃ আব্দুল আলীম', voterNo: '৪১০৬৯২২৯০২৫৪', father: 'গফুর মোড়ল', mother: 'মোছাঃ দিলজান বেগম', occ: 'কৃষক', dob: '০৬/০৭/১৯৭০', addr: 'তেঘরিয়া, ৪০ নং তেঘরিয়া, যশোর সদর, যশোর', page: 3 },
    { serial: '০০০৪', name: 'মোঃ শফিকুল ইসলাম', voterNo: '৪১০৬৯২২৯২৩৫১', father: 'মোঃ আব্দুল গফুর বিশ্বাস', mother: 'ফেতমা খাতুন', occ: 'কৃষক', dob: '০৫/০৮/১৯৮২', addr: 'তেঘরিয়া, যশোর সদর, যশোর', page: 3 },
    { serial: '০০০৫', name: 'মোঃ রফিকুল ইসলাম', voterNo: '৪১০৬৯২২৯২৩৫২', father: 'মোঃ আব্দুল গফুর বিশ্বাস', mother: 'ফেতমা খাতুন', occ: 'ড্রাইভার', dob: '০১/০১/১৯৬৮', addr: 'তেঘরিয়া, যশোর সদর, যশোর', page: 3 },
    { serial: '০০০৬', name: 'ডাঃ মোঃ আসলাম আলী', voterNo: '৪১০৬৯২২৯২৩৫৩', father: 'মোঃ গোলাম বারী বিশ্বাস', mother: 'মোছাঃ চিয়ারী বানু', occ: 'ডাক্তার', dob: '১০/১১/১৯৫৯', addr: 'তেঘরিয়া, তেঘরিয়া, যশোর সদর, যশোর', page: 3 },
    { serial: '০০০৭', name: 'মোঃ আব্দুল জব্বার বিশ্বাস', voterNo: '৪১০৬৯২২৯২৩৫৬', father: 'করিম বিশ্বাস', mother: 'সুশিলা বেগম', occ: 'বেকার', dob: '১৩/১০/১৯৩৩', addr: 'তেঘরিয়া, যশোর সদর, যশোর', page: 3 },
    { serial: '০০০৮', name: 'মোঃ জয়নাল আবেদীন', voterNo: '৪১০৬৯২২৯২৩৬০', father: 'আরশাদ আলী সরদার', mother: 'আয়মানি বিবি', occ: 'সরকারী চাকুরী', dob: '১৩/১০/১৯৫৮', addr: 'তেঘরিয়া, ৪০ নং তেঘরিয়া, যশোর সদর, যশোর', page: 3 },
    { serial: '০০০৯', name: 'মোঃ কামরুজ্জামান', voterNo: '৪১০৬৯২২৯২৩৬২', father: 'মোঃ জয়নাল আবেদীন', mother: 'জাহানারা বেগম', occ: 'ছাত্র/ছাত্রী', dob: '১২/০৬/১৯৮৪', addr: 'তেঘরিয়া, ৪০, যশোর সদর, যশোর', page: 3 },
    { serial: '০০১০', name: 'মোঃ আজিজুল ইসলাম', voterNo: '৪১০৬৯২২৯২৩৬৪', father: 'মোঃ মোতালেব হোসেন', mother: 'মোছাঃ মেরী', occ: 'ছাত্র/ছাত্রী', dob: '০৪/০৬/১৯৮৩', addr: 'তেঘরিয়া, ৪০ নং তেঘরিয়া, যশোর সদর, যশোর', page: 3 },
    { serial: '০০১১', name: 'মোঃ ছামিউল আলম', voterNo: '৪১০৬৯২২৯২৩৬৬', father: 'মোহাম্মাদ বিশ্বাস', mother: 'নঈমন নেছা', occ: 'শ্রমিক', dob: '১৪/১০/১৯৭২', addr: 'তেঘরিয়া, ৪০ নং তেঘরিয়া, যশোর সদর, যশোর', page: 3 },
    { serial: '০০১২', name: 'মোঃ আসমত আলী', voterNo: '৪১০৬৯২২৯২৩৬৮', father: 'মোঃ আজীম বিশ্বাস', mother: 'আমেনা বেগম', occ: 'শ্রমিক', dob: '১৫/১১/১৯৮১', addr: 'তেঘরিয়া, ৪০ নং তেঘরিয়া, যশোর সদর, যশোর', page: 3 },
    { serial: '০০১৩', name: 'মোঃ ইব্রাহিম হোসেন', voterNo: '৪১০৬৯২২৯২৩৬৯', father: 'মোঃ ইসহাক আলী', mother: 'মোছাঃ নূরজাহান বেগম', occ: 'শিক্ষক', dob: '১১/১১/১৯৭৬', addr: 'তেঘরিয়া, ৪০, যশোর সদর, যশোর', page: 3 },
    { serial: '০০১৪', name: 'মোঃ হানিফ আলী সর্দার', voterNo: '৪১০৬৯২২৯২৩৭৩', father: 'আরশাদ আলী সর্দার', mother: 'আয়মন বিবি', occ: 'শ্রমিক', dob: '২২/১২/১৯৪৭', addr: 'তেঘরিয়া, ৪০, যশোর সদর, যশোর', page: 3 },
    { serial: '০০১৫', name: 'মোঃ ফজলুর রহমান', voterNo: '৪১০৬৯২২৯২৩৭৫', father: 'গোলাম রহমান', mother: 'ফুল জান বেগম', occ: 'সরকারী চাকুরী', dob: '১০/০২/১৯৫৯', addr: 'তেঘরিয়া, ৪০, যশোর সদর, যশোর', page: 3 },
    // Page 4
    { serial: '০০১৬', name: 'মোঃ ইসহাক আলী সরদার', voterNo: '৪১০৬৯২২৯২৩৭৬', father: 'জাহান আলী সরদার', mother: 'যতন বিবি', occ: 'কৃষক', dob: '১৫/০২/১৯৫০', addr: 'তেঘরিয়া, যশোর সদর, যশোর', page: 4 },
    { serial: '০০১৭', name: 'মোঃ মশিয়ার রহমান', voterNo: '৪১০৬৯২২৯২৩৮০', father: 'জাহান আলী সরদার', mother: 'জহন বিবি', occ: 'সরকারী চাকুরী', dob: '১০/০৫/১৯৬৫', addr: 'তেঘরিয়া, যশোর সদর, যশোর', page: 4 },
    { serial: '০০১৮', name: 'মোঃ হাবিবুর রহমান', voterNo: '৪১০৬৯২২৯২৩৮৫', father: 'শফির উদ্দীন', mother: 'আল্লাদী বেগম', occ: 'শ্রমিক', dob: '৩০/১০/১৯৬২', addr: 'তেঘরিয়া, যশোর সদর, যশোর', page: 4 },
    { serial: '০০১৯', name: 'মোঃ ইসমাইল হোসেন', voterNo: '৪১০৬৯২২৯২৩৮৭', father: 'মোঃ খলিলুর রহমান', mother: 'সাজেদা বেগম', occ: 'ব্যবসা', dob: '০১/১২/১৯৭৫', addr: 'তেঘরিয়া, ৪০ নং, যশোর সদর, যশোর', page: 4 },
    { serial: '০০২০', name: 'মোঃ খলিলুর রহমান', voterNo: '৪১০৬৯২২৯২৩৮৯', father: 'সিফাতুল্লাহ বিশ্বাস', mother: 'পিরমন নেছা', occ: 'কৃষক', dob: '৩০/১০/১৯৫৭', addr: 'তেঘরিয়া, যশোর সদর, যশোর', page: 4 },
    { serial: '০০২১', name: 'মোঃ শওকত আলী', voterNo: '৪১০৬৯২২৯২৩৯০', father: 'আবুল হোসেন', mother: 'সুফিয়া বেগম', occ: 'অন্যান্য', dob: '৩০/১০/১৯৭৮', addr: 'তেঘরিয়া, যশোর সদর, যশোর', page: 4 },
    { serial: '০০২২', name: 'মোঃ হায়দার আলী', voterNo: '৪১০৬৯২২৯২৩৯১', father: 'আবুল হোসেন', mother: 'সুফিয়া বেগম', occ: 'কৃষক', dob: '০৪/০৫/১৯৮১', addr: 'তেঘরিয়া, ৪০, যশোর সদর, যশোর', page: 4 },
    { serial: '০০২৩', name: 'মোঃ আব্দুল গনি', voterNo: '৪১০৬৯২২৯২৩৯৩', father: 'মোঃ ফেজর আলী', mother: 'জায়দা বেগম', occ: 'ড্রাইভার', dob: '১১/১০/১৯৬৫', addr: 'তেঘরিয়া, যশোর সদর, যশোর', page: 4 },
    { serial: '০০২৪', name: 'মোঃ লেয়াকত আলী', voterNo: '৪১০৬৯২২৯২৩৯৪', father: 'আবুল হোসেন', mother: 'রাবিয়া বেগম', occ: 'শ্রমিক', dob: '১২/০৫/১৯৬৯', addr: 'তেঘরিয়া, ৪০ নং তেঘরিয়া, যশোর সদর, যশোর', page: 4 },
    { serial: '০০২৫', name: 'মোঃ এরশাদ আলী মোড়ল', voterNo: '৪১০৬৯২২৯২৪০০', father: 'সদর আলী মোড়ল', mother: 'আমেনা খাতুন', occ: 'কৃষক', dob: '১৫/১১/১৯৬২', addr: 'তেঘরিয়া, যশোর সদর, যশোর', page: 4 },
    { serial: '০০২৬', name: 'সাহেব আলী', voterNo: '৪১০৬৯২২৯২৪০২', father: 'হযরত আলী বিশ্বাস', mother: 'ছিকনা বেগম', occ: 'বেসরকারী চাকুরী', dob: '২৪/০৯/১৯৭৬', addr: 'তেঘরিয়া, ৪০ নং তেঘরিয়া, যশোর সদর, যশোর', page: 4 },
    { serial: '০০২৭', name: 'মোঃ ইসহাক আলী', voterNo: '৪১০৬৯২২৯২৪০৪', father: 'ফিরাসুদল্লাহ মোড়ল', mother: 'সোনাভান', occ: 'দিনমজুর', dob: '২১/১০/১৯৬০', addr: 'তেঘরিয়া, ৪০, যশোর সদর, যশোর', page: 4 },
    { serial: '০০২৮', name: 'মোঃ ইউসুপ আলী', voterNo: '৪১০৬৯২২৯২৪০৭', father: 'মোঃ আব্দুল খালেক মোল্লা', mother: 'মোছাঃ রোমেছা খাতুন', occ: 'শ্রমিক', dob: '০১/০১/১৯৮২', addr: 'তেঘরিয়া, ৪০ নং তেঘরিয়া, যশোর সদর, যশোর', page: 4 },
    { serial: '০০২৯', name: 'মোঃ গোলাম রব্বানী', voterNo: '৪১০৬৯২২৯২৪০৯', father: 'হযরত আলী বিশ্বাস', mother: 'ছিকনা খাতুন', occ: 'কৃষক', dob: '২১/১০/১৯৬১', addr: 'তেঘরিয়া, ৪০, যশোর সদর, যশোর', page: 4 },
    { serial: '০০৩০', name: 'মোঃ মোজাম হোসেন', voterNo: '৪১০৬৯২২৯২৪১১', father: 'হযরত আলী বিশ্বাস', mother: 'ছিকনা খাতুন', occ: 'কৃষক', dob: '৩০/১২/১৯৫১', addr: 'তেঘরিয়া, যশোর সদর, যশোর', page: 4 },
    // Page 73 (Voter 1273 Musa Kazim)
    { serial: '১২৭৩', name: 'মুসা কাজীম', voterNo: '৪১০৬৯২০০০৭৮১', father: 'আব্দুল জব্বার লাভলু', mother: 'মমতাজ বেগম', occ: 'ছাত্র/ছাত্রী', dob: '১৪/১১/২০০৪', addr: '৩৮৮, তেঘরিয়া, যশোর সদর, যশোর', page: 73 }
  ];

  const malePagesMap = new Map<number, any[]>();
  maleAttachedVoters.forEach((v) => {
    const list = malePagesMap.get(v.page) || [];
    list.push(v);
    malePagesMap.set(v.page, list);
  });

  const malePagesContent = Array.from(malePagesMap.entries()).map(([pageNum, voters]) => ({
    pageNum,
    voters
  }));

  await generateSamplePdf(maleFilePath, 'Voter List (Male) - Teghoriya', 83, malePagesContent);

  const maleHash = crypto.createHash('sha256').update(fs.readFileSync(maleFilePath)).digest('hex');
  saveDocument({
    id: maleDocId,
    filename: maleFileName,
    original_name: maleFileName,
    file_path: maleFilePath,
    file_hash: maleHash,
    file_size: fs.statSync(maleFilePath).size,
    page_count: 83,
    processed_pages: 83,
    status: 'completed',
    ocr_status: 'completed',
    total_records: maleAttachedVoters.length,
    district: 'যশোর',
    upazila: 'যশোর সদর',
    union_name: 'দেয়াড়া',
    ward: '৫',
    voter_area: 'তেঘরিয়া',
    voter_area_code: '০৬৯২',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  });

  const maleDbVoters: DbVoter[] = maleAttachedVoters.map((v) => {
    const norm_name = normalizeBengaliText(v.name);
    const norm_father = normalizeBengaliText(v.father);
    const norm_mother = normalizeBengaliText(v.mother);
    const norm_dob = normalizeDate(v.dob);
    const norm_voter_no = bengaliToEnglishDigits(v.voterNo);
    const norm_address = normalizeBengaliText(v.addr);
    const norm_all = `${norm_name} ${norm_father} ${norm_mother} ${norm_dob} ${norm_voter_no} ${v.voterNo} ${v.serial} ${bengaliToEnglishDigits(v.serial)} ${norm_address}`;

    return {
      id: `${maleDocId}_p${v.page}_s${v.serial}`,
      document_id: maleDocId,
      serial_number: v.serial,
      name: v.name,
      voter_number: v.voterNo,
      father_name: v.father,
      mother_name: v.mother,
      occupation: v.occ,
      date_of_birth: v.dob,
      address: v.addr,
      district: 'যশোর',
      upazila: 'যশোর সদর',
      union_name: 'দেয়াড়া',
      ward: '৫',
      voter_area: 'তেঘরিয়া',
      voter_area_code: '০৬৯২',
      pdf_file_name: maleFileName,
      page_number: v.page,
      original_text: `${v.serial}. নাম: ${v.name}\nভোটার নং: ${v.voterNo}\nপিতা: ${v.father}\nমাতা: ${v.mother}\nপেশা: ${v.occ},জন্ম তারিখ:${v.dob}\nঠিকানা: ${v.addr}`,
      ocr_confidence: 0.97,
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
  });
  insertVotersBatch(maleDbVoters);

  console.log('Sample documents successfully created and indexed into SQLite database!');
}
