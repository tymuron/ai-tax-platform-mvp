/**
 * EN → RU interface translations. Keys are the English text exactly as rendered
 * (whitespace collapsed). Official US form names (Schedule C, W-2, 1099, EITC…) stay in English.
 */
export type Lang = 'en' | 'ru';

export const RU: Record<string, string> = {
  // ---- Auth screen
  'AI-powered tax analysis for US individuals and sole proprietors: potential deductions and an estimated federal tax impact, with every number traced to its source.':
    'Налоговый анализ с ИИ для физлиц и ИП в США: возможные вычеты и оценка эффекта на федеральный налог, у каждой цифры — источник.',
  'Sign in': 'Войти',
  'Create account': 'Создать аккаунт',
  'Full name': 'Имя и фамилия',
  Email: 'Email',
  Password: 'Пароль',
  'At least 10 characters.': 'Не меньше 10 символов.',
  or: 'или',
  'Try a demo with sample data': 'Попробовать демо с примером данных',
  'The demo creates a private account filled with made-up sample statements. Nothing you do there is shared.':
    'Демо создаёт личный аккаунт с вымышленными выписками. Всё, что вы там делаете, видно только вам.',
  'AI Tax does not file returns, sign returns or represent you before the IRS. Results are estimates of potential deductions and estimated tax impact, not a guarantee of savings or a refund. You review and file your own return.':
    'AI Tax не подаёт и не подписывает декларации и не представляет вас перед IRS. Результаты — оценка возможных вычетов и налогового эффекта, а не гарантия экономии или возврата. Декларацию вы проверяете и подаёте сами.',
  'Signing in…': 'Входим…',
  'Creating your account…': 'Создаём аккаунт…',
  'Something went wrong': 'Что-то пошло не так',
  'Network error': 'Ошибка сети',
  'Preparing a private demo with sample data…': 'Готовим личное демо с примером данных…',
  'Could not start the demo': 'Не удалось запустить демо',
  'Email or password is incorrect': 'Неверный email или пароль',
  'An account with this email already exists': 'Аккаунт с таким email уже есть',
  'Password must be at least 10 characters': 'Пароль должен быть не короче 10 символов',

  // ---- Loading / banners / header
  'Loading your workspace…': 'Загружаем рабочее пространство…',
  'Loading documents, IRS': 'Загружаем документы, таблицы IRS',
  'rule tables and checks.': 'и проверки.',
  'Deterministic Engine:': 'Расчётный движок:',
  'Vault:': 'Хранилище:',
  'Classification: rule-based (no external AI model connected)':
    'Классификация: по правилам (внешняя ИИ-модель не подключена)',
  'QA Gate:': 'Проверка QA:',
  VERIFIED: 'ПРОВЕРЕНО',
  NEEDS_REVIEW: 'НУЖНА ПРОВЕРКА',
  BLOCKED: 'ЗАБЛОКИРОВАНО',
  'Preview server: data is kept in temporary storage and can disappear at any time. Do not upload real financial documents here.':
    'Тестовый сервер: данные хранятся временно и могут исчезнуть в любой момент. Не загружайте сюда настоящие финансовые документы.',
  'Demo account — every statement and figure here is made-up sample data.':
    'Демо-аккаунт — все выписки и цифры здесь вымышленные.',
  'v2.0 US Individual & Schedule C/SE': 'v2.0 · физлица и Schedule C/SE (США)',
  'Evidence-Backed Document Intelligence & Deterministic Tax Optimization':
    'Анализ документов с доказательствами и детерминированная налоговая оптимизация',
  'Tax Year 2025': 'Налоговый год 2025',
  'Tax Year 2026': 'Налоговый год 2026',
  '• State:': '• Штат:',
  'Sign out': 'Выйти',
  'Full workspace ($10/mo)': 'Полный доступ ($10/мес)',
  'Free trial (1 statement)': 'Пробный период (1 выписка)',
  '1. Executive Dashboard': '1. Обзор',
  '5. 3-Scenario Tax Calculator': '5. Сравнение 3 сценариев',
  '6. Optimization Report & QA': '6. Отчёт и проверка QA',
  '7. Plans & Export Package': '7. Тарифы и экспорт',
  '8. Admin & Compliance': '8. Администрирование',
  'Additional Tax Review Required': 'Требуется дополнительная налоговая проверка',

  // ---- Dashboard
  IRS: 'IRS',
  'Deterministic Tax Engine (': 'Детерминированный налоговый движок (',
  'Potential deductions and their estimated federal tax impact':
    'Возможные вычеты и их оценочный эффект на федеральный налог',
  'AI Tax separates': 'AI Tax отделяет',
  'gross expenses': 'суммы расходов',
  from: 'от',
  'real tax liability reduction': 'реального снижения налога',
  ', excludes inter-account transfers and credit card repayments from double-counting, and isolates unconfirmed assumptions until you verify them.':
    ', не считает дважды переводы между своими счетами и погашения кредиток и держит неподтверждённые предположения отдельно, пока вы их не подтвердите.',
  'Estimated federal tax impact of confirmed items': 'Оценочный эффект подтверждённых пунктов на федеральный налог',
  Plus: 'И ещё',
  'more is possible if the items awaiting your confirmation hold up. Estimates only; state tax not included; not a guarantee of savings or a refund.':
    'возможно, если пункты, ждущие подтверждения, подтвердятся. Это оценка; налог штата не учтён; экономия и возврат не гарантируются.',
  'Baseline estimated federal tax': 'Базовый федеральный налог (оценка)',
  'Effective Rate:': 'Эффективная ставка:',
  '% on': '% от',
  gross: 'дохода',
  'Confirmed scenario tax': 'Налог в подтверждённом сценарии',
  'CONFIRMED ITEMS': 'ПОДТВЕРЖДЁННОЕ',
  'lower than baseline (estimate)': 'ниже базового (оценка)',
  'Potential Scenario Tax': 'Налог в потенциальном сценарии',
  'NEEDS CONFIRMATION': 'НУЖНО ПОДТВЕРЖДЕНИЕ',
  'lower than baseline if every item is confirmed': 'ниже базового, если подтвердится всё',
  'Excluded Transfers & Duplicates': 'Исключённые переводы и дубли',
  'Protected from false income or double-expense counting': 'Не засчитаны как ложный доход или двойной расход',
  'Taxpayer Profile & Special Optimization Parameters (': 'Профиль налогоплательщика и параметры оптимизации (',
  'Changing any parameter triggers an immediate deterministic recalculation across all 3 scenarios.':
    'Любое изменение сразу пересчитывает все 3 сценария.',
  'Filing Status': 'Статус подачи',
  Single: 'Single (одинокий)',
  'Married Filing Jointly': 'Married Filing Jointly (супруги совместно)',
  'Married Filing Separately': 'Married Filing Separately (супруги раздельно)',
  'Head of Household': 'Head of Household (глава семьи)',
  'US State': 'Штат',
  '— no state income tax on wages': '— нет налога штата на зарплату',
  '— state tax not calculated': '— налог штата не рассчитывается',
  'Qualifying Children (<17)': 'Дети до 17 лет',
  'Dedicated Home Office (Sq Ft)': 'Домашний офис (кв. футы)',
  'Business Vehicle Miles (': 'Деловые мили на авто (',
  '/mi)': '/миля)',
  '72.5¢ / 76¢ from Jul': '72,5¢ / 76¢ с июля',
  'Self-Employed Health Ins ($)': 'Медстраховка ИП ($)',
  'SEP-IRA / Solo 401(k) ($)': 'SEP-IRA / Solo 401(k) ($)',
  'Child/Dependent Care Paid ($)': 'Расходы на уход за детьми ($)',
  'Estimated Tax / Withholding ($)': 'Авансовые платежи / удержано ($)',
  'Test Unsupported Complex Entity Guardrail ("Additional tax review required")':
    'Проверить сложную структуру вне поддержки («Требуется дополнительная налоговая проверка»)',
  'View Full 3-Scenario Breakdown': 'Полное сравнение 3 сценариев',
  'Required Actions to Finalize': 'Что нужно сделать для завершения',
  Answer: 'Ответить на',
  'AI Clarification Questions': 'уточняющих вопросов',
  'Inspect Full Tax Optimization Report': 'Открыть полный отчёт',

  // ---- Documents
  'Document Intelligence Engine & Private Encrypted Vault': 'Анализ документов и зашифрованное хранилище',
  'Supports PDF, CSV, XLSX, JPG, PNG (W-2, 1099-NEC, 1099-K, 1099-MISC, 1098, 1095-A, Bank & Card Statements, Receipts, Contracts).':
    'PDF, CSV, XLSX, JPG, PNG (W-2, 1099-NEC, 1099-K, 1099-MISC, 1098, 1095-A, банковские и карточные выписки, чеки, договоры).',
  'Upload Document (PDF/CSV/XLSX/JPG/PNG)': 'Загрузить документ (PDF/CSV/XLSX/JPG/PNG)',
  '+ Load Sample Equipment & Contractor CSV': '+ Пример: CSV с техникой и подрядчиками',
  '+ Test OCR Scan with Missing Page / Uncertain Row': '+ Пример: файл с нераспознанной строкой',
  Filename: 'Файл',
  'Type & Format': 'Тип и формат',
  'Period Covered': 'Период',
  'OCR / Confidence': 'OCR / уверенность',
  'Status & Integrity Warnings': 'Статус и предупреждения',
  'ID:': 'ID:',
  '% Confidence': '% уверенности',
  '⚠ Missing page sequence detected': '⚠ Не хватает страниц',
  'Annual / Single Date': 'Год / одна дата',
  'OCR Pipeline Used': 'Распознано OCR',
  'Native Digital Parse': 'Цифровой файл',
  Verified: 'Проверено',
  'Needs Review': 'Нужна проверка',
  processed: 'обработан',
  needs_review: 'нужна проверка',
  failed: 'ошибка',

  // ---- Ledger
  'Financial Analysis & Traceable Transaction Ledger': 'Финансовый анализ и журнал операций',
  'Every transaction preserves its source coordinate, AI classification, user override, business-use %, and 6-tier evidence status.':
    'У каждой операции сохранены источник, автоматическая классификация, ваши правки, % делового использования и статус подтверждения.',
  'All Groups (': 'Все группы (',
  Income: 'Доход',
  'Business Expenses': 'Деловые расходы',
  'Business expenses': 'Деловые расходы',
  'Non-Expense (Transfers & CC Repayments)': 'Не расходы (переводы и погашения карт)',
  'Non-expense transactions': 'Не расходы',
  'Non-Expense transactions': 'Не расходы',
  'Personal Expenses': 'Личные расходы',
  'Personal expenses': 'Личные расходы',
  'Needs Review / Uncertain OCR': 'Нужна проверка / неуверенное распознавание',
  'Search merchant or category...': 'Поиск по продавцу или категории…',
  'Date & Source': 'Дата и источник',
  'Merchant & Description (Masked)': 'Продавец и описание (скрыто)',
  Amount: 'Сумма',
  Group: 'Группа',
  'Schedule C Category': 'Категория Schedule C',
  'Business %': 'Деловая доля %',
  'Evidence Status & Rule': 'Подтверждение и правило',
  'Needs Review — Click to Confirm Date': 'Нужна проверка — нажмите, чтобы подтвердить дату',
  Recurring: 'Регулярный',
  'Duplicate Excluded': 'Дубль исключён',
  '(User Confirmed)': '(подтверждено вами)',

  // ---- Evidence badges and categories
  'Verified by Document': 'Подтверждено документом',
  'Potentially Deductible — Confirmation Required': 'Возможный вычет — нужно подтверждение',
  'Partially Deductible': 'Частично вычитается',
  'Non-Deductible': 'Не вычитается',
  'Additional Info Required': 'Нужна доп. информация',
  'Insufficient Data (Needs Review)': 'Недостаточно данных (проверить)',
  'Advertising & Marketing': 'Реклама и маркетинг',
  'Office Expenses': 'Офисные расходы',
  'Software & Subscriptions': 'Софт и подписки',
  'Professional & Legal Services': 'Юристы, бухгалтеры, специалисты',
  'Business Insurance': 'Страхование бизнеса',
  'Bank & Processing Fees': 'Банковские и платёжные комиссии',
  'Business Travel': 'Деловые поездки',
  'Business Mileage': 'Деловой пробег',
  'Eligible Business Meals (50%)': 'Деловые обеды (50%)',
  'Equipment & Supplies': 'Оборудование и материалы',
  'Rent & Lease': 'Аренда',
  Utilities: 'Коммунальные услуги',
  'Telephone & Internet': 'Телефон и интернет',
  'Education & Training': 'Обучение',
  'Vehicle Expenses': 'Расходы на авто',
  'Home Office': 'Домашний офис',
  'Depreciation & Section 179': 'Амортизация и Section 179',
  'Other Business Expenses': 'Прочие деловые расходы',
  'None / Non-Business': 'Нет / не деловое',

  // ---- Interview
  'AI Tax Interview Engine — High-Precision Contextual Clarifications': 'Уточняющие вопросы',
  'Principle: Better to ask one concise question than make an unverified tax assumption. Answering any question updates the underlying transactions and triggers a deterministic tax recalculation.':
    'Принцип: лучше задать один точный вопрос, чем сделать непроверенное налоговое допущение. Каждый ответ обновляет операции и пересчитывает налог.',
  '100% business use': '100% для бизнеса',
  'Partially business use (60%)': 'Частично для бизнеса (60%)',
  'Personal use (0% deductible)': 'Личное (0% к вычету)',
  'Not sure (Keep as unconfirmed)': 'Не знаю (оставить неподтверждённым)',
  'Yes — exclusive and regular business use': 'Да — только для работы и регулярно',
  'No — shared/personal living space (Not eligible)': 'Нет — общее/жилое помещение (не подходит)',
  'Not sure / Skip for now': 'Не знаю / пропустить',
  'Yes — contemporaneous mileage log maintained': 'Да — веду журнал поездок',
  'No log maintained — exclude mileage deduction': 'Журнала нет — не учитывать пробег',
  'Not sure': 'Не знаю',
  pending: 'ждёт ответа',
  answered: 'отвечено',
  skipped: 'пропущено',
  'merchant business purpose': 'деловая цель покупки',
  'recurring subscription': 'регулярная подписка',
  'mixed use split': 'смешанное использование',
  'home office': 'домашний офис',
  'vehicle mileage': 'пробег авто',

  // ---- Scenarios
  '3-Scenario Deterministic Tax Comparison (': 'Сравнение трёх налоговых сценариев (',
  'Compares Baseline vs. Confirmed Optimizations vs. Potential Unconfirmed Opportunities. Unconfirmed deductions are strictly isolated in Scenario 3.':
    'Базовый сценарий, подтверждённые вычеты и возможные, но не подтверждённые. Неподтверждённые вычеты есть только в сценарии 3.',
  'Run ID:': 'ID расчёта:',
  'Tax Line Item': 'Строка',
  '1. Baseline Scenario': '1. Базовый',
  '2. Confirmed Optimization (Verified)': '2. Подтверждённый',
  '3. Potential Scenario (Needs Confirmation)': '3. Потенциальный (нужно подтверждение)',
  'Form W-2 Taxable Wages': 'Зарплата по W-2',
  'Form 1099-NEC / 1099-K & Schedule C Gross Receipts': 'Доход по 1099-NEC / 1099-K и Schedule C',
  'Total Gross Income': 'Общий доход',
  'Schedule C Business Deductions (Operating + Home Office + Mileage + §179)':
    'Вычеты Schedule C (расходы + домашний офис + пробег + §179)',
  'Schedule C Net Profit': 'Чистая прибыль Schedule C',
  'Self-Employment Tax (Schedule SE: OASDI 12.4% + Medicare 2.9%)': 'Налог самозанятого (Schedule SE: 12,4% + 2,9%)',
  'Above-the-Line Adjustments (50% SE Tax + SE Health Ins + SEP-IRA)':
    'Корректировки дохода (50% налога SE + медстраховка + SEP-IRA)',
  'Adjusted Gross Income (AGI)': 'Скорректированный доход (AGI)',
  'Standard Deduction': 'Стандартный вычет',
  'Qualified Business Income (QBI) 20% Deduction (IRC §199A)': 'Вычет 20% QBI (IRC §199A)',
  'Taxable Income': 'Налогооблагаемый доход',
  'Regular Federal Income Tax (Before Credits)': 'Федеральный подоходный налог (до кредитов)',
  'Non-refundable credits used (CTC, child care, education)': 'Невозвратные кредиты (CTC, уход за детьми, обучение)',
  'Federal Income Tax After Credits': 'Подоходный налог после кредитов',
  'Self-employment tax + Additional Medicare tax': 'Налог SE + доп. налог Medicare',
  'Total federal tax (Form 1040 line 24)': 'Итого федеральный налог (Form 1040, стр. 24)',
  'Refundable credits (EITC, additional CTC, AOTC 40%)': 'Возвратные кредиты (EITC, доп. CTC, AOTC 40%)',
  'Estimated federal tax difference vs. baseline': 'Разница с базовым сценарием (оценка)',
  'Immutable Deterministic Calculation Trace Log': 'Журнал расчёта по шагам',
  '• Formula:': '• Формула:',

  // ---- Report
  'Quality Assurance Engine Gate & 8 Accuracy Metrics': 'Проверка качества и 8 метрик',
  'Every report is verified against arithmetic, duplicate, transfer/CC-repayment, and rule-version gates before display.':
    'Перед показом каждый отчёт проверяется: арифметика, дубли, переводы и погашения карт, версия правил.',
  'Potential deductions and credits, with estimated tax impact': 'Возможные вычеты и кредиты с оценкой налогового эффекта',
  'Crucial Distinction:': 'Важно:',
  Eligible: 'Сумма',
  'Estimated tax impact:': 'Оценка эффекта:',
  'Formula:': 'Формула:',
  '| Citation:': '| Источник:',
  'Date & Amount Extraction Integrity': 'Даты и суммы распознаны',
  'Zero Duplicate Transaction Inclusion': 'Дубли не учтены',
  'Self-Transfer & Credit Card Repayment Exclusion': 'Переводы себе и погашения карт исключены',
  'Multi-Document Period & Page Reconciliation': 'Периоды и страницы сверены',
  'Deterministic Arithmetic & Totals Reconciliation': 'Арифметика и итоги сходятся',
  'Tax Year Rule Version & Limits Verification': 'Версия правил соответствует году',
  'Recommendation Evidence & IRS Rule Traceability': 'У рекомендаций есть источники',
  'Supported Taxpayer Scope Verification': 'Ситуация входит в поддерживаемые',

  // ---- Recommendation titles
  'Advertising & Digital Marketing Expenses': 'Реклама и digital-маркетинг',
  'Office Supplies, Postage & Workspace Consumables': 'Канцтовары, почта и расходники',
  'Business SaaS, Cloud Infrastructure & Software Subscriptions': 'SaaS, облако и подписки на софт',
  'Legal, Accounting, Tax Prep & Specialist Contractor Fees': 'Юристы, бухгалтерия и подрядчики',
  'Commercial Liability & Professional E&O Insurance': 'Страхование ответственности бизнеса',
  'Merchant Processing (Stripe/PayPal) & Business Banking Fees': 'Комиссии Stripe/PayPal и банка',
  'Business Airfare, Rail & Overnight Lodging Away From Tax Home': 'Деловые перелёты, поезда и проживание',
  'Business Vehicle Mileage Deduction': 'Вычет за деловой пробег',
  'Eligible Business Meals (Subject to 50% Statutory Limit)': 'Деловые обеды (лимит 50%)',
  'Business Equipment, Hardware & Operational Supplies': 'Оборудование и материалы',
  'Coworking & Commercial Office Lease Payments': 'Коворкинг и аренда офиса',
  'Commercial Office Utilities': 'Коммунальные услуги офиса',
  'Business Portion of Telephone & High-Speed Internet': 'Деловая часть телефона и интернета',
  'Professional Education, Certifications & Skill Training': 'Обучение и сертификаты',
  'Actual Business Vehicle Operating Expenses': 'Фактические расходы на авто',
  'Dedicated Home Office Deduction (Form 8829 / Simplified)': 'Вычет за домашний офис',
  'Section 179 Expensing & Bonus Depreciation on Capital Assets': 'Section 179 и бонусная амортизация',
  'Other Ordinary & Necessary Business Expenses': 'Прочие обычные деловые расходы',
  '20% Qualified Business Income (QBI) Deduction (Form 8995)': 'Вычет 20% QBI (Form 8995)',
  'Self-Employed Health Insurance Above-the-Line Deduction (Form 7206)': 'Вычет за медстраховку ИП (Form 7206)',
  'Self-Employed SEP-IRA / Solo 401(k) Deduction (Schedule 1 Line 16)': 'Пенсионные взносы SEP-IRA / Solo 401(k)',
  'Child and Dependent Care Credit (Form 2441)': 'Кредит на уход за детьми (Form 2441)',
  'Higher Education Tax Credit (AOTC / Lifetime Learning Credit — Form 8863)': 'Кредит на обучение (AOTC / LLC — Form 8863)',
  'Earned Income Tax Credit (EITC — Schedule EIC)': 'Кредит на заработанный доход (EITC)',

  // ---- Plans & export
  'Workspace Entitlement': 'Доступ к рабочему пространству',
  'Current:': 'Сейчас:',
  'AI Tax Pro Monthly Subscription — $10 / month': 'Подписка AI Tax Pro — $10 в месяц',
  'Free Trial includes 1 bank statement and preliminary extraction. Pro Subscription unlocks unlimited multi-document ingestion (W-2, 1099, receipts), interactive AI Tax Interview, full 3-scenario comparison, and historical tax years.':
    'Пробный период: 1 выписка и предварительный разбор. Подписка Pro: любые документы (W-2, 1099, чеки), уточняющие вопросы, сравнение 3 сценариев и прошлые годы.',
  'Activate / Verify $10/mo Pro Subscription (Server Webhook)': 'Оформить подписку Pro за $10/мес',
  'Switch to Free Trial (Test 1-Statement Gate)': 'Отменить подписку',
  'Document Export Package Entitlement': 'Пакет экспорта документов',
  'Tax Preparation & Audit Workpaper Export Package': 'Пакет документов для подготовки декларации',
  'Transparent one-time fee for the downloadable PDF, CSV, and multi-sheet XLSX Schedule C/SE workpaper package. Paid through Stripe Checkout; access unlocks only after Stripe confirms the payment to our server.':
    'Разовая плата за пакет PDF, CSV и XLSX по Schedule C/SE. Оплата через Stripe; доступ открывается только после того, как Stripe подтвердит платёж нашему серверу.',
  'Private Signed Export Package Downloads (HMAC-SHA256 Temporary Links)': 'Скачивание по временным защищённым ссылкам',
  'Download PDF Tax Optimization Report': 'Скачать отчёт PDF',
  'Download Audit-Ready Schedule C Ledger (CSV)': 'Скачать журнал Schedule C (CSV)',
  'Download Multi-Sheet Workbook (XLSX)': 'Скачать книгу XLSX',
  'Optional Experience Rating (1–5 Stars)': 'Оценка сервиса (1–5 звёзд, по желанию)',
  'Submitting a rating is completely optional and never restricts access to your tax reports or export packages.':
    'Оценка необязательна и никак не влияет на доступ к отчётам и экспорту.',
  'Optional feedback comment...': 'Комментарий (необязательно)…',
  'Submit Rating': 'Отправить оценку',
  'Latest rating recorded:': 'Последняя оценка:',
  '/5 stars': '/5 звёзд',
  'Pro $10/mo': 'Pro $10/мес',
  'Free Trial': 'Пробный период',
  'Webhook Verified — Ready to Download': 'Оплачено — можно скачать',
  'Export Package Not Purchased': 'Пакет экспорта не куплен',
  'Essential Export': 'Базовый экспорт',
  'Pro Schedule C/SE': 'Pro Schedule C/SE',
  'Complete Audit Pack': 'Полный пакет',

  // ---- Admin
  'Staff Administration, AI Quality, Payments & Tax Rules Governance': 'Администрирование: пользователи, качество, платежи, правила',
  'All administrative operations are recorded in the immutable audit_logs table. Raw document contents are protected by tenant isolation.':
    'Все действия администраторов записываются в журнал аудита. Содержимое документов изолировано по пользователям.',
  'Refresh Admin Telemetry': 'Обновить данные',
  'Active Subscription MRR': 'Подписки (MRR)',
  'Export Package Revenue': 'Выручка от экспорта',
  'Total Verified Platform Revenue': 'Общая подтверждённая выручка',
  '1. Users & Entitlement Status': '1. Пользователи и доступы',
  User: 'Пользователь',
  Role: 'Роль',
  Plan: 'Тариф',
  'Account Status': 'Статус',
  Action: 'Действие',
  'Toggle Active/Block': 'Заблокировать / разблокировать',
  '2. Versioned IRS Tax Rules Governance': '2. Версии налоговых правил IRS',
  '(Tax Year': '(налоговый год',
  'Last Verified:': 'Проверено:',
  '• Status:': '• Статус:',
  'Re-Verify Rule Version': 'Отметить как проверенную',
  '3. Security & Compliance Audit Trail (PII Sanitized)': '3. Журнал аудита (без персональных данных)',

  // ---- Footer
  'Regulatory Notice & Legal Boundaries (Section 15 Compliance)': 'Правовые ограничения',
  'All calculations use deterministic IRS rule sets (': 'Все расчёты используют версионированные правила IRS (',
  ') and distinguish between confirmed deductions and potential opportunities requiring user substantiation.':
    ') и разделяют подтверждённые вычеты и возможности, требующие подтверждения.',
  'AI Tax Platform v2.0': 'AI Tax v2.0',
  'PostgreSQL 16 • AES-256-GCM Vault • Stripe Webhook Verified': 'PostgreSQL • шифрование AES-256-GCM • оплата через Stripe',

  // ---- Alerts and busy messages
  'Failed to load workspace': 'Не удалось загрузить данные',
  'Network error loading workspace': 'Ошибка сети при загрузке',
  'Payment received by Stripe. Access unlocks as soon as Stripe confirms it to our server (usually a few seconds) — refresh if it has not appeared.':
    'Stripe принял оплату. Доступ откроется, как только Stripe подтвердит её серверу (обычно за несколько секунд) — обновите страницу, если не появился.',
  'Checkout was cancelled. You were not charged.': 'Оплата отменена. Деньги не списаны.',
  'Document upload failed': 'Не удалось загрузить документ',
  'Ingesting sample tax document...': 'Загружаем пример документа…',
  'Saving answer & running deterministic tax recalculation...': 'Сохраняем ответ и пересчитываем налог…',
  'Interview answer saved. Affected transactions and tax scenarios updated.': 'Ответ сохранён. Операции и сценарии обновлены.',
  'Updating classification & recalculating tax scenarios...': 'Обновляем классификацию и пересчитываем…',
  'Transaction classification updated and verified in audit trail.': 'Классификация операции обновлена.',
  'Updating taxpayer profile & recalculating scenarios...': 'Обновляем профиль и пересчитываем…',
  'Taxpayer profile updated and scenarios recalculated.': 'Профиль обновлён, сценарии пересчитаны.',
  'Cancelling subscription…': 'Отменяем подписку…',
  'Opening secure Stripe checkout…': 'Открываем оплату Stripe…',
  'Done.': 'Готово.',
  'Submitting rating...': 'Отправляем оценку…',
  'Thank you for your feedback! (Ratings are optional and never restrict access to your tax documents.)':
    'Спасибо за отзыв! (Оценка необязательна и не влияет на доступ к документам.)',
  'PAYMENTS_NOT_CONFIGURED: Stripe is not set up on this server (STRIPE_SECRET_KEY and STRIPE_WEBHOOK_SECRET). No payment can be taken and nothing was unlocked.':
    'Оплата на этом сервере не настроена (это демо). Деньги не списаны, ничего не открыто.',
  'EXPORT_ENTITLEMENT_REQUIRED: Document Export Package ($50 / $100 / $200) must be purchased and verified via server Stripe webhook before downloading.':
    'Чтобы скачать, нужно купить пакет экспорта ($50 / $100 / $200).',
};

