import { MAX_OPTIONS } from "./columns";

export type RowError = {
  row_number: number;
  field_name: string | null;
  error_code: string;
  error_message: string;
  raw_value: string;
};

export type PreparedOption = { text: string; is_correct: boolean; display_order: number };

export type PreparedRow = {
  row_number: number;
  question_text: string;
  options: PreparedOption[];
  difficulty: "easy" | "medium" | "hard";
  score: number;
  category_id: string | null;
  subject_id: string | null;
  organization_id: string | null;
  /** نام سازمان برای نمایش در پیش‌نمایش */
  organization_name: string | null;
  explanation: string | null;
  image_url: string | null;
  external_id: string | null;
  /** توسط اعتبارسنجی سمت سرور پر می‌شود */
  is_duplicate?: boolean;
};

export type ValidationResult = {
  valid: PreparedRow[];
  errors: RowError[];
  /** سطرهای تکراری داخل خود فایل */
  internalDuplicates: number;
};

export type NamedOption = { id: string; name: string };

export type ValidateInput = {
  rows: Record<string, string>[];
  /** کلید ستون استاندارد → نام سرستون فایل */
  mapping: Record<string, string>;
  categories: NamedOption[];
  subjects: NamedOption[];
  organizations: NamedOption[];
  defaultCategoryId: string;
  defaultSubjectId: string;
  defaultOrganizationId?: string;
};

const DIFFICULTY_MAP: Record<string, "easy" | "medium" | "hard"> = {
  easy: "easy",
  medium: "medium",
  hard: "hard",
  آسان: "easy",
  متوسط: "medium",
  سخت: "hard",
  دشوار: "hard",
};

const FA_DIGITS = /[۰-۹٠-٩]/g;

function toEnglishDigits(value: string) {
  return value.replace(FA_DIGITS, (d) => {
    const fa = "۰۱۲۳۴۵۶۷۸۹".indexOf(d);
    if (fa >= 0) return String(fa);
    return String("٠١٢٣٤٥٦٧٨٩".indexOf(d));
  });
}

