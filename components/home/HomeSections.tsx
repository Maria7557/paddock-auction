import type { ReactNode } from "react";
import Image from "next/image";
import Link from "next/link";

import {
  IconArrowRight,
  IconBuilding,
  IconCalendar,
  IconCar,
  IconCheck,
  IconEye,
  IconFile,
  IconMapPin,
  IconShield,
  IconTag,
  IconUsers,
  IconX,
  IconZap,
} from "@/components/ui/icons";
import { toIntlLocale, type SupportedLocale, withLocalePath } from "@/src/i18n/routing";
import { formatInteger, formatMoneyFromAed, type DisplaySettings } from "@/src/lib/money";
import type { AuctionWeekEvent } from "@/src/types/auction";

import WeekCountdown from "./WeekCountdown";
import styles from "./HomeSections.module.css";

type LocaleProps = {
  locale?: SupportedLocale;
};

const CATEGORY_RU: Record<string, { label: string; sub: string }> = {
  luxury: { label: "Премиум-класс", sub: "Bentley, Rolls-Royce, Maserati" },
  suv: { label: "SUV", sub: "G-Wagon, Land Cruiser, Patrol" },
  sedan: { label: "Седаны", sub: "Elantra, Camry, Accord" },
  sports: { label: "Спорт и суперкары", sub: "McLaren, Mustang, Ferrari" },
};

const SELL_STEPS_EN = [
  { t: "Register company", s: "UAE trade license + company details" },
  { t: "Submit vehicle with start price", s: "Mulkiya, service history, photos" },
  { t: "Deliver vehicle 48h before auction", s: "Dubai warehouse · we handle inspection" },
  { t: "Participate in weekly event", s: "Watch live bids on your vehicles" },
  { t: "Approve winning bid", s: "Buyer settles within 48h · direct transfer" },
];

const SELL_STEPS_RU = [
  { t: "Зарегистрируйте компанию", s: "Лицензия ОАЭ + данные компании" },
  { t: "Добавьте авто со стартовой ценой", s: "Mulkiya, сервисная история, фото" },
  { t: "Доставьте авто за 48ч до аукциона", s: "Склад в Дубае · инспекцию проводим мы" },
  { t: "Участвуйте в еженедельном событии", s: "Следите за ставками по своим авто в реальном времени" },
  { t: "Подтвердите победившую ставку", s: "Покупатель оплачивает за 48ч · прямой перевод" },
];

const TRUST_ITEMS_EN = [
  {
    icon: <IconEye size={16} color="#fff" />,
    title: "Transparent bidding process",
    text: "Full bid history visible. No hidden reserve. Real-time position updates.",
  },
  {
    icon: <IconShield size={16} color="#fff" />,
    title: "Verified fleet operators only",
    text: "Every seller is a UAE-registered rental company.",
  },
  {
    icon: <IconCalendar size={16} color="#fff" />,
    title: "Structured weekly events",
    text: "Predictable calendar. Plan your sourcing weeks in advance.",
  },
  {
    icon: <IconMapPin size={16} color="#fff" />,
    title: "Physical inspection access",
    text: "Viewing slots available 48h before every auction.",
  },
  {
    icon: <IconFile size={16} color="#fff" />,
    title: "Export-ready inventory",
    text: "Dubai Customs clearance on eligible lots. GCC and international.",
  },
];

const TRUST_ITEMS_RU = [
  {
    icon: <IconEye size={16} color="#fff" />,
    title: "Прозрачный процесс торгов",
    text: "Полная история ставок, без скрытого резерва, обновления в реальном времени.",
  },
  {
    icon: <IconShield size={16} color="#fff" />,
    title: "Только проверенные флит-операторы",
    text: "Каждый продавец — зарегистрированная в ОАЭ rental-компания.",
  },
  {
    icon: <IconCalendar size={16} color="#fff" />,
    title: "Структурированные еженедельные события",
    text: "Предсказуемый календарь для планирования закупок.",
  },
  {
    icon: <IconMapPin size={16} color="#fff" />,
    title: "Доступ к физическому осмотру",
    text: "Слоты просмотра доступны за 48 часов до каждого аукциона.",
  },
  {
    icon: <IconFile size={16} color="#fff" />,
    title: "Инвентарь, готовый к экспорту",
    text: "Таможенная очистка Дубая для подходящих лотов. GCC и экспорт.",
  },
];

