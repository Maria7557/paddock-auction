# CODEX.md — FleetBid UI Context
# Читай этот файл ПЕРВЫМ перед любой UI-задачей.
# Он заменяет TECH_RULES, TECH_PLAN и FRONTEND_UI_SYSTEM для фронтенд-работы.

---

## Что такое FleetBid

B2B аукционная платформа для флотовых автомобилей в ОАЭ.
Рент-а-кар компании продают машины дилерам через еженедельные аукционы.

Стек: Next.js App Router · TypeScript · Prisma · PostgreSQL · Redis · Stripe  
Репо: Maria7557/paddock-auction · Локально: /Users/Caro/Documents/paddock-auction

---

## Ключевые бизнес-правила (влияют на UI)

| Правило | Что показывать в UI |
|---|---|
| INV-01: депозит AED 5,000 до первой ставки | BidPanel заблокирован без депозита → ссылка на /wallet |
| Дедлайн оплаты 48h после победы | CountdownTimer красный при < 24h |
| Anti-sniping: поздние ставки продлевают аукцион | Показывать "Extended" статус |
| Без аккаунта = только просмотр | Показывать login notice в BidPanel |

Статусы аукциона: `DRAFT → SCHEDULED → LIVE → EXTENDED → PAYMENT_PENDING → ENDED / DEFAULTED`

---

## ДИЗАЙН-СИСТЕМА — источник правды

### Шрифты
```css
font-family: var(--font-sans);   /* Space Grotesk — весь UI */
font-family: var(--font-mono);   /* IBM Plex Mono — цены, коды, мета */
```
❌ НИКОГДА не использовать: Inter, Roboto, Arial, system-ui

### CSS-переменные — ВСЕГДА использовать var(), НИКОГДА не хардкодить hex

```css
/* Текст */
--ink-primary:   #1f2933   /* заголовки, ключевые значения */
--ink-secondary: #556270   /* основной текст */
--ink-muted:     #7b8794   /* метки, плейсхолдеры, мета */

/* Фоны */
--bg-page:   #f8f9fb   /* фон страницы */
--bg-card:   #ffffff   /* карточки, панели */
--bg-subtle: #f3f5f7   /* вторичные поверхности, строки таблиц */

/* Границы */
--line-soft:   #e5e9ef   /* границы карточек, разделители */
--line-strong: #d9dee6   /* инпуты, более заметные границы */

/* Бренд */
--green-600: #116a43   /* PRIMARY: CTA, активные состояния */
--green-700: #0d5a39   /* hover на зелёных элементах */
--green-100: #e8f4ee   /* зелёный тинт, фон бейджей */

/* Семантика */
--red-600:   #b43d36   --red-100:   #fae8e7   /* ошибка, просроченное */
--amber-600: #9b6914   --amber-100: #f6ead4   /* предупреждение, pending */
--blue-600:  #1d4ed8   --blue-100:  #eff6ff   /* scheduled, info */
```

### Отступы
```css
--space-1: 8px   --space-2: 12px  --space-3: 16px  --space-4: 24px
--space-5: 32px  --space-6: 40px  --space-7: 56px
```

### Скругления и тени
```css
--radius-card:    16px    /* карточки, панели */
--radius-control: 12px    /* инпуты, кнопки, мелкие карточки */
--radius-pill:    999px   /* бейджи, теги, pill-кнопки */

--shadow-soft: 0 6px 22px rgba(15,23,42,0.06)    /* дефолтные карточки */
--shadow-lift: 0 12px 28px rgba(15,23,42,0.08)   /* sticky панели, hover */
```

### Контейнер
```css
width: min(1280px, calc(100% - 48px)); margin: 0 auto;
/* или className="container" */
```

### Брейкпоинты
```css
@media (max-width: 1100px) { /* широкий планшет */ }
@media (max-width: 980px)  { /* планшет / одна колонка */ }
@media (max-width: 600px)  { /* мобайл */ }
```

---