function normalizeKey(value: string) {
  return value
    .replace(/ي/g, "ی")
    .replace(/ك/g, "ک")
    .replace(/\u200c/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

/** اعتبارسنجی و آماده‌سازی سطرها پیش از ارسال به سرور */
export function validateRows(input: ValidateInput): ValidationResult {
  const {
    rows,
    mapping,
    categories,
    subjects,
    organizations,
    defaultCategoryId,
    defaultSubjectId,
    defaultOrganizationId = "",
  } = input;
  const valid: PreparedRow[] = [];
  const errors: RowError[] = [];
  const seen = new Set<string>();
  let internalDuplicates = 0;

  const categoryByName = new Map(categories.map((c) => [normalizeKey(c.name), c.id]));
  const subjectByName = new Map(subjects.map((s) => [normalizeKey(s.name), s.id]));
  const organizationByName = new Map(organizations.map((o) => [normalizeKey(o.name), o.id]));
  const organizationById = new Map(organizations.map((o) => [o.id, o.name]));

  const get = (row: Record<string, string>, key: string) => {
    const header = mapping[key];
    if (!header) return "";
    return (row[header] ?? "").trim();
  };

  rows.forEach((row, index) => {
    const rowNumber = index + 2; // سطر ۱ سرستون است
    const rowErrors: RowError[] = [];
    const push = (field: string | null, code: string, message: string, raw = "") =>
      rowErrors.push({
        row_number: rowNumber,
        field_name: field,
        error_code: code,
        error_message: message,
        raw_value: raw.slice(0, 300),
      });

    const questionText = get(row, "question_text");
    if (!questionText) push("question_text", "required", "متن سوال خالی است.");
    else if (questionText.length > 5000)
      push("question_text", "too_long", "متن سوال بیش از ۵۰۰۰ کاراکتر است.", questionText);

    const optionTexts: string[] = [];
    for (let i = 1; i <= MAX_OPTIONS; i += 1) {
      optionTexts.push(get(row, `option_${i}`));
    }
    const filled = optionTexts
      .map((text, i) => ({ text, order: i + 1 }))
      .filter((o) => o.text !== "");
    if (filled.length < 2) push("option_1", "min_options", "حداقل دو گزینه لازم است.");

    const correctRaw = toEnglishDigits(get(row, "correct_option"));
    const correctOrders = correctRaw
      .split(/[,،|/]+/)
      .map((v) => Number(v.trim()))
      .filter((v) => Number.isFinite(v));
    if (correctOrders.length === 0) {
      push("correct_option", "required", "گزینه صحیح مشخص نشده است.", correctRaw);
    } else if (
      correctOrders.some((o) => o < 1 || o > MAX_OPTIONS || !filled.some((f) => f.order === o))
    ) {
      push(
        "correct_option",
        "invalid",
        "شماره گزینه صحیح با گزینه‌های موجود هم‌خوانی ندارد.",
        correctRaw,
      );
    }

    const difficultyRaw = get(row, "difficulty");
    const difficulty = difficultyRaw ? DIFFICULTY_MAP[normalizeKey(difficultyRaw)] : "medium";
    if (difficultyRaw && !difficulty)
      push("difficulty", "invalid", "سطح سختی باید easy، medium یا hard باشد.", difficultyRaw);

    const scoreRaw = toEnglishDigits(get(row, "score"));
    const score = scoreRaw === "" ? 1 : Number(scoreRaw);
    if (!Number.isFinite(score) || score <= 0)
      push("score", "invalid", "نمره باید عددی مثبت باشد.", scoreRaw);

    const categoryRaw = get(row, "category");
    let categoryId: string | null = defaultCategoryId || null;
    if (categoryRaw) {
      const found = categoryByName.get(normalizeKey(categoryRaw));
      if (!found) push("category", "not_found", "دسته‌بندی یافت نشد.", categoryRaw);
      else categoryId = found;
    }

    const subjectRaw = get(row, "subject");
    let subjectId: string | null = defaultSubjectId || null;
    if (subjectRaw) {
      const found = subjectByName.get(normalizeKey(subjectRaw));
      if (!found) push("subject", "not_found", "درس یافت نشد.", subjectRaw);
      else subjectId = found;
    }

    const organizationRaw = get(row, "organization");
    let organizationId: string | null = defaultOrganizationId || null;
    if (organizationRaw) {
      const found = organizationByName.get(normalizeKey(organizationRaw));
      if (!found) push("organization", "not_found", "سازمان یافت نشد.", organizationRaw);
      else organizationId = found;
    }

    if (rowErrors.length > 0) {
      errors.push(...rowErrors);
      return;
    }

    const fingerprint = normalizeKey(
      `${questionText}|${filled.map((f) => f.text).join("|")}|${categoryId ?? ""}`,
    );
    if (seen.has(fingerprint)) {
      internalDuplicates += 1;
      errors.push({
        row_number: rowNumber,
        field_name: "question_text",
        error_code: "duplicate_in_file",
        error_message: "این سوال در همین فایل تکراری است.",
        raw_value: questionText.slice(0, 300),
      });
      return;
    }
    seen.add(fingerprint);

    valid.push({
      row_number: rowNumber,
      question_text: questionText,
      options: filled.map((o, i) => ({
        text: o.text,
        is_correct: correctOrders.includes(o.order),
        display_order: i + 1,
      })),
      difficulty: difficulty ?? "medium",
      score,
      category_id: categoryId,
      subject_id: subjectId,
      organization_id: organizationId,
      organization_name:
        organizationRaw || (organizationId ? (organizationById.get(organizationId) ?? null) : null),
      explanation: get(row, "explanation") || null,
      image_url: get(row, "image_url") || null,
      external_id: get(row, "external_id") || null,
    });
  });

  return { valid, errors, internalDuplicates };
}

export function errorsToCsv(errors: RowError[]): string {
  const header = ["row_number", "field_name", "error_code", "error_message", "raw_value"];
  const escape = (v: string) => (/[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);
  const lines = errors.map((e) =>
    [
      String(e.row_number),
      e.field_name ?? "",
      e.error_code ?? "",
      e.error_message ?? "",
      e.raw_value ?? "",
    ]
      .map(escape)
      .join(","),
  );
  return `\uFEFF${header.join(",")}\n${lines.join("\n")}\n`;
}
