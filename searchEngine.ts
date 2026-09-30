import { db, DbVoter } from './db.ts';
import { normalizeBengaliText, normalizeDate, bengaliToEnglishDigits, isFuzzyMatch } from './bengaliNormalizer.ts';

export interface SearchParams {
  name?: string;
  fatherName?: string;
  motherName?: string;
  dateOfBirth?: string;
  voterNumber?: string;
  query?: string; // all fields
  searchMode?: 'exact' | 'partial' | 'fuzzy';
  page?: number;
  limit?: number;
  documentId?: string;
  upazila?: string;
  union?: string;
  village?: string;
}

export interface SearchResultItem {
  id: string;
  documentId: string;
  serialNumber: string;
  name: string;
  voterNumber: string;
  fatherName: string;
  motherName: string;
  occupation: string;
  dateOfBirth: string;
  address: string;
  district: string;
  upazila: string;
  unionName: string;
  ward: string;
  voterArea: string;
  voterAreaCode: string;
  pdfFileName: string;
  pageNumber: number;
  originalText?: string;
  ocrConfidence: number;
  boundingBoxes?: string;
  matchedFields: string[];
}

export function searchVoters(params: SearchParams): {
  total: number;
  page: number;
  limit: number;
  totalPages: number;
  results: SearchResultItem[];
  executionTimeMs: number;
} {
  const startTime = Date.now();
  const mode = params.searchMode || 'partial';
  const page = Math.max(1, Number(params.page || 1));
  const limit = Math.max(1, Math.min(100, Number(params.limit || 20)));
  const offset = (page - 1) * limit;

  // Normalized inputs
  const normName = params.name ? normalizeBengaliText(params.name) : '';
  const normFather = params.fatherName ? normalizeBengaliText(params.fatherName) : '';
  const normMother = params.motherName ? normalizeBengaliText(params.motherName) : '';
  const normDob = params.dateOfBirth ? normalizeDate(params.dateOfBirth) : '';
  const normVoterNo = params.voterNumber ? bengaliToEnglishDigits(params.voterNumber.trim()) : '';
  const normQuery = params.query ? normalizeBengaliText(params.query) : '';

  // Check if at least one search field is provided
  const hasCriteria = Boolean(
    normName || normFather || normMother || normDob || normVoterNo || normQuery ||
    params.documentId || params.upazila || params.union || params.village
  );
  if (!hasCriteria) {
    // If no search criteria, return recent records
    const countRow = db.prepare('SELECT COUNT(*) as count FROM voters').get() as { count: number };
    const total = countRow.count;
    const rows = db.prepare(`
      SELECT * FROM voters
      ORDER BY page_number ASC, serial_number ASC
      LIMIT ? OFFSET ?
    `).all(limit, offset) as unknown as DbVoter[];

    return {
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
      results: rows.map(r => formatVoterResult(r, [])),
      executionTimeMs: Date.now() - startTime
    };
  }

  // Handle Fuzzy mode in application layer or hybrid
  if (mode === 'fuzzy') {
    return executeFuzzySearch(params, page, limit, startTime);
  }

  // Exact or Partial mode using SQL & indexes
  const whereClauses: string[] = [];
  const sqlParams: (string | number)[] = [];

  if (params.documentId) {
    whereClauses.push('document_id = ?');
    sqlParams.push(params.documentId);
  }

  if (params.upazila) {
    whereClauses.push('upazila LIKE ?');
    sqlParams.push(`%${params.upazila.trim()}%`);
  }

  if (params.union) {
    whereClauses.push('union_name LIKE ?');
    sqlParams.push(`%${params.union.trim()}%`);
  }

  if (params.village) {
    whereClauses.push('(voter_area LIKE ? OR address LIKE ?)');
    sqlParams.push(`%${params.village.trim()}%`, `%${params.village.trim()}%`);
  }

  if (normName) {
    if (mode === 'exact') {
      whereClauses.push('(norm_name = ? OR norm_name LIKE ? OR norm_name LIKE ?)');
      sqlParams.push(normName, `${normName} %`, `% ${normName}`);
    } else {
      whereClauses.push('norm_name LIKE ?');
      sqlParams.push(`%${normName}%`);
    }
  }

  if (normFather) {
    if (mode === 'exact') {
      whereClauses.push('(norm_father = ? OR norm_father LIKE ? OR norm_father LIKE ?)');
      sqlParams.push(normFather, `${normFather} %`, `% ${normFather}`);
    } else {
      whereClauses.push('norm_father LIKE ?');
      sqlParams.push(`%${normFather}%`);
    }
  }

  if (normMother) {
    if (mode === 'exact') {
      whereClauses.push('(norm_mother = ? OR norm_mother LIKE ? OR norm_mother LIKE ?)');
      sqlParams.push(normMother, `${normMother} %`, `% ${normMother}`);
    } else {
      whereClauses.push('norm_mother LIKE ?');
      sqlParams.push(`%${normMother}%`);
    }
  }

  if (normDob) {
    // Allows matching exact DOB or partial e.g. year "1993" or "01/05/1993"
    whereClauses.push('norm_dob LIKE ?');
    sqlParams.push(`%${normDob}%`);
  }

  if (normVoterNo) {
    whereClauses.push('norm_voter_no LIKE ?');
    sqlParams.push(`%${normVoterNo}%`);
  }

  if (normQuery) {
    // Global search across all indexed terms
    whereClauses.push('(norm_all LIKE ? OR norm_voter_no LIKE ?)');
    sqlParams.push(`%${normQuery}%`, `%${normQuery}%`);
  }

  const whereSql = whereClauses.length > 0 ? `WHERE ${whereClauses.join(' AND ')}` : '';

  // Get total matching count
  const countStmt = db.prepare(`SELECT COUNT(*) as count FROM voters ${whereSql}`);
  const countRow = countStmt.get(...sqlParams) as { count: number };
  const total = countRow.count;

  // Get page results
  const queryStmt = db.prepare(`
    SELECT * FROM voters
    ${whereSql}
    ORDER BY page_number ASC, serial_number ASC
    LIMIT ? OFFSET ?
  `);

  const rows = queryStmt.all(...sqlParams, limit, offset) as unknown as DbVoter[];

  const results = rows.map((row) => {
    const matchedFields = detectMatchedFields(row, {
      normName, normFather, normMother, normDob, normVoterNo, normQuery
    });
    return formatVoterResult(row, matchedFields);
  });

  return {
    total,
    page,
    limit,
    totalPages: Math.ceil(total / limit),
    results,
    executionTimeMs: Date.now() - startTime
  };
}