/** Generated sentences (server texts with names and amounts inside). */
export const RU_PATTERNS: Array<[RegExp, (...m: string[]) => string]> = [
  [
    /^We found (\d+) purchase\(s\) at (.+?) totaling (\$[\d,.]+) in (\d{4})\. Retailers like .+? cannot be deducted by store name alone—were these items purchased for your business and do you have an itemized invoice\?$/,
    (_, n, m, a, y) =>
      `Мы нашли покупки (${n}) в «${m}» на ${a} за ${y} год. По названию магазина вычесть нельзя — это покупки для бизнеса и есть ли подробный чек или счёт?`,
  ],
  [
    /^We detected (\d+) payment\(s\) to (.+?) totaling (\$[\d,.]+) for the (\d{4}) tax year\. Was this subscription or service used for your business activity\?$/,
    (_, n, m, a, y) => `Мы нашли платежи (${n}) в «${m}» на ${a} за ${y} год. Эта подписка или услуга использовалась для бизнеса?`,
  ],
  [
    /^Did you use a dedicated area of your home \(([\d,.]+) sq ft of ([\d,.]+) sq ft\) exclusively and regularly as your principal place of business in (\d{4})\?$/,
    (_, a, b, y) =>
      `Вы использовали отдельную часть дома (${a} из ${b} кв. футов) только для работы и регулярно, как основное место бизнеса, в ${y} году?`,
  ],
  [
    /^You have ([\d,]+) business miles recorded out of ([\d,]+) total miles in (\d{4})\. Do you maintain a written or app-based mileage log under IRC §274\(d\)\?$/,
    (_, a, b, y) => `У вас ${a} деловых миль из ${b} за ${y} год. Вы ведёте журнал поездок (бумажный или в приложении), как требует IRC §274(d)?`,
  ],
  [/^Answer AI Clarification \((.+)\)$/, (_, c) => `Ответить на уточняющий вопрос (${RU[c] ?? c})`],
  [/^Verify Low-Confidence Extraction: (.+)$/, (_, m) => `Проверить нераспознанную строку: ${m}`],
  [/^Complete Annual Statement Coverage \((.+)\)$/, (_, f) => `Дозагрузить выписки за весь год (${f})`],
  [/^(.+) \(Confirmation Required\)$/, (_, t) => `${RU[t] ?? t} (нужно подтверждение)`],
  [/^Home Office Deduction \(Form 8829 Actual Expense Method\)$/, () => 'Домашний офис (фактические расходы, Form 8829)'],
  [/^Home Office Deduction \(IRS Simplified Method\)$/, () => 'Домашний офис (упрощённый метод IRS)'],
  [/^Business Vehicle Deduction \(([\d.]+)¢\/mile Standard Rate\)$/, (_, c) => `Вычет за авто (стандартная ставка ${c}¢/миля)`],
  [/^Business Vehicle Deduction \(Actual Expense Method\)$/, () => 'Вычет за авто (фактические расходы)'],
  [/^Child Tax Credit \((\d+) qualifying child(?:ren)?\)$/, (_, n) => `Налоговый кредит на детей (детей: ${n})`],
  [/^2\. Document Vault \((\d+)\)$/, (_, n) => `2. Документы (${n})`],
  [/^3\. Financial Ledger \((\d+)\)$/, (_, n) => `3. Операции (${n})`],
  [/^4\. AI Tax Interview \((\d+) Pending\)$/, (_, n) => `4. Вопросы (${n} без ответа)`],
  [
    /^State income tax \((\w\w)\) — (none on wages|not calculated, not included)$/,
    (_, s, r) => `Налог штата (${s}) — ${r === 'none on wages' ? 'нет налога на зарплату' : 'не рассчитан и не учтён'}`,
  ],
  [/^Processed "(.+)" \((\d+) transactions extracted\)\. Deterministic tax scenarios recalculated\.$/, (_, f, n) => `Файл «${f}» обработан (операций: ${n}). Сценарии пересчитаны.`],
  [/^Ingested "(.+)" \((\d+) transactions\)\.$/, (_, f, n) => `Загружен «${f}» (операций: ${n}).`],
  [/^Encrypting & extracting "(.+)"\.\.\.$/, (_, f) => `Шифруем и разбираем «${f}»…`],
  [
    /^FREE_TRIAL_LIMIT_REACHED: .*$/,
    () => 'Пробный период позволяет загрузить 1 выписку. Для остальных документов нужна подписка Pro ($10/мес).',
  ],
  [/^DUPLICATE_DOCUMENT: this exact file was already uploaded as "(.+)"\..*$/, (_, f) => `Этот файл уже загружен как «${f}». Повторно не добавлен, чтобы ничего не посчиталось дважды.`],
];

