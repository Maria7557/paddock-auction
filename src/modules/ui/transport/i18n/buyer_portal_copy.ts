import type { SupportedLocale } from "@/src/i18n/routing";

type BuyerPortalCopy = {
  pages: {
    dashboardTitle: string;
    dashboardSubtitle: string;
    recentActivity: string;
    noActivity: string;
    myBidsTitle: string;
    myBidsSubtitle: string;
    watchlistTitle: string;
    watchlistSubtitle: string;
    walletTitle: string;
    walletSubtitle: string;
    invoicesTitle: string;
    invoicesSubtitle: string;
    paymentPendingTitle: string;
    paymentPendingSubtitle: string;
    invoiceDetailTitle: string;
    invoiceDetailSubtitle: string;
    backToPaymentPending: string;
  };
  dashboardCards: {
    aria: string;
    activeBids: string;
    watching: string;
    invoicesDue: string;
    depositBalance: string;
  };
  bidWatch: {
    ariaBids: string;
    ariaWatchlist: string;
    winning: string;
    outbid: string;
    myBid: string;
    highest: string;
    endsIn: string;
    openLot: string;
  };
  wallet: {
    availableBalance: string;
    lockedBalance: string;
    pendingWithdrawal: string;
    addFunds: string;
    withdraw: string;
    activeLockNote: string;
    activeLocks: string;
    transactionHistory: string;
    openPaymentPendingView: string;
    lockStatuses: {
      ACTIVE: string;
      RELEASED: string;
      BURNED: string;
    };
  };
  invoices: {
    aria: string;
    invoiceLabel: string;
    total: string;
    due: string;
    countdown: string;
    openInvoice: string;
  };
  paymentPending: {
    title: string;
    subtitle: string;
    aria: string;
    winner: string;
    total: string;
    due: string;
    countdown: string;
    idempotencyKey: string;
    idempotencyRequired: string;
    requestRejected: string;
    intentReplayed: string;
    intentCreated: string;
    networkRetry: string;
    submitting: string;
    payNow: string;
    regenerateKey: string;
  };
  invoiceDetail: {
    overdueBanner: string;
    invoiceLabel: string;
    winningAmount: string;
    commission: string;
    vat: string;
    total: string;
    dueDate: string;
    timeLeft: string;
    idempotencyKey: string;
    idempotencyRequired: string;
    intentCreationFailed: string;
    intentReplayed: string;
    intentCreated: string;
    existingIntentFallback: string;
    readyFallback: string;
    networkRetry: string;
    submitting: string;
    payNow: string;
    regenerateKey: string;
  };
};