## Глобальные utility-классы (из globals.css)

```html
<!-- Кнопки -->
<button class="btn btn-primary">         <!-- зелёный CTA -->
<button class="btn btn-primary btn-lg">  <!-- большой -->
<button class="btn btn-primary btn-sm">  <!-- малый -->
<button class="btn btn-primary btn-full"><!-- на всю ширину -->
<button class="btn btn-outline">         <!-- bordered нейтральный -->
<button class="btn btn-ghost-white">     <!-- ghost на тёмном фоне -->
<button class="btn btn-white">           <!-- белый на тёмном фоне -->
<button class="btn btn-blue">            <!-- синий action -->

<!-- Пиллы / бейджи -->
<span class="pill pill-live"><span class="live-dot"></span>LIVE</span>
<span class="pill pill-sched">Scheduled</span>
<span class="pill pill-green">Active</span>
<span class="pill pill-dark">Lot #1024</span>

<!-- Текст -->
<div class="eyebrow">Small uppercase label</div>
<div class="eyebrow eyebrow-green">Green label</div>
<div class="eyebrow eyebrow-white">White label (dark bg)</div>
<h2 class="section-h2">Section Heading</h2>
<h2 class="section-h2 section-h2-white">White Heading</h2>

<!-- Живая точка -->
<span class="live-dot"></span>           <!-- белая пульсирующая (внутри pill-live) -->
<span class="live-dot live-dot-green"></span> <!-- зелёная -->
```

---

## Паттерны компонентов — копировать точно

### Секция с заголовком
```tsx
<div className={styles.section}>
  <div className={styles.sectionTitle}>Название секции</div>
  {/* содержимое */}
</div>
```
```css
.section {
  background: var(--bg-card);
  border: 1px solid var(--line-soft);
  border-radius: var(--radius-card);
  overflow: hidden;
}
.sectionTitle {
  font-size: 14px; font-weight: 700; color: var(--ink-primary);
  padding: 16px 20px;
  border-bottom: 1px solid var(--line-soft);
  background: var(--bg-subtle);
}
```

### Строка label + value
```css
.row {
  display: flex; padding: 12px 20px;
  border-bottom: 1px solid var(--line-soft); gap: 16px;
}
.rowLabel { flex: 0 0 160px; font-size: 13px; color: var(--ink-muted); }
.rowValue { flex: 1; font-size: 14px; font-weight: 500; color: var(--ink-primary); }
```

### Карточка
```css
.card {
  background: var(--bg-card);
  border: 1px solid var(--line-soft);
  border-radius: var(--radius-card);
  box-shadow: var(--shadow-soft);
  overflow: hidden;
}
```

### Тёмная секция (ink background)
```css
.darkSec { background: var(--ink-primary); }
/* текст: color: #fff или rgba(255,255,255,0.55) */
/* карточки внутри: background: rgba(255,255,255,0.05); border-color: rgba(255,255,255,0.1) */
```

### Зелёная секция (brand background)
```css
.greenSec { background: var(--green-600); }
/* текст: color: #fff или rgba(255,255,255,0.8) */
```

---

## Цвета по статусу аукциона

| Статус | Фон | Текст |
|---|---|---|
| LIVE | `var(--green-600)` | `#fff` |
| SCHEDULED | `var(--blue-100)` | `var(--blue-600)` |
| PAYMENT_PENDING | `var(--amber-100)` | `var(--amber-600)` |
| ENDED | `var(--bg-subtle)` | `var(--ink-muted)` |
| DEFAULTED | `var(--red-100)` | `var(--red-600)` |

---

## Утилиты (всегда использовать)

```ts
import { formatAed }        from '@/lib/utils';  // форматирование цены
import { formatCountdown }   from '@/lib/utils';  // обратный отсчёт

// ✅ Правильно:
formatAed(48000)  // → "AED 48,000"

// ❌ Неправильно:
`AED ${amount.toLocaleString()}`
```

---

## Структура файлов (обязательно соблюдать)