Object.assign(RU, {
  'Demo user (sample data)': 'Демо-пользователь (пример данных)',
  SINGLE: 'SINGLE (одинокий)',
  PENDING: 'ЖДЁТ ОТВЕТА',
  ANSWERED: 'ОТВЕЧЕНО',
  SKIPPED: 'ПРОПУЩЕНО',
  deduction: 'вычета',
  credit: 'кредита',
  'date amount accuracy': 'Точность дат и сумм',
  'user correction rate': 'Доля ваших исправлений',
  'classification accuracy': 'Уверенность классификации',
  'recommendation precision': 'Уверенность рекомендаций',
  'tax calculation accuracy': 'Точность расчёта налога',
  'document extraction accuracy': 'Качество распознавания документов',
  'duplicate detection accuracy': 'Поиск дублей',
  'transaction extraction accuracy': 'Качество распознавания операций',
  'Date Amount Accuracy': 'Точность дат и сумм',
  'User Correction Rate': 'Доля ваших исправлений',
  'Classification Accuracy': 'Уверенность классификации',
  'Recommendation Precision': 'Уверенность рекомендаций',
  'Tax Calculation Accuracy': 'Точность расчёта налога',
  'Document Extraction Accuracy': 'Качество распознавания документов',
  'Duplicate Detection Accuracy': 'Поиск дублей',
  'Transaction Extraction Accuracy': 'Качество распознавания операций',
  'Inter-account transfers and credit card bill repayments are classified as Non-expense transactions and excluded from income/deductions.':
    'Переводы между своими счетами и погашения кредиток отнесены к «не расходам» и не учитываются ни в доходе, ни в вычетах.',
  'Taxpayer profile is within supported Individual + Sole Proprietor (W-2 / 1099 / Schedule C / SE) scope.':
    'Профиль входит в поддерживаемые случаи: физлицо и ИП (W-2 / 1099 / Schedule C / SE).',
  'Additional tax review required for complex entity outside Sole Proprietor / W-2 scope.':
    'Требуется дополнительная налоговая проверка: структура вне поддерживаемых случаев.',
  'Deductions lower your taxable income (saving you your marginal tax rate percentage), whereas Tax Credits reduce your tax liability dollar-for-dollar. Unconfirmed potential deductions are shown separately and must be substantiated before claiming.':
    'Вычеты уменьшают налогооблагаемый доход (экономия — примерно ваша предельная ставка), а налоговые кредиты уменьшают сам налог доллар в доллар. Неподтверждённые вычеты показаны отдельно; заявлять их можно только с подтверждением.',
  'IRC §162(a) requires verifying specific items purchased at general retailers.':
    'IRC §162(a): у покупок в универсальных магазинах нужно подтвердить, что именно куплено.',
  // Recommendation explanations
  'A home office is deductible only if the space is used regularly and exclusively as the principal place of business (IRC §280A). The deduction is capped at the business profit.':
    'Домашний офис вычитается, только если помещение используется регулярно и исключительно как основное место бизнеса (IRC §280A). Вычет не больше прибыли бизнеса.',
  'Business mileage logged for client meetings and business errands reduces both income tax and Schedule SE self-employment tax.':
    'Деловой пробег (встречи с клиентами, поездки по делам) уменьшает и подоходный налог, и налог самозанятого.',
  'Pass-through sole proprietorship net profit qualifies for the 20% §199A deduction subject to taxable income thresholds.':
    'Прибыль ИП даёт право на вычет 20% по §199A с учётом порогов дохода.',
  'Self-employed individuals with net Schedule C profit may deduct 100% of health, dental, and vision premiums above the line.':
    'ИП с прибылью по Schedule C может вычесть 100% взносов на медицинскую, стоматологическую и офтальмологическую страховку.',
  'Contributions up to 20% of net adjusted self-employment income can be funded up until the tax filing deadline (including extensions).':
    'Взносы до 20% скорректированного дохода ИП можно внести до срока подачи декларации (включая продление).',
  'Tax credits reduce tax liability dollar-for-dollar rather than merely reducing taxable income.':
    'Налоговые кредиты уменьшают сам налог доллар в доллар, а не только налогооблагаемый доход.',
  'Care expenses paid so the taxpayer could work or actively run a business qualify for Form 2441 credit.':
    'Расходы на уход за детьми, чтобы вы могли работать или вести бизнес, дают кредит по Form 2441.',
  'Qualified higher education expenses verified against MAGI phase-out limits.':
    'Расходы на высшее образование проверены по лимитам дохода.',
  'Earned income and AGI fall within the EITC limits for the year.': 'Заработанный доход и AGI в пределах лимитов EITC за год.',
  // Classifier explanations
  'Default classification as personal or unconfirmed expenditure.': 'По умолчанию — личный или неподтверждённый расход.',
  'Transaction date or amount was not confidently recognized. Requires manual user verification before tax inclusion.':
    'Дата или сумма распознаны неуверенно. Подтвердите вручную, прежде чем операция попадёт в расчёт.',
  'Transfer between the taxpayer’s own bank accounts. Excluded from both gross income and deductible expenses to prevent double counting.':
    'Перевод между вашими счетами. Не учитывается ни в доходе, ни в расходах, чтобы не считать дважды.',
  'Credit card bill payment from bank account. Excluded from expenses because underlying card purchases are tracked separately.':
    'Погашение кредитки со счёта. Не считается расходом: сами покупки по карте учитываются отдельно.',
  'Capital contribution, owner draw, or loan principal transaction is neither taxable income nor a deductible expense.':
    'Взнос владельца, изъятие или тело кредита — не доход и не вычитаемый расход.',
  'Purchase refund or merchant credit; tracked as non-income offset.': 'Возврат покупки; уменьшает расход, а не доход.',
  'Employment wages reported via W-2 or payroll direct deposit.': 'Зарплата по W-2 или зачисление зарплаты.',
  'Self-employment / independent contractor gross receipts.': 'Доход самозанятого / подрядчика.',
  'Inbound business revenue or deposit.': 'Поступление выручки бизнеса.',
  'Purchases at multi-purpose retailers (e.g., Amazon, Target, Walmart, Apple) cannot be treated as confirmed deductions by merchant name alone. Business purpose and itemized invoice must be confirmed.':
    'Покупки в универсальных магазинах (Amazon, Target, Walmart, Apple) нельзя считать вычетом по названию магазина. Нужно подтвердить деловую цель и подробный чек.',
  'Digital advertising or marketing platform expenditure directly tied to business promotion.':
    'Расходы на онлайн-рекламу и маркетинг для продвижения бизнеса.',
  'Professional software or cloud infrastructure subscription. Eligible for Schedule C deduction to the extent used in business activity.':
    'Подписка на профессиональный софт или облако. Вычитается в той части, в какой используется для бизнеса.',
  'Payment processing or business bank account fee directly incurred on gross receipts.':
    'Комиссия за приём платежей или обслуживание делового счёта.',
  'Legal, accounting, bookkeeping, or professional contractor service fee.': 'Услуги юриста, бухгалтера или подрядчика.',
  'Business liability or E&O insurance policy premium.': 'Страхование ответственности бизнеса.',
  'Airfare or lodging expense. Deductible if primary trip purpose was business away from tax home.':
    'Перелёт или проживание. Вычитается, если основная цель поездки — бизнес вдали от места жительства.',
  'Business meal with client or while traveling away from home is subject to the statutory 50% deduction limit and requires business attendee/purpose notes.':
    'Деловой обед с клиентом или в командировке: вычитается 50%, нужна запись, с кем и зачем.',
  'Telephone and internet service used for both business and personal purposes. Only the substantiated business-use percentage is deductible.':
    'Телефон и интернет для работы и личного пользования. Вычитается только подтверждённая деловая доля.',
  'Coworking space or commercial office lease payment.': 'Коворкинг или аренда офиса.',
  'Office supplies, postage, or shipping expense.': 'Канцтовары, почта или доставка.',
  'Professional training or certification maintaining skills in the taxpayer’s current trade or business.':
    'Обучение или сертификация для поддержания навыков в вашей текущей профессии.',
  'Capital equipment acquisition (>1 year useful life). Eligible for Section 179 or Bonus Depreciation only if placed in service during the tax year and business use exceeds 50%.':
    'Покупка оборудования (срок службы больше года). Section 179 или бонусная амортизация — только если введено в использование в этом году и деловое использование больше 50%.',
  'Personal living, family, grocery, fitness, or entertainment expenditure not deductible under IRC §262.':
    'Личные, семейные расходы, продукты, фитнес, развлечения — не вычитаются (IRC §262).',
});