/**
 * Fuzzy search across voter records with edit-distance tolerance
 */
function executeFuzzySearch(
  params: SearchParams,
  page: number,
  limit: number,
  startTime: number
) {
  const normName = params.name ? normalizeBengaliText(params.name) : '';
  const normFather = params.fatherName ? normalizeBengaliText(params.fatherName) : '';
  const normMother = params.motherName ? normalizeBengaliText(params.motherName) : '';
  const normDob = params.dateOfBirth ? normalizeDate(params.dateOfBirth) : '';
  const normVoterNo = params.voterNumber ? bengaliToEnglishDigits(params.voterNumber.trim()) : '';
  const normQuery = params.query ? normalizeBengaliText(params.query) : '';

  // Step 1: Pre-filter candidate records from database using lenient prefix/trigram/length
  // so we don't scan unnecessarily
  const candidateClauses: string[] = [];
  const candidateParams: string[] = [];

  if (params.documentId) {
    candidateClauses.push('document_id = ?');
    candidateParams.push(params.documentId);
  }

  // Pre-filter with first 2 characters or vowels if available
  if (normName.length >= 2) {
    candidateClauses.push('norm_name LIKE ?');
    candidateParams.push(`%${normName.slice(0, 2)}%`);
  }
  if (normFather.length >= 2) {
    candidateClauses.push('norm_father LIKE ?');
    candidateParams.push(`%${normFather.slice(0, 2)}%`);
  }
  if (normMother.length >= 2) {
    candidateClauses.push('norm_mother LIKE ?');
    candidateParams.push(`%${normMother.slice(0, 2)}%`);
  }
  if (normDob) {
    candidateClauses.push('norm_dob LIKE ?');
    candidateParams.push(`%${normDob.slice(0, 4)}%`);
  }
  if (normQuery.length >= 2) {
    candidateClauses.push('norm_all LIKE ?');
    candidateParams.push(`%${normQuery.slice(0, 2)}%`);
  }

  let rows: DbVoter[];
  if (candidateClauses.length > 0) {
    const whereSql = `WHERE ${candidateClauses.join(' OR ')}`;
    const stmt = db.prepare(`SELECT * FROM voters ${whereSql} LIMIT 5000`);
    rows = stmt.all(...candidateParams) as unknown as DbVoter[];
  } else {
    rows = db.prepare('SELECT * FROM voters LIMIT 3000').all() as unknown as DbVoter[];
  }

  // Filter with isFuzzyMatch
  const matchingRows: { voter: DbVoter; matchedFields: string[] }[] = [];

  for (const r of rows) {
    let matches = true;
    const matchedFields: string[] = [];

    if (normName) {
      if (isFuzzyMatch(r.norm_name, normName, 2)) {
        matchedFields.push('name');
      } else {
        matches = false;
      }
    }

    if (normFather) {
      if (isFuzzyMatch(r.norm_father, normFather, 2)) {
        matchedFields.push('fatherName');
      } else {
        matches = false;
      }
    }

    if (normMother) {
      if (isFuzzyMatch(r.norm_mother, normMother, 2)) {
        matchedFields.push('motherName');
      } else {
        matches = false;
      }
    }

    if (normDob) {
      if (r.norm_dob.includes(normDob) || normDob.includes(r.norm_dob)) {
        matchedFields.push('dateOfBirth');
      } else {
        matches = false;
      }
    }

    if (normVoterNo) {
      if (r.norm_voter_no.includes(normVoterNo)) {
        matchedFields.push('voterNumber');
      } else {
        matches = false;
      }
    }

    if (params.upazila && (!r.upazila || !r.upazila.includes(params.upazila.trim()))) {
      matches = false;
    }

    if (params.union && (!r.union_name || !r.union_name.includes(params.union.trim()))) {
      matches = false;
    }

    if (params.village && (!r.voter_area?.includes(params.village.trim()) && !r.address?.includes(params.village.trim()))) {
      matches = false;
    }

    if (normQuery) {
      if (isFuzzyMatch(r.norm_all, normQuery, 2) || r.norm_voter_no.includes(normQuery)) {
        matchedFields.push('all');
      } else if (!normName && !normFather && !normMother) {
        matches = false;
      }
    }

    if (matches && matchedFields.length > 0) {
      matchingRows.push({ voter: r, matchedFields });
    }
  }

  const total = matchingRows.length;
  const offset = (page - 1) * limit;
  const paginated = matchingRows.slice(offset, offset + limit);

  return {
    total,
    page,
    limit,
    totalPages: Math.ceil(total / limit),
    results: paginated.map(p => formatVoterResult(p.voter, p.matchedFields)),
    executionTimeMs: Date.now() - startTime
  };
}

