export type SeedTask = {
  id: string;
  productId: string;
  productName: string;
  title: string;
  plannedDate: string;
  endDate: string;
  ownerType: string;
  assignee: string;
  status: string;
  progress: number;
  notes: string;
  sourceOrder: number;
};

const base = {
  assignee: "",
  status: "not_started",
  progress: 0,
};

export const DEFAULT_TASKS: SeedTask[] = [
  { ...base, id: "digital-01", productId: "digital", productName: "المحتوى الرقمي", title: "تقديم 40 مقترحاً للمحتوى يغطي الأمانة والمكاتب بناءً على المرتكزات المتفق عليها", plannedDate: "2026-08-27", endDate: "2026-08-27", ownerType: "wamy", notes: "الدفعة الأولى", sourceOrder: 1 },
  { ...base, id: "digital-02", productId: "digital", productName: "المحتوى الرقمي", title: "إنتاج وتصميم 40 بوستاً لمنصات النشر المعتمدة بالعربية والإنجليزية", plannedDate: "2026-09-06", endDate: "2026-09-06", ownerType: "vendor", notes: "الدفعة الأولى", sourceOrder: 2 },
  { ...base, id: "digital-03", productId: "digital", productName: "المحتوى الرقمي", title: "تقديم الملاحظات النهائية على 40 بوستاً بالعربية والإنجليزية", plannedDate: "2026-09-08", endDate: "2026-09-08", ownerType: "wamy", notes: "الدفعة الأولى", sourceOrder: 3 },
  { ...base, id: "digital-04", productId: "digital", productName: "المحتوى الرقمي", title: "التسليم النهائي لـ 40 بوستاً بالعربية والإنجليزية للنشر", plannedDate: "2026-09-13", endDate: "2026-09-13", ownerType: "vendor", notes: "الدفعة الأولى", sourceOrder: 4 },
  { ...base, id: "digital-05", productId: "digital", productName: "المحتوى الرقمي", title: "نشر منتجات الدفعة الأولى في الموقع والمنصات والمجتمعات بمتوسط منتجين يومياً", plannedDate: "2026-09-15", endDate: "2026-10-14", ownerType: "wamy", notes: "يستمر 30 يوماً", sourceOrder: 5 },
  { ...base, id: "digital-06", productId: "digital", productName: "المحتوى الرقمي", title: "تقديم 68 مقترحاً للمحتوى يغطي الأمانة والمكاتب بناءً على المرتكزات المتفق عليها", plannedDate: "2026-09-20", endDate: "2026-09-20", ownerType: "wamy", notes: "الدفعة الثانية", sourceOrder: 6 },
  { ...base, id: "digital-07", productId: "digital", productName: "المحتوى الرقمي", title: "إنتاج وتصميم 68 بوستاً لمنصات النشر المعتمدة بالعربية والإنجليزية", plannedDate: "2026-10-04", endDate: "2026-10-04", ownerType: "vendor", notes: "الدفعة الثانية", sourceOrder: 7 },
  { ...base, id: "digital-08", productId: "digital", productName: "المحتوى الرقمي", title: "تقديم الملاحظات النهائية على 68 بوستاً بالعربية والإنجليزية", plannedDate: "2026-10-08", endDate: "2026-10-08", ownerType: "wamy", notes: "الدفعة الثانية", sourceOrder: 8 },
  { ...base, id: "digital-09", productId: "digital", productName: "المحتوى الرقمي", title: "التسليم النهائي لـ 68 بوستاً بالعربية والإنجليزية للنشر", plannedDate: "2026-10-12", endDate: "2026-10-12", ownerType: "vendor", notes: "الدفعة الثانية", sourceOrder: 9 },
  { ...base, id: "digital-10", productId: "digital", productName: "المحتوى الرقمي", title: "نشر منتجات الدفعة الثانية في الموقع والمنصات والمجتمعات بمتوسط منتجين يومياً", plannedDate: "2026-10-15", endDate: "2026-11-13", ownerType: "wamy", notes: "يستمر 30 يوماً", sourceOrder: 10 },
  { ...base, id: "digital-11", productId: "digital", productName: "المحتوى الرقمي", title: "تقديم 80 مقترحاً للمحتوى يغطي الأمانة والمكاتب بناءً على المرتكزات المتفق عليها", plannedDate: "2026-10-18", endDate: "2026-10-18", ownerType: "wamy", notes: "الدفعة الثالثة", sourceOrder: 11 },
  { ...base, id: "digital-12", productId: "digital", productName: "المحتوى الرقمي", title: "إنتاج وتصميم 80 بوستاً لمنصات النشر المعتمدة بالعربية والإنجليزية", plannedDate: "2026-11-03", endDate: "2026-11-03", ownerType: "vendor", notes: "الدفعة الثالثة", sourceOrder: 12 },
  { ...base, id: "digital-13", productId: "digital", productName: "المحتوى الرقمي", title: "تقديم الملاحظات النهائية على 80 بوستاً بالعربية والإنجليزية", plannedDate: "2026-11-08", endDate: "2026-11-08", ownerType: "wamy", notes: "الدفعة الثالثة", sourceOrder: 13 },
  { ...base, id: "digital-14", productId: "digital", productName: "المحتوى الرقمي", title: "التسليم النهائي لـ 80 بوستاً بالعربية والإنجليزية للنشر", plannedDate: "2026-11-13", endDate: "2026-11-13", ownerType: "vendor", notes: "الدفعة الثالثة", sourceOrder: 14 },
  { ...base, id: "digital-15", productId: "digital", productName: "المحتوى الرقمي", title: "نشر منتجات الدفعة الثالثة في الموقع والمنصات والمجتمعات بمتوسط منتجين يومياً", plannedDate: "2026-11-15", endDate: "2026-12-14", ownerType: "wamy", notes: "يستمر 30 يوماً", sourceOrder: 15 },
  { ...base, id: "digital-16", productId: "digital", productName: "المحتوى الرقمي", title: "تسليم خطة المنتجات للجزء الثاني", plannedDate: "2026-11-17", endDate: "2026-11-17", ownerType: "vendor", notes: "موعد مثبت في الخطة", sourceOrder: 16 },

  { ...base, id: "info-01", productId: "infographic", productName: "الإنفوجرافيك", title: "تقديم 13 مقترحاً لمحتوى الإنفوجرافيك يغطي الأمانة والمكاتب", plannedDate: "2026-09-01", endDate: "2026-09-01", ownerType: "wamy", notes: "13 إنفوجرافيك بالعربية والإنجليزية", sourceOrder: 1 },
  { ...base, id: "info-02", productId: "infographic", productName: "الإنفوجرافيك", title: "إنتاج وتصميم 13 إنفوجرافيك لمنصات النشر المعتمدة بالعربية والإنجليزية", plannedDate: "2026-09-12", endDate: "2026-09-12", ownerType: "vendor", notes: "", sourceOrder: 2 },
  { ...base, id: "info-03", productId: "infographic", productName: "الإنفوجرافيك", title: "تقديم الملاحظات النهائية على 13 إنفوجرافيك بالعربية والإنجليزية", plannedDate: "2026-09-15", endDate: "2026-09-15", ownerType: "wamy", notes: "", sourceOrder: 3 },
  { ...base, id: "info-04", productId: "infographic", productName: "الإنفوجرافيك", title: "التسليم النهائي لـ 13 إنفوجرافيك بالعربية والإنجليزية للنشر", plannedDate: "2026-09-23", endDate: "2026-09-23", ownerType: "vendor", notes: "", sourceOrder: 4 },
  { ...base, id: "info-05", productId: "infographic", productName: "الإنفوجرافيك", title: "نشر جميع الإنفوجرافيك في الموقع والمنصات والمجتمعات بمعدل إنفوجرافيك كل جمعة", plannedDate: "2026-09-25", endDate: "2026-10-24", ownerType: "wamy", notes: "يستمر 30 يوماً", sourceOrder: 5 },

  { ...base, id: "film-01", productId: "film", productName: "الأفلام التوعوية", title: "تقديم 3 مقترحات لمحتوى الأفلام يغطي الأمانة والمكاتب بناءً على المرتكزات", plannedDate: "2026-09-01", endDate: "2026-09-01", ownerType: "wamy", notes: "3 أفلام توعوية تعريفية", sourceOrder: 1 },
  { ...base, id: "film-02", productId: "film", productName: "الأفلام التوعوية", title: "كتابة 3 سيناريوهات مقترحة لأفلام تنشر في منصات النشر المعتمدة", plannedDate: "2026-09-12", endDate: "2026-09-12", ownerType: "vendor", notes: "", sourceOrder: 2 },
  { ...base, id: "film-03", productId: "film", productName: "الأفلام التوعوية", title: "تقديم الملاحظات النهائية على السيناريوهات الثلاثة", plannedDate: "2026-09-15", endDate: "2026-09-15", ownerType: "wamy", notes: "", sourceOrder: 3 },
  { ...base, id: "film-04", productId: "film", productName: "الأفلام التوعوية", title: "تسليم الفيلم الأول ثم تسليم فيلم من بقية الأفلام كل أسبوعين", plannedDate: "2026-09-23", endDate: "2026-10-21", ownerType: "vendor", notes: "3 دفعات بفاصل أسبوعين", sourceOrder: 4 },
  { ...base, id: "film-05", productId: "film", productName: "الأفلام التوعوية", title: "تقديم الملاحظات على الفيلم الأول ثم على بقية الأفلام كل 5 أيام", plannedDate: "2026-09-25", endDate: "2026-10-05", ownerType: "wamy", notes: "3 جولات مراجعة", sourceOrder: 5 },
  { ...base, id: "film-06", productId: "film", productName: "الأفلام التوعوية", title: "تسليم النسخة النهائية للفيلم الأول ثم فيلم من بقية الأفلام كل أسبوعين", plannedDate: "2026-09-29", endDate: "2026-10-27", ownerType: "vendor", notes: "3 دفعات بفاصل أسبوعين", sourceOrder: 6 },
  { ...base, id: "film-07", productId: "film", productName: "الأفلام التوعوية", title: "نشر الفيلم الأول ثم نشر فيلم من بقية الأفلام في نهاية كل شهر", plannedDate: "2026-09-30", endDate: "2026-12-28", ownerType: "wamy", notes: "يستمر 90 يوماً", sourceOrder: 7 },
  { ...base, id: "film-08", productId: "film", productName: "الأفلام التوعوية", title: "تقسيم كل فيلم إلى 4 أجزاء تيك توك ونشرها خلال ثلاثة أشهر", plannedDate: "2026-09-30", endDate: "2026-12-28", ownerType: "wamy", notes: "يستمر 90 يوماً لجميع الأفلام", sourceOrder: 8 },

  { ...base, id: "report-01", productId: "report", productName: "التقارير الاستراتيجية", title: "تقديم 3 مقترحات لمحتوى التقارير يغطي الأمانة والمكاتب بناءً على المرتكزات", plannedDate: "2026-08-25", endDate: "2026-08-25", ownerType: "wamy", notes: "3 تقارير للجهات المعنية", sourceOrder: 1 },
  { ...base, id: "report-02", productId: "report", productName: "التقارير الاستراتيجية", title: "كتابة 3 مخططات تقارير مقترحة مع تحديد أطر كل صفحة من التقارير", plannedDate: "2026-08-27", endDate: "2026-08-27", ownerType: "vendor", notes: "", sourceOrder: 2 },
  { ...base, id: "report-03", productId: "report", productName: "التقارير الاستراتيجية", title: "تقديم الملاحظات النهائية على مخططات التقارير المقترحة", plannedDate: "2026-08-29", endDate: "2026-08-29", ownerType: "wamy", notes: "", sourceOrder: 3 },
  { ...base, id: "report-04", productId: "report", productName: "التقارير الاستراتيجية", title: "تسليم محتوى التقرير الأول ثم محتوى بقية التقارير كل 3 أسابيع", plannedDate: "2026-09-02", endDate: "2026-10-14", ownerType: "vendor", notes: "3 دفعات بفاصل 3 أسابيع", sourceOrder: 4 },
  { ...base, id: "report-05", productId: "report", productName: "التقارير الاستراتيجية", title: "تقديم الملاحظات على التقرير الأول ثم ملاحظات بقية التقارير كل 3 أسابيع", plannedDate: "2026-09-05", endDate: "2026-10-17", ownerType: "wamy", notes: "3 جولات مراجعة بفاصل 3 أسابيع", sourceOrder: 5 },
  { ...base, id: "report-06", productId: "report", productName: "التقارير الاستراتيجية", title: "تسليم تصميم التقرير الأول ثم تصميم بقية التقارير كل 3 أسابيع", plannedDate: "2026-09-15", endDate: "2026-10-27", ownerType: "vendor", notes: "3 دفعات بفاصل 3 أسابيع", sourceOrder: 6 },
  { ...base, id: "report-07", productId: "report", productName: "التقارير الاستراتيجية", title: "تقديم الملاحظات على تصميم التقرير الأول ثم بقية التقارير كل 3 أسابيع", plannedDate: "2026-09-18", endDate: "2026-12-16", ownerType: "wamy", notes: "يستمر 90 يوماً", sourceOrder: 7 },
  { ...base, id: "report-08", productId: "report", productName: "التقارير الاستراتيجية", title: "تقديم النسخة النهائية للتقرير الأول ثم بقية التقارير كل 3 أسابيع", plannedDate: "2026-09-25", endDate: "2026-11-06", ownerType: "vendor", notes: "3 دفعات بفاصل 3 أسابيع", sourceOrder: 8 },
  { ...base, id: "report-09", productId: "report", productName: "التقارير الاستراتيجية", title: "طباعة التقرير وإرساله للجهات المختصة أو نشره في المنصات المعتمدة كل شهر", plannedDate: "2026-09-30", endDate: "2026-12-30", ownerType: "wamy", notes: "يستمر 3 أشهر", sourceOrder: 9 },
];