const CATEGORY_RU: Record<string, string> = {
  'advertising and marketing': 'реклама и маркетинг',
  'office expenses': 'офисные расходы',
  'software and subscriptions': 'софт и подписки',
  'professional services': 'профессиональные услуги',
  'business insurance': 'страхование бизнеса',
  'bank and payment processing fees': 'банковские комиссии',
  'business travel': 'деловые поездки',
  'eligible business meals': 'деловые обеды',
  'equipment and supplies': 'оборудование',
  rent: 'аренда',
  utilities: 'коммунальные',
  'telephone and internet': 'телефон и интернет',
  'education and training': 'обучение',
  'vehicle expenses': 'расходы на авто',
  'depreciation and section 179': 'амортизация и §179',
  'other eligible business expenses': 'прочие деловые расходы',
};

const STEP_RU: Record<string, string> = {
  'Gross income': 'Общий доход',
  'Schedule C net profit': 'Чистая прибыль Schedule C',
  'Self-employment tax': 'Налог самозанятого',
  'Adjusted gross income': 'Скорректированный доход (AGI)',
  'Taxable income': 'Налогооблагаемый доход',
  'Income tax and credits': 'Подоходный налог и кредиты',
  'Federal total tax and net position': 'Итого федеральный налог',
};
const SCEN_RU: Record<string, string> = { baseline: 'базовый', confirmed: 'подтверждённый', potential: 'потенциальный' };