/**
 * Find related family records sharing the same father and mother
 */
export function getRelatedFamilyRecords(fatherName: string, motherName: string, excludeId?: string): SearchResultItem[] {
  if (!fatherName || !motherName) return [];

  const normFather = normalizeBengaliText(fatherName);
  const normMother = normalizeBengaliText(motherName);

  if (normFather.length < 2 || normMother.length < 2) return [];

  const stmt = db.prepare(`
    SELECT * FROM voters
    WHERE norm_father LIKE ? AND norm_mother LIKE ? AND id != ?
    ORDER BY date_of_birth ASC, serial_number ASC
    LIMIT 50
  `);

  const rows = stmt.all(`%${normFather}%`, `%${normMother}%`, excludeId || '') as unknown as DbVoter[];
  return rows.map(r => formatVoterResult(r, ['fatherName', 'motherName']));
}

function detectMatchedFields(
  row: DbVoter,
  queries: { normName: string; normFather: string; normMother: string; normDob: string; normVoterNo: string; normQuery: string }
): string[] {
  const fields: string[] = [];

  if (queries.normName && row.norm_name.includes(queries.normName)) fields.push('name');
  if (queries.normFather && row.norm_father.includes(queries.normFather)) fields.push('fatherName');
  if (queries.normMother && row.norm_mother.includes(queries.normMother)) fields.push('motherName');
  if (queries.normDob && row.norm_dob.includes(queries.normDob)) fields.push('dateOfBirth');
  if (queries.normVoterNo && row.norm_voter_no.includes(queries.normVoterNo)) fields.push('voterNumber');

  if (queries.normQuery) {
    if (row.norm_name.includes(queries.normQuery)) fields.push('name');
    if (row.norm_father.includes(queries.normQuery)) fields.push('fatherName');
    if (row.norm_mother.includes(queries.normQuery)) fields.push('motherName');
    if (row.norm_address.includes(queries.normQuery)) fields.push('address');
    if (row.norm_voter_no.includes(queries.normQuery)) fields.push('voterNumber');
  }

  return [...new Set(fields)];
}

function formatVoterResult(v: DbVoter, matchedFields: string[]): SearchResultItem {
  return {
    id: v.id,
    documentId: v.document_id,
    serialNumber: v.serial_number,
    name: v.name,
    voterNumber: v.voter_number,
    fatherName: v.father_name,
    motherName: v.mother_name,
    occupation: v.occupation,
    dateOfBirth: v.date_of_birth,
    address: v.address,
    district: v.district,
    upazila: v.upazila,
    unionName: v.union_name,
    ward: v.ward,
    voterArea: v.voter_area,
    voterAreaCode: v.voter_area_code,
    pdfFileName: v.pdf_file_name,
    pageNumber: v.page_number,
    originalText: v.original_text,
    ocrConfidence: v.ocr_confidence,
    boundingBoxes: v.bounding_boxes,
    matchedFields
  };
}
