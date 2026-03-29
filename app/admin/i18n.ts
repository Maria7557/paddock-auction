import type { SupportedLocale } from "@/src/i18n/routing";

type AdminLocaleCopy = {
  brand: string;
  navAriaLabel: string;
  nav: {
    companies: string;
    vehicles: string;
    events: string;
    buyers: string;
    invoices: string;
  };
  filtersAriaLabel: string;
  status: {
    pending: string;
    approved: string;
    rejected: string;
    blocked: string;
    none: string;
    draft: string;
    scheduled: string;
    live: string;
    ended: string;
  };
  defaults: {
    auctionEventTitlePrefix: string;
    fleetOperator: string;
  };
  companies: {
    heading: string;
    sectionTitle: string;
    tabs: {
      pending: string;
      all: string;
    };
    table: {
      company: string;
      email: string;
      phone: string;
      status: string;
      registrationDate: string;
      actions: string;
    };
    actions: {
      view: string;
      approve: string;
      reject: string;
      noPendingAction: string;
    };
    empty: string;
  };
  buyers: {
    heading: string;
    sectionTitle: string;
    tabs: {
      pending: string;
      all: string;
    };
    table: {
      name: string;
      phone: string;
      email: string;
      accountStatus: string;
      walletBalance: string;
      registrationDate: string;
      actions: string;
    };
    actions: {
      view: string;
      approve: string;
      reject: string;
      noPendingAction: string;
    };
    empty: string;
  };
  vehicles: {
    heading: string;
    sectionTitle: string;
    tabs: {
      pending: string;
      all: string;
    };
    table: {
      photo: string;
      vehicle: string;
      vin: string;
      status: string;
      company: string;
      event: string;
      actions: string;
    };
    actions: {
      view: string;
      save: string;
      edit: string;
      unassign: string;
      selectEvent: string;
      assign: string;
      approve: string;
      reject: string;
      noPendingAction: string;
    };
    empty: string;
  };
  events: {
    heading: string;
    createEvent: string;
    sectionTitle: string;
    table: {
      title: string;
      dateTime: string;
      status: string;
      lots: string;
      actions: string;
    };
    actions: {
      edit: string;
      delete: string;
    };
    empty: string;
  };
  eventDetail: {
    sectionTitleLots: string;
    sectionTitleAddVehicle: string;
    table: {
      index: string;
      photo: string;
      vehicle: string;
      vin: string;
      actions: string;
    };
    actions: {
      remove: string;
      addToEvent: string;
      selectVehicle: string;
      moveLotUp: string;
      moveLotDown: string;
    };
    emptyLots: string;
  };
  newEvent: {
    heading: string;
    sectionTitle: string;
    fields: {
      title: string;
      date: string;
      startTime: string;
      description: string;
    };
    placeholders: {
      title: string;
      description: string;
    };
    actions: {
      create: string;
      creating: string;
    };
    errors: {
      requiredFields: string;
      createFailed: string;
    };
  };
};