const COPY: Record<SupportedLocale, BuyerPortalCopy> = {
  en: {
    pages: {
      dashboardTitle: "Buyer dashboard",
      dashboardSubtitle: "Track active bidding, watchlist demand, and upcoming payment actions.",
      recentActivity: "Recent activity",
      noActivity: "No activity yet.",
      myBidsTitle: "My bids",
      myBidsSubtitle: "Follow winning and outbid positions in real time.",
      watchlistTitle: "Watchlist",
      watchlistSubtitle: "Keep high-potential lots close and enter quickly when timing is right.",
      walletTitle: "Wallet",
      walletSubtitle: "Fund participation, manage locks, and request withdrawals from one place.",
      invoicesTitle: "Invoices",
      invoicesSubtitle: "Track due invoices and resolve payment actions before the 48h deadline.",
      paymentPendingTitle: "Payment pending view",
      paymentPendingSubtitle: "Complete winner payments on time to avoid default and deposit burn consequences.",
      invoiceDetailTitle: "Invoice detail",
      invoiceDetailSubtitle: "Review totals and complete payment before policy deadline.",
      backToPaymentPending: "Back to payment pending",
    },
    dashboardCards: {
      aria: "Dashboard summary",
      activeBids: "Active bids",
      watching: "Watching",
      invoicesDue: "Invoices due",
      depositBalance: "Deposit balance",
    },
    bidWatch: {
      ariaBids: "My bids",
      ariaWatchlist: "Watchlist",
      winning: "Winning",
      outbid: "Outbid",
      myBid: "My bid",
      highest: "Highest",
      endsIn: "Ends in",
      openLot: "Open lot",
    },
    wallet: {
      availableBalance: "Available balance",
      lockedBalance: "Locked balance",
      pendingWithdrawal: "Pending withdrawal",
      addFunds: "Add Funds",
      withdraw: "Withdraw",
      activeLockNote: "Active auction participation locks deposit temporarily.",
      activeLocks: "Active locks",
      transactionHistory: "Transaction history",
      openPaymentPendingView: "Open payment pending view",
      lockStatuses: {
        ACTIVE: "Active",
        RELEASED: "Released",
        BURNED: "Burned",
      },
    },
    invoices: {
      aria: "Invoices",
      invoiceLabel: "Invoice",
      total: "Total",
      due: "Due",
      countdown: "Countdown",
      openInvoice: "Open invoice",
    },
    paymentPending: {
      title: "Payment pending",
      subtitle: "Pay within 48h to avoid default and deposit burn policy.",
      aria: "Pending invoices",
      winner: "Winner",
      total: "Total",
      due: "Due",
      countdown: "Countdown",
      idempotencyKey: "Idempotency-Key",
      idempotencyRequired: "Idempotency-Key is required.",
      requestRejected: "Payment intent request rejected.",
      intentReplayed: "Payment intent replayed.",
      intentCreated: "Payment intent created.",
      networkRetry: "Network issue. Retry safely with the same Idempotency-Key.",
      submitting: "Submitting...",
      payNow: "Pay Now",
      regenerateKey: "Regenerate key",
    },
    invoiceDetail: {
      overdueBanner: "Payment deadline exceeded. Deposit may be burned.",
      invoiceLabel: "Invoice",
      winningAmount: "Winning amount",
      commission: "Commission",
      vat: "VAT",
      total: "Total",
      dueDate: "Due date",
      timeLeft: "Time left",
      idempotencyKey: "Idempotency-Key",
      idempotencyRequired: "Idempotency-Key is required.",
      intentCreationFailed: "Payment intent creation failed.",
      intentReplayed: "Payment intent replayed",
      intentCreated: "Payment intent created",
      existingIntentFallback: "existing intent",
      readyFallback: "ready",
      networkRetry: "Network error. Retry safely with the same key.",
      submitting: "Submitting...",
      payNow: "Pay Now",
      regenerateKey: "Regenerate key",
    },
  },
  ru: {
    pages: {
      dashboardTitle: "Панель покупателя",
      dashboardSubtitle: "Отслеживайте активные ставки, избранные лоты и предстоящие платежи.",
      recentActivity: "Последняя активность",
      noActivity: "Пока нет активности.",
      myBidsTitle: "Мои ставки",
      myBidsSubtitle: "Следите за лидирующими и перебитыми ставками в реальном времени.",
      watchlistTitle: "Избранное",
      watchlistSubtitle: "Держите перспективные лоты под рукой и входите в торги в нужный момент.",
      walletTitle: "Кошелек",
      walletSubtitle: "Пополняйте баланс, управляйте блокировками и запрашивайте вывод в одном месте.",
      invoicesTitle: "Счета",
      invoicesSubtitle: "Отслеживайте счета к оплате и закрывайте платежи до дедлайна 48 часов.",
      paymentPendingTitle: "Ожидают оплаты",
      paymentPendingSubtitle: "Оплачивайте выигранные лоты вовремя, чтобы избежать дефолта и списания депозита.",
      invoiceDetailTitle: "Детали счета",
      invoiceDetailSubtitle: "Проверьте сумму и завершите оплату до дедлайна политики.",
      backToPaymentPending: "Назад к ожидающим оплате",
    },
    dashboardCards: {
      aria: "Сводка панели",
      activeBids: "Активные ставки",
      watching: "В избранном",
      invoicesDue: "Счетов к оплате",
      depositBalance: "Баланс депозита",
    },
    bidWatch: {
      ariaBids: "Мои ставки",
      ariaWatchlist: "Избранное",
      winning: "Лидирую",
      outbid: "Перебили",
      myBid: "Моя ставка",
      highest: "Текущая",
      endsIn: "До конца",
      openLot: "Открыть лот",
    },
    wallet: {
      availableBalance: "Доступный баланс",
      lockedBalance: "Заблокированный баланс",
      pendingWithdrawal: "Ожидает вывода",
      addFunds: "Пополнить",
      withdraw: "Вывести",
      activeLockNote: "Участие в активном аукционе временно блокирует депозит.",
      activeLocks: "Активные блокировки",
      transactionHistory: "История операций",
      openPaymentPendingView: "Открыть список ожидающих оплат",
      lockStatuses: {
        ACTIVE: "Активна",
        RELEASED: "Разблокирована",
        BURNED: "Списана",
      },
    },
    invoices: {
      aria: "Счета",
      invoiceLabel: "Счет",
      total: "Итого",
      due: "Срок",
      countdown: "Отсчет",
      openInvoice: "Открыть счет",
    },
    paymentPending: {
      title: "Ожидают оплаты",
      subtitle: "Оплатите в течение 48 часов, чтобы избежать дефолта и списания депозита.",
      aria: "Счета к оплате",
      winner: "Победитель",
      total: "Итого",
      due: "Срок",
      countdown: "Отсчет",
      idempotencyKey: "Idempotency-Key",
      idempotencyRequired: "Idempotency-Key обязателен.",
      requestRejected: "Запрос на создание платежа отклонен.",
      intentReplayed: "Платежное намерение переиспользовано.",
      intentCreated: "Платежное намерение создано.",
      networkRetry: "Ошибка сети. Повторите безопасно с тем же Idempotency-Key.",
      submitting: "Отправка...",
      payNow: "Оплатить",
      regenerateKey: "Сгенерировать новый ключ",
    },
    invoiceDetail: {
      overdueBanner: "Срок оплаты истек. Депозит может быть списан.",
      invoiceLabel: "Счет",
      winningAmount: "Сумма выигрыша",
      commission: "Комиссия",
      vat: "НДС",
      total: "Итого",
      dueDate: "Срок оплаты",
      timeLeft: "Осталось времени",
      idempotencyKey: "Idempotency-Key",
      idempotencyRequired: "Idempotency-Key обязателен.",
      intentCreationFailed: "Не удалось создать платежное намерение.",
      intentReplayed: "Платежное намерение переиспользовано",
      intentCreated: "Платежное намерение создано",
      existingIntentFallback: "существующее намерение",
      readyFallback: "готово",
      networkRetry: "Ошибка сети. Повторите безопасно с тем же ключом.",
      submitting: "Отправка...",
      payNow: "Оплатить",
      regenerateKey: "Сгенерировать новый ключ",
    },
  },
};

export function getBuyerPortalCopy(locale: SupportedLocale): BuyerPortalCopy {
  return COPY[locale];
}