RU_PATTERNS.push(
  [/^We identified (\$[\d,.]+) spent at (.+?) \((.+?)\)\. What portion of this expenditure was directly for business use\?$/,
    (_, a, m, c) => `Мы нашли расходы ${a} в «${m}» (${CATEGORY_RU[c] ?? c}). Какая часть из них — для бизнеса?`],
  [/^Schedule C \((.+?)\) — (\d+) transaction\(s\)\.$/, (_, c, n) => `Schedule C (${CATEGORY_RU[c] ?? c}) — операций: ${n}.`],
  [/^\[(baseline|confirmed|potential)\] (\d)\. (.+)$/, (_, s, n, t) => `[${SCEN_RU[s]}] ${n}. ${STEP_RU[t] ?? t}`],
  [/^(\d+)\/(\d+) transactions have a recognised date and amount \(([\d.]+)%\)\. (\d+) row\(s\) need your confirmation and are left out of every total until confirmed\.$/,
    (_, a, b, p, n) => `Дата и сумма распознаны у ${a} из ${b} операций (${p}%). Ждут подтверждения: ${n} — они не входят в итоги.`],
  [/^All (\d+) detected duplicate\(s\) are strictly excluded from calculations\.$/, (_, n) => `Найденные дубли (${n}) исключены из расчёта.`],
  [/^Reconciled (\d+) document\(s\) with no missing page gaps\.$/, (_, n) => `Сверено документов: ${n}, пропущенных страниц нет.`],
  [/^(\d+) document\(s\) flagged with missing pages\.$/, (_, n) => `Документов с пропущенными страницами: ${n}.`],
  [/^Gross Income \((\$[\d,.]+)\) and Total Tax Liability \((\$[\d,.]+)\) reconcile to the cent\.$/, (_, a, b) => `Общий доход (${a}) и итоговый налог (${b}) сходятся до цента.`],
  [/^Verified active rule set (\S+) for tax year (\d{4})\.$/, (_, v, y) => `Действующие правила ${v} для ${y} года.`],
  [/^All (\d+) recommendation\(s\) carry explicit IRS citations, confidence scores, and calculation formulas\.$/, (_, n) => `У всех рекомендаций (${n}) есть ссылка на правило IRS, уверенность и формула расчёта.`]
);

export function translate(text: string, lang: Lang): string {
  if (lang === 'en' || !text) return text;
  const lead = text.match(/^\s*/)?.[0] ?? '';
  const trail = text.match(/\s*$/)?.[0] ?? '';
  const core = text.trim().replace(/\s+/g, ' ');
  if (!core) return text;
  const hit = RU[core];
  if (hit !== undefined) return lead + hit + trail;
  for (const [re, fn] of RU_PATTERNS) {
    const m = core.match(re);
    if (m) return lead + fn(...(m as unknown as string[])) + trail;
  }
  return text;
}