export function WhatSection({ locale = "en" }: LocaleProps) {
  const isRu = locale === "ru";

  const cards = isRu
    ? [
        {
          icon: <IconBuilding size={18} color="var(--green-600)" />,
          cls: "g",
          title: "Институциональный источник",
          text: "Авто из рентал-компаний ОАЭ в плановой замене автопарка.",
        },
        {
          icon: <IconCalendar size={18} color="var(--blue-600)" />,
          cls: "b",
          title: "Еженедельные структурированные события",
          text: "Регулярные аукционы по расписанию, которые можно планировать заранее.",
        },
        {
          icon: <IconEye size={18} color="var(--green-600)" />,
          cls: "g",
          title: "Полная прозрачность",
          text: "История ставок, инспекция и документы обслуживания до начала торгов.",
        },
        {
          icon: <IconShield size={18} color="var(--amber-600)" />,
          cls: "a",
          title: "Торги с депозитом",
          text: "Возвратный депозит 5 000 AED. Только серьёзные участники.",
        },
      ]
    : [
        {
          icon: <IconBuilding size={18} color="var(--green-600)" />,
          cls: "g",
          title: "Institutional Fleet Source",
          text: "Vehicles from UAE rental companies in scheduled replacement — not unknown provenance.",
        },
        {
          icon: <IconCalendar size={18} color="var(--blue-600)" />,
          cls: "b",
          title: "Weekly Structured Events",
          text: "Regular, calendar-based auctions. Plan your bidding weeks in advance.",
        },
        {
          icon: <IconEye size={18} color="var(--green-600)" />,
          cls: "g",
          title: "Full Transparency",
          text: "Real-time bid history, inspection reports, service docs — all visible before you bid.",
        },
        {
          icon: <IconShield size={18} color="var(--amber-600)" />,
          cls: "a",
          title: "Deposit-Enforced Bidding",
          text: "5,000 AED refundable deposit. Only serious buyers. No price manipulation.",
        },
      ];

  return (
    <section className={`${styles.sec} ${styles.white}`}>
      <div className={`container ${styles.twoCol}`}>
        <div>
          <div className="eyebrow">{isRu ? "О платформе" : "About the Platform"}</div>
          <h2 className={`section-h2 ${styles.mb16}`}>{isRu ? "Что такое FleetBid?" : "What Is FleetBid?"}</h2>
          <p className={styles.body}>
            {isRu
              ? "FleetBid — это еженедельная аукционная платформа для институциональных автомобилей из rental-сегмента ОАЭ."
              : "FleetBid is a structured weekly auction platform for institutional fleet vehicles operating in the UAE rental market."}
          </p>
          <p className={styles.body} style={{ marginTop: 12 }}>
            {isRu
              ? "Мы агрегируем действующий рентал-инвентарь в цикле плановой замены и соединяем его с проверенными покупателями в прозрачном формате событийных торгов."
              : "We aggregate active rental inventory entering scheduled replacement cycles and connect it with verified buyers through transparent, event-based liquidation."}
          </p>
          <p className={styles.body} style={{ marginTop: 12 }}>
            <strong>
              {isRu
                ? "Все автомобили — рабочие fleet-единицы, а не страховые списания и не повреждённый сток."
                : "All vehicles are operational fleet units — not insurance write-offs, not damaged stock."}
            </strong>
          </p>
          <div className={styles.ctas} style={{ marginTop: 28 }}>
            <Link href={withLocalePath("/auctions", locale)} className="btn btn-primary">
              {isRu ? "Смотреть аукционы" : "Browse Auctions"}
            </Link>
            <Link href="/register" className="btn btn-outline">
              {isRu ? "Зарегистрироваться как покупатель" : "Register as Buyer"}
            </Link>
          </div>
        </div>

        <div className={styles.cards}>
          {cards.map((card, index) => (
            <div key={index} className={styles.whatCard}>
              <div className={`${styles.whatIcon} ${styles[card.cls]}`}>{card.icon}</div>
              <div>
                <div className={styles.cardTitle}>{card.title}</div>
                <div className={styles.cardText}>{card.text}</div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

export function WhySection({ locale = "en" }: LocaleProps) {
  const isRu = locale === "ru";

  const yesItems = isRu
    ? [
        "Полностью обслуженные автомобили из rental-парков",
        "Прозрачная сервисная история",
        "Эксплуатация в рынке проката ОАЭ",
        "Рабочее состояние на момент аукциона",
        "Физический осмотр перед каждым событием",
        "Готовность к экспорту и clearance в Дубае",
      ]
    : [
        "Fully serviced rental fleet vehicles",
        "Transparent maintenance history included",
        "Operated in UAE rental market",
        "Road-ready condition at time of auction",
        "Physical inspection access before every auction",
        "Export-ready with Dubai Customs clearance",
      ];

  const noItems = isRu
    ? ["Без страховых списаний", "Без damaged liquidation stock", "Без непрозрачного происхождения"]
    : ["No insurance write-offs", "No damaged liquidation stock", "No unknown vehicle provenance"];

  return (
    <section className={`${styles.sec} ${styles.dark}`}>
      <div className={`container ${styles.twoCol}`}>
        <div>
          <div className="eyebrow eyebrow-white">{isRu ? "Наш инвентарь" : "Our Inventory"}</div>
          <h2 className={`section-h2 section-h2-white ${styles.mb16}`}>
            {isRu ? (
              <>
                Не страховые списания.
                <br />
                Не salvage.
              </>
            ) : (
              <>
                Not Insurance.
                <br />
                Not Salvage.
              </>
            )}
          </h2>
          <p className={styles.bodyWhite}>
            {isRu
              ? "Большинство аукционных площадок работает с повреждёнными авто или insurance write-off. FleetBid построен на другом источнике инвентаря."
              : "Most vehicle auction platforms aggregate damaged or insurance write-off stock. FleetBid is built around a fundamentally different inventory source."}
          </p>
          <div className={styles.ctas} style={{ marginTop: 28 }}>
            <Link href={withLocalePath("/auctions", locale)} className="btn btn-white">
              {isRu ? "Смотреть инвентарь" : "Browse Inventory"}
            </Link>
            <Link href="/how-it-works" className="btn btn-ghost-white">
              {isRu ? "Смотреть отчёты инспекции" : "View Inspection Reports"}
            </Link>
          </div>
        </div>

        <div className={styles.whyList}>
          {yesItems.map((text) => (
            <div key={text} className={`${styles.whyItem} ${styles.yes}`}>
              <div className={`${styles.whyCheck} ${styles.checkYes}`}>
                <IconCheck size={12} color="#fff" />
              </div>
              <span>{text}</span>
            </div>
          ))}
          <div className={styles.divider} />
          {noItems.map((text) => (
            <div key={text} className={`${styles.whyItem} ${styles.no}`}>
              <div className={`${styles.whyCheck} ${styles.checkNo}`}>
                <IconX size={12} color="rgba(255,255,255,0.2)" />
              </div>
              <span>{text}</span>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

export function HowSection({ locale = "en" }: LocaleProps) {
  const isRu = locale === "ru";

  const buyerSteps = isRu
    ? [
        { t: "Создайте аккаунт", s: "Данные компании + лицензия ОАЭ. Одобрение до 24 часов." },
        { t: "Оплатите возвратный депозит 5 000 AED", s: "Возврат в течение 24ч, если не выиграли." },
        { t: "Получите доступ к еженедельным аукционам", s: "Смотрите инвентарь и бронируйте осмотр." },
        { t: "Ставьте в реальном времени", s: "Ставка юридически обязательна, статус виден сразу." },
        { t: "Оплатите в течение 48 часов", s: "Инвойс формируется сразу, экспортные документы включены." },
      ]
    : [
        { t: "Create account", s: "Company details + UAE trade license. Approved within 24h." },
        { t: "Pay 5,000 AED refundable deposit", s: "Released within 24h if you don't win." },
        { t: "Access weekly auctions", s: "Browse inventory, book physical inspection." },
        { t: "Bid in real time", s: "Legally binding. See your position instantly." },
        { t: "Settle within 48h", s: "Invoice issued immediately. Export docs included." },
      ];

  const sellerSteps = isRu
    ? [
        { t: "Зарегистрируйте компанию", s: "Лицензия + данные компании." },
        { t: "Добавьте автомобиль со стартовой ценой", s: "Mulkiya, сервисная история, фото." },
        { t: "Доставьте авто за 48ч до аукциона", s: "Склад в Дубае · инспекцию делаем мы." },
        { t: "Участвуйте в еженедельном событии", s: "Следите за ставками онлайн." },
        { t: "Подтвердите продажу и получите оплату", s: "Покупатель платит за 48ч. Перевод напрямую." },
      ]
    : [
        { t: "Register company", s: "Trade license + company details." },
        { t: "Submit vehicle with start price", s: "Mulkiya, service history, photos." },
        { t: "Deliver vehicle 48h before auction", s: "Dubai warehouse · we handle inspection." },
        { t: "Participate in weekly event", s: "Watch live bids in real time." },
        { t: "Approve & receive payment", s: "Buyer settles in 48h. Funds transferred directly." },
      ];

  return (
    <section className={`${styles.sec} ${styles.subtle}`}>
      <div className="container">
        <div className={styles.centreHead}>
          <div className="eyebrow">{isRu ? "Простой процесс" : "Simple Process"}</div>
          <h2 className="section-h2" style={{ marginTop: 6 }}>
            {isRu ? "Как работает FleetBid" : "How FleetBid Works"}
          </h2>
        </div>
        <div className={styles.howGrid}>
          <div className={styles.howBlock}>
            <div className={styles.howHead}>
              <div className={`${styles.howIcon} ${styles.iconGreen}`}>
                <IconUsers size={20} color="var(--green-600)" />
              </div>
              <div>
                <div className={styles.blockTitle}>{isRu ? "Для покупателей" : "For Buyers"}</div>
                <div className={styles.blockSub}>{isRu ? "Проверенные дилеры и экспортёры" : "Verified dealers & export traders"}</div>
              </div>
            </div>
            {buyerSteps.map((step, index) => (
              <div key={index} className={styles.step}>
                <div className={`${styles.num} ${styles.numGreen}`}>{index + 1}</div>
                <div>
                  <div className={styles.stepTitle}>{step.t}</div>
                  <div className={styles.stepSub}>{step.s}</div>
                </div>
              </div>
            ))}
            <Link href="/register" className={`btn btn-primary btn-full ${styles.blockCta}`}>
              {isRu ? "Начать торги" : "Start Bidding"}
            </Link>
          </div>

          <div className={styles.howBlock}>
            <div className={styles.howHead}>
              <div className={`${styles.howIcon} ${styles.iconBlue}`}>
                <IconCar size={20} color="var(--blue-600)" />
              </div>
              <div>
                <div className={styles.blockTitle}>{isRu ? "Для fleet-компаний" : "For Fleet Companies"}</div>
                <div className={styles.blockSub}>{isRu ? "Рентал-операторы и fleet-менеджеры" : "Rental operators & fleet managers"}</div>
              </div>
            </div>
            {sellerSteps.map((step, index) => (
              <div key={index} className={styles.step}>
                <div className={`${styles.num} ${styles.numBlue}`}>{index + 1}</div>
                <div>
                  <div className={styles.stepTitle}>{step.t}</div>
                  <div className={styles.stepSub}>{step.s}</div>
                </div>
              </div>
            ))}
            <Link href="/register?role=seller" className={`btn btn-blue btn-full ${styles.blockCta}`}>
              {isRu ? "Выставить автомобиль" : "List Your Vehicle"}
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
}

export function WeekSection({ event, display }: { event: AuctionWeekEvent; display: DisplaySettings }) {
  const isRu = display.locale === "ru";
  const dateStr = new Date(event.date).toLocaleDateString(toIntlLocale(display.locale), {
    day: "numeric",
    month: "long",
    year: "numeric",
  });

  return (
    <section className={`${styles.sec} ${styles.green}`}>
      <div className={`container ${styles.twoCol}`}>
        <div>
          <div className={`eyebrow eyebrow-white ${styles.liveEyebrow}`}>
            <span className="live-dot" />
            {isRu ? "Ближайшее событие" : "Upcoming Event"}
          </div>
          <h2 className={`section-h2 section-h2-white ${styles.weekH2}`}>
            {isRu ? (
              <>
                Аукцион
                <br />
                этой недели
              </>
            ) : (
              <>
                This Week&apos;s
                <br />
                Auction
              </>
            )}
          </h2>
          <div className={styles.weekDate}>{dateStr} — 15:00 GST</div>

          {[
            { icon: <IconMapPin size={14} color="#fff" />, text: event.location },
            {
              icon: <IconEye size={14} color="#fff" />,
              text: isRu ? "Осмотр: 4–5 марта, 10:00–17:00" : "Inspection: 4–5 March, 10:00–17:00",
            },
            {
              icon: <IconCar size={14} color="#fff" />,
              text: isRu
                ? `${formatInteger(event.lotCount, display.locale)} лотов подтверждено · SUV, седаны, премиум`
                : `${formatInteger(event.lotCount, display.locale)} lots confirmed · SUVs, Sedans, Luxury`,
            },
            {
              icon: <IconTag size={14} color="#fff" />,
              text: isRu
                ? `Стартовые ставки от ${formatMoneyFromAed(event.startingFromAed, display)}`
                : `Starting bids from ${formatMoneyFromAed(event.startingFromAed, display)}`,
            },
          ].map((detail, index) => (
            <div key={index} className={styles.weekDetail}>
              <div className={styles.weekDetailIcon}>{detail.icon}</div>
              {detail.text}
            </div>
          ))}

          <div className={styles.ctas} style={{ marginTop: 24 }}>
            <Link href={withLocalePath("/auctions", display.locale)} className="btn btn-white btn-lg">
              {isRu ? "Смотреть инвентарь" : "View Inventory"}
            </Link>
            <Link href="/register?action=inspection" className="btn btn-ghost-white btn-lg">
              {isRu ? "Запланировать осмотр" : "Schedule Inspection"}
            </Link>
          </div>
        </div>

        <WeekCountdown auctionDate={event.date} locale={display.locale} />
      </div>
    </section>
  );
}

export function CatsSection({
  categories,
  locale = "en",
}: {
  categories: { slug: string; label: string; sub: string; image: string }[];
  locale?: SupportedLocale;
}) {
  const isRu = locale === "ru";

  return (
    <section className={`${styles.sec} ${styles.white}`}>
      <div className="container">
        <div className={styles.centreHead}>
          <div className="eyebrow">{isRu ? "Инвентарь" : "Inventory"}</div>
          <h2 className="section-h2" style={{ marginTop: 6 }}>
            {isRu ? "Выбор по категориям" : "Explore by Category"}
          </h2>
        </div>
        <div className={styles.catsGrid}>
          {categories.map((category) => {
            const translated = CATEGORY_RU[category.slug];
            const label = isRu && translated ? translated.label : category.label;
            const sub = isRu && translated ? translated.sub : category.sub;

            return (
              <Link key={category.slug} href={withLocalePath(`/auctions?category=${category.slug}`, locale)} className={styles.catCard}>
                <Image src={category.image} alt={label} fill sizes="300px" style={{ objectFit: "cover" }} />
                <div className={styles.catOverlay} />
                <div className={styles.catContent}>
                  <div className={styles.catTitle}>{label}</div>
                  <div className={styles.catSub}>{sub}</div>
                  <div className={styles.catCta}>
                    {isRu ? "Смотреть категорию" : "View Category"} <IconArrowRight size={12} color="#fff" />
                  </div>
                </div>
              </Link>
            );
          })}
        </div>
      </div>
    </section>
  );
}

export function SellSection({ locale = "en" }: LocaleProps) {
  const isRu = locale === "ru";
  const sellSteps = isRu ? SELL_STEPS_RU : SELL_STEPS_EN;

  return (
    <section id="sell" className={`${styles.sec} ${styles.subtle}`}>
      <div className={`container ${styles.twoCol}`}>
        <div>
          <div className="eyebrow eyebrow-green">{isRu ? "Для fleet-операторов" : "For Fleet Operators"}</div>
          <h2 className={`section-h2 ${styles.mb16}`}>{isRu ? "Продавайте с FleetBid" : "Sell with FleetBid"}</h2>
          <p className={styles.body}>
            {isRu
              ? "В Дубае более 5 000 rental-операторов, которые регулярно обновляют автопарк. FleetBid даёт структурированную еженедельную ликвидацию с прозрачным ценообразованием и гарантированным расчётом."
              : "Dubai hosts over 5,000 rental operators refreshing fleets yearly. FleetBid aggregates structured weekly liquidation — giving you competitive, transparent pricing and guaranteed settlement."}
          </p>
          <div className={styles.ctas} style={{ marginTop: 22, marginBottom: 0 }}>
            <Link href="/register?role=seller" className="btn btn-primary">
              {isRu ? "Выставить автомобиль" : "List Your Vehicle"}
            </Link>
            <Link href="/how-it-works" className="btn btn-outline">
              {isRu ? "Связаться с командой" : "Talk to Our Team"}
            </Link>
          </div>
          <div className={styles.sellStats}>
            {((isRu
              ? [
                  ["5,000+", "rental-операторов ОАЭ"],
                  ["Еженедельно", "структурированные аукционы"],
                  ["48ч", "срок расчёта"],
                  ["850+", "активных проверенных покупателей"],
                ]
              : [
                  ["5,000+", "UAE rental operators"],
                  ["Weekly", "Structured auction events"],
                  ["48h", "Payment settlement"],
                  ["850+", "Active verified buyers"],
                ]) as Array<[string, string]>).map(([value, label]) => (
              <div key={label} className={styles.sellStat}>
                <div className={styles.sellStatVal}>{value}</div>
                <div className={styles.sellStatLbl}>{label}</div>
              </div>
            ))}
          </div>
        </div>

        <div className={styles.sellCard}>
          <div className={styles.sellCardTitle}>{isRu ? "Как выставить автомобиль" : "How to List Your Vehicle"}</div>
          {sellSteps.map((step, index) => (
            <div key={index} className={styles.step}>
              <div className={`${styles.num} ${styles.numGreen}`}>{index + 1}</div>
              <div>
                <div className={styles.stepTitle}>{step.t}</div>
                <div className={styles.stepSub}>{step.s}</div>
              </div>
            </div>
          ))}
          <Link href="/register?role=seller" className={`btn btn-primary btn-full ${styles.blockCta}`}>
            {isRu ? "Выставить автомобиль" : "List Your Vehicle"}
          </Link>
        </div>
      </div>
    </section>
  );
}

export function TrustSection({ locale = "en" }: LocaleProps) {
  const isRu = locale === "ru";
  const trustItems = isRu ? TRUST_ITEMS_RU : TRUST_ITEMS_EN;

  const badges = isRu
    ? [
        {
          id: "reg",
          icon: <IconShield size={14} color="rgba(255,255,255,0.3)" />,
          text: "UAE TRA Registration · TL-2022-88441",
        },
        {
          id: "ssl",
          icon: <IconZap size={14} color="rgba(255,255,255,0.3)" />,
          text: "SSL + PCI-DSS через Stripe",
        },
        {
          id: "legal",
          icon: <IconFile size={14} color="rgba(255,255,255,0.3)" />,
          text: "Юридически обязательные условия · право ОАЭ",
        },
        {
          id: "hq",
          icon: <IconBuilding size={14} color="rgba(255,255,255,0.3)" />,
          text: "Dubai Silicon Oasis · FZE entity",
        },
      ]
    : [
        {
          id: "reg",
          icon: <IconShield size={14} color="rgba(255,255,255,0.3)" />,
          text: "UAE TRA Registered · TL-2022-88441",
        },
        {
          id: "ssl",
          icon: <IconZap size={14} color="rgba(255,255,255,0.3)" />,
          text: "SSL Secured · PCI-DSS via Stripe",
        },
        {
          id: "legal",
          icon: <IconFile size={14} color="rgba(255,255,255,0.3)" />,
          text: "Legally binding terms — UAE law",
        },
        {
          id: "hq",
          icon: <IconBuilding size={14} color="rgba(255,255,255,0.3)" />,
          text: "Dubai Silicon Oasis · FZE entity",
        },
      ];

  return (
    <section className={`${styles.sec} ${styles.dark}`}>
      <div className={`container ${styles.twoCol}`}>
        <div>
          <div className="eyebrow eyebrow-white">{isRu ? "Почему мы" : "Why Choose Us"}</div>
          <h2 className={`section-h2 section-h2-white ${styles.mb16}`}>
            {isRu ? (
              <>
                Создано для
                <br />
                профессиональных покупателей
              </>
            ) : (
              <>
                Built for
                <br />
                Professional Buyers
              </>
            )}
          </h2>
          <p className={styles.bodyWhite} style={{ marginBottom: 28 }}>
            {isRu
              ? "FleetBid спроектирован для институциональных покупателей, которым важны надёжный инвентарь, прозрачный процесс и гарантированное исполнение сделки."
              : "Every aspect of FleetBid is designed for institutional buyers who need reliable inventory, transparent process, and guaranteed execution."}
          </p>
          <div className={styles.trustItems}>
            {trustItems.map((item) => (
              <div key={item.title} className={styles.trustRow}>
                <div className={styles.trustIco}>{item.icon}</div>
                <div>
                  <div className={styles.trustTitle}>{item.title}</div>
                  <div className={styles.trustText}>{item.text}</div>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className={styles.ctaBox}>
          <div className={styles.ctaH3}>{isRu ? "Создайте аккаунт" : "Create Your Account"}</div>
          <div className={styles.ctaSub}>
            {isRu
              ? "Присоединяйтесь к 850+ проверенным fleet-покупателям. Регистрация занимает меньше 5 минут."
              : "Join 850+ verified fleet buyers. Registration takes under 5 minutes."}
          </div>
          <Link href="/register" className="btn btn-primary btn-lg btn-full">
            {isRu ? "Создать аккаунт" : "Create Account"}
          </Link>
          <div className={styles.badges}>
            {badges.map((badge) => (
              <div key={badge.id} className={styles.badge}>
                <span className={styles.badgeIco}>{badge.icon as ReactNode}</span>
                {badge.text}
              </div>
            ))}
          </div>
          <div className={styles.quote}>
            <div className={styles.quoteText}>
              {isRu
                ? '"FleetBid даёт нам прозрачное, конкурентное ценообразование при распродаже автопарка. Процесс чистый, а покупатели действительно целевые."'
                : '"FleetBid gives us transparent, competitive pricing on fleet disposals. The process is clean and the buyers are serious."'}
            </div>
            <div className={styles.quoteAttr}>
              {isRu ? "— Операционный директор, Emirates Fleet Group" : "— Operations Director, Emirates Fleet Group"}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