```
src/
  app/
    [route]/
      page.tsx          ← Server Component (без 'use client' по умолчанию)
      page.module.css   ← CSS только для этого роута
      loading.tsx       ← shimmer-скелетон (обязательно)
  components/
    [domain]/           ← lot/, auction/, home/, shell/, ui/
      Component.tsx
      Component.module.css
  types/
    auction.ts          ← AuctionStatus, Lot, LotDetail и т.д.
    lot.ts
  lib/
    utils.ts            ← formatAed, savingPct, formatCountdown
    data.ts             ← моки (заменить на fetch позже)
```

---

## Иконки — только SVG, никогда emoji

```tsx
import { IconCheck, IconArrowRight, IconShield, IconClock } from '@/components/ui/icons';

<IconCheck size={16} color="var(--green-600)" />
<IconArrowRight size={18} color="#fff" />
```

Доступные иконки: IconCheck, IconX, IconCalendar, IconMapPin, IconClock, IconArrowRight, IconShield, IconEye, IconUsers, IconCar, IconPercent, IconBuilding, IconTag, IconFile, IconZap

---

## Правила Server vs Client Components

```
Server Component (по умолчанию):
✅ Любая страница page.tsx
✅ Секции без интерактивности (SaleInfo, VehicleSpecs, BidHistory...)
✅ Layout компоненты
✅ Компоненты с fetch данных

Client Component ('use client' — только когда нужно):
✅ CountdownTimer (useState + setInterval)
✅ VehicleGallery (переключение фото)
✅ BidPanel (форма ставки, кнопки)
✅ MobileBidBar (sticky interactions)
✅ Всё с useState, useEffect, onClick
```

---

## Обязательно для каждой новой страницы

```tsx
// 1. SEO метаданные
export const metadata: Metadata = {
  title: 'Название страницы — FleetBid',
  description: '...',
};

// 2. Хлебные крошки
<nav>
  <Link href="/">Home</Link> › <Link href="/auctions">Auctions</Link> › Текущая
</nav>

// 3. loading.tsx с shimmer-скелетоном

// 4. Обработка пустых данных / 404
if (!data) notFound(); // или пустое состояние
```

---

## Запрещено — никогда не делать

```
❌ Хардкодить цвет:     color: #116a43  →  color: var(--green-600)
❌ Inline стили токенов: style={{ color: '#116a43' }}
❌ Tailwind классы (не установлен)
❌ Emoji в UI (только SVG иконки)
❌ Шрифты Inter, Roboto, Arial как основной
❌ localStorage / sessionStorage
❌ <form> теги (использовать onClick handlers)
❌ Сырой формат цены: AED {amount.toLocaleString()}  →  {formatAed(amount)}
❌ 'use client' без причины (useState/useEffect/onClick)
❌ any в TypeScript
❌ next/image без sizes prop
```

---

## Референсные компоненты (смотреть для примера)

При создании нового компонента — первым делом открой и посмотри:

| Что делаешь | Смотри пример |
|---|---|
| Карточка лота | `src/components/auction/LotCard.tsx` |
| Секция с лейблами | `src/components/lot/LotSections.tsx` |
| Sticky панель | `src/components/lot/BidPanel.tsx` |
| Скелетон | `src/components/lot/LotSkeleton.tsx` |
| Секции лендинга | `src/components/home/HomeSections.tsx` |
| SVG иконки | `src/components/ui/icons.tsx` |
| Тикер | `src/components/home/AuctionTicker.tsx` |

---

## Шаблон промпта для Кодека

Когда даёшь задачу Кодеку, добавляй в начале:

```
Контекст: FleetBid, Next.js App Router, TypeScript, CSS Modules.
Дизайн-система: Space Grotesk + IBM Plex Mono, var(--green-600) = #116a43.
Стиль: белые карточки, border 1px solid var(--line-soft), radius 16px, shadow-soft.
Используй паттерны из CODEX.md.

Задача: [твоя задача здесь]
```