const ADMIN_COPY: Record<SupportedLocale, AdminLocaleCopy> = {
  en: {
    brand: "FleetBid Admin",
    navAriaLabel: "Admin navigation",
    nav: {
      companies: "Companies",
      vehicles: "Vehicles",
      events: "Events",
      buyers: "Buyers",
      invoices: "Invoices",
    },
    filtersAriaLabel: "Filters",
    status: {
      pending: "Pending",
      approved: "Approved",
      rejected: "Rejected",
      blocked: "Blocked",
      none: "None",
      draft: "Draft",
      scheduled: "Scheduled",
      live: "Live",
      ended: "Ended",
    },
    defaults: {
      auctionEventTitlePrefix: "Auction Event",
      fleetOperator: "Fleet Operator",
    },
    companies: {
      heading: "Companies",
      sectionTitle: "Company Review Queue",
      tabs: {
        pending: "New (Pending)",
        all: "All",
      },
      table: {
        company: "Company",
        email: "Email",
        phone: "Phone",
        status: "Status",
        registrationDate: "Registration Date",
        actions: "Actions",
      },
      actions: {
        view: "View",
        approve: "Approve",
        reject: "Reject",
        noPendingAction: "No pending action",
      },
      empty: "No companies found for this filter.",
    },
    buyers: {
      heading: "Buyers",
      sectionTitle: "Buyer Accounts & Deposit Review",
      tabs: {
        pending: "New / Pending",
        all: "All",
      },
      table: {
        name: "Name",
        phone: "Phone",
        email: "Email",
        accountStatus: "Account Status",
        walletBalance: "Wallet Balance",
        registrationDate: "Registration Date",
        actions: "Actions",
      },
      actions: {
        view: "View",
        approve: "Approve",
        reject: "Reject",
        noPendingAction: "No pending action",
      },
      empty: "No buyers found for this filter.",
    },
    vehicles: {
      heading: "Vehicles",
      sectionTitle: "Vehicle Approval & Assignment",
      tabs: {
        pending: "New (Pending)",
        all: "All",
      },
      table: {
        photo: "Photo",
        vehicle: "Brand / Model / Year",
        vin: "VIN",
        status: "Status",
        company: "Company",
        event: "Event",
        actions: "Actions",
      },
      actions: {
        view: "View",
        save: "Save",
        edit: "Edit",
        unassign: "Unassign",
        selectEvent: "Select event",
        assign: "Assign",
        approve: "Approve",
        reject: "Reject",
        noPendingAction: "No pending action",
      },
      empty: "No vehicles found for this filter.",
    },
    events: {
      heading: "Events",
      createEvent: "+ Create Event",
      sectionTitle: "Auction Events",
      table: {
        title: "Title",
        dateTime: "Date & Time",
        status: "Status",
        lots: "Lots",
        actions: "Actions",
      },
      actions: {
        edit: "Edit",
        delete: "Delete",
      },
      empty: "No events found.",
    },
    eventDetail: {
      sectionTitleLots: "Lot List",
      sectionTitleAddVehicle: "Add Vehicle",
      table: {
        index: "#",
        photo: "Photo",
        vehicle: "Brand / Model / Year",
        vin: "VIN",
        actions: "Actions",
      },
      actions: {
        remove: "Remove",
        addToEvent: "Add to Event",
        selectVehicle: "Select vehicle",
        moveLotUp: "Move lot up",
        moveLotDown: "Move lot down",
      },
      emptyLots: "No lots in this event.",
    },
    newEvent: {
      heading: "Create Event",
      sectionTitle: "New Event",
      fields: {
        title: "Title",
        date: "Date",
        startTime: "Start Time",
        description: "Description",
      },
      placeholders: {
        title: "Weekly Fleet Auction",
        description: "Optional event notes",
      },
      actions: {
        create: "Create Event",
        creating: "Creating...",
      },
      errors: {
        requiredFields: "Title, date, and start time are required.",
        createFailed: "Failed to create event.",
      },
    },
  },
  ru: {
    brand: "FleetBid Админ",
    navAriaLabel: "Навигация администратора",
    nav: {
      companies: "Компании",
      vehicles: "Автомобили",
      events: "События",
      buyers: "Покупатели",
      invoices: "Счета",
    },
    filtersAriaLabel: "Фильтры",
    status: {
      pending: "На рассмотрении",
      approved: "Одобрено",
      rejected: "Отклонено",
      blocked: "Заблокирован",
      none: "Нет",
      draft: "Черновик",
      scheduled: "Запланировано",
      live: "В эфире",
      ended: "Завершено",
    },
    defaults: {
      auctionEventTitlePrefix: "Аукцион",
      fleetOperator: "Флит-оператор",
    },
    companies: {
      heading: "Компании",
      sectionTitle: "Очередь проверки компаний",
      tabs: {
        pending: "Новые (на рассмотрении)",
        all: "Все",
      },
      table: {
        company: "Компания",
        email: "Email",
        phone: "Телефон",
        status: "Статус",
        registrationDate: "Дата регистрации",
        actions: "Действия",
      },
      actions: {
        view: "Открыть",
        approve: "Одобрить",
        reject: "Отклонить",
        noPendingAction: "Нет ожидающих действий",
      },
      empty: "Для этого фильтра компании не найдены.",
    },
    buyers: {
      heading: "Покупатели",
      sectionTitle: "Аккаунты покупателей и депозиты",
      tabs: {
        pending: "Новые / ожидают действия",
        all: "Все",
      },
      table: {
        name: "Имя",
        phone: "Телефон",
        email: "Email",
        accountStatus: "Статус аккаунта",
        walletBalance: "Баланс кошелька",
        registrationDate: "Дата регистрации",
        actions: "Действия",
      },
      actions: {
        view: "Открыть",
        approve: "Одобрить",
        reject: "Отклонить",
        noPendingAction: "Нет ожидающих действий",
      },
      empty: "Для этого фильтра покупатели не найдены.",
    },
    vehicles: {
      heading: "Автомобили",
      sectionTitle: "Одобрение и назначение автомобилей",
      tabs: {
        pending: "Новые (на рассмотрении)",
        all: "Все",
      },
      table: {
        photo: "Фото",
        vehicle: "Марка / Модель / Год",
        vin: "VIN",
        status: "Статус",
        company: "Компания",
        event: "Событие",
        actions: "Действия",
      },
      actions: {
        view: "Открыть",
        save: "Сохранить",
        edit: "Изменить",
        unassign: "Снять",
        selectEvent: "Выберите событие",
        assign: "Назначить",
        approve: "Одобрить",
        reject: "Отклонить",
        noPendingAction: "Нет ожидающих действий",
      },
      empty: "Для этого фильтра автомобили не найдены.",
    },
    events: {
      heading: "События",
      createEvent: "+ Создать событие",
      sectionTitle: "Аукционные события",
      table: {
        title: "Название",
        dateTime: "Дата и время",
        status: "Статус",
        lots: "Лоты",
        actions: "Действия",
      },
      actions: {
        edit: "Изменить",
        delete: "Удалить",
      },
      empty: "События не найдены.",
    },
    eventDetail: {
      sectionTitleLots: "Список лотов",
      sectionTitleAddVehicle: "Добавить автомобиль",
      table: {
        index: "#",
        photo: "Фото",
        vehicle: "Марка / Модель / Год",
        vin: "VIN",
        actions: "Действия",
      },
      actions: {
        remove: "Удалить",
        addToEvent: "Добавить в событие",
        selectVehicle: "Выберите автомобиль",
        moveLotUp: "Поднять лот выше",
        moveLotDown: "Опустить лот ниже",
      },
      emptyLots: "В этом событии нет лотов.",
    },
    newEvent: {
      heading: "Создать событие",
      sectionTitle: "Новое событие",
      fields: {
        title: "Название",
        date: "Дата",
        startTime: "Время начала",
        description: "Описание",
      },
      placeholders: {
        title: "Еженедельный аукцион автопарков",
        description: "Необязательные заметки к событию",
      },
      actions: {
        create: "Создать событие",
        creating: "Создание...",
      },
      errors: {
        requiredFields: "Название, дата и время начала обязательны.",
        createFailed: "Не удалось создать событие.",
      },
    },
  },
};

export function getAdminCopy(locale: SupportedLocale): AdminLocaleCopy {
  return ADMIN_COPY[locale];
}
