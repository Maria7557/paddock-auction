import nodemailer, { type Transporter } from "nodemailer";

type LoggerLike = {
  info?: (payload: unknown, message?: string) => void;
  warn?: (payload: unknown, message?: string) => void;
  error?: (payload: unknown, message?: string) => void;
};

type SmtpConfig = {
  from: string;
  host: string;
  pass: string;
  port: number;
  replyTo: string | null;
  secure: boolean;
  user: string;
};

type DirectEmailInput = {
  html: string;
  subject: string;
  text: string;
  to: string;
};

type BulkEmailInput = {
  html: string;
  recipients: string[];
  subject: string;
  text: string;
};

type RegistrationEmailInput = {
  companyName: string;
  email: string;
  role: "SELLER" | "BUYER";
  status: string;
};

type AdminRegistrationEmailInput = RegistrationEmailInput & {
  country: string;
  emirate?: string | null;
  phoneNumber?: string | null;
  registrationNumber?: string | null;
};

type PasswordResetEmailInput = {
  code: string;
  email: string;
  expiresInMinutes: number;
};

type NewEventEmailInput = {
  description?: string;
  endsAt: Date;
  eventId: string;
  recipients: string[];
  startsAt: Date;
  title: string;
};

type AccountApprovedEmailInput = {
  companyName: string;
  email: string;
  name: string;
  role: "SELLER" | "BUYER";
};

type AccountRejectedEmailInput = {
  companyName: string;
  email: string;
  name: string;
  rejectionReason: string;
};

type DepositApprovedEmailInput = {
  amountAed: number;
  email: string;
  name: string;
};

type OutbidEmailInput = {
  auctionId: string;
  currentBidAed: number;
  email: string;
  name: string;
  vehicleTitle: string;
  yourBidAed: number;
};

type AuctionWonEmailInput = {
  email: string;
  finalPriceAed: number;
  invoiceId: string;
  name: string;
  paymentDeadline: Date;
  vehicleTitle: string;
};

type AuctionLostEmailInput = {
  email: string;
  name: string;
  vehicleTitle: string;
};

type PaymentDeadlineReminderEmailInput = {
  email: string;
  finalPriceAed: number;
  hoursLeft: number;
  invoiceId: string;
  name: string;
  paymentDeadline: Date;
  vehicleTitle: string;
};

type WatchlistAuctionReminderEmailInput = {
  auctionId: string;
  email: string;
  name: string;
  startPriceAed: number;
  startsAt: Date;
  timeLabel: string;
  vehicleTitle: string;
};

type AuctionEndingSoonEmailInput = {
  auctionId: string;
  currentBidAed: number;
  email: string;
  endsAt: Date;
  name: string;
  vehicleTitle: string;
};

type DigestVehicle = {
  auctionId: string;
  meta: string;
  startPriceAed: number;
  title: string;
};

type NewVehiclesDigestEmailInput = {
  email: string;
  name: string;
  totalCount: number;
  vehicles: DigestVehicle[];
};

type VehicleApprovedEmailInput = {
  auctionDate: Date;
  auctionId: string;
  email: string;
  name: string;
  vehicleTitle: string;
};

type SellerAuctionReminderEmailInput = {
  auctionId: string;
  email: string;
  name: string;
  startsAt: Date;
  vehicleTitle: string;
};

type AuctionLiveSellerEmailInput = {
  auctionId: string;
  bidderCount: number;
  email: string;
  endsAt: Date;
  name: string;
  vehicleTitle: string;
};

type AuctionResultSellerEmailInput = {
  auctionId: string;
  buyerName?: string;
  dashboardUrl: string;
  email: string;
  finalPriceAed?: number;
  name: string;
  paymentDeadline?: Date;
  sold: boolean;
  vehicleTitle: string;
};

type ActionRequiredSellerEmailInput = {
  dashboardUrl: string;
  email: string;
  issueDescription: string;
  name: string;
  vehicleTitle: string;
};

let cachedTransporter: Transporter | null = null;
let cachedTransporterKey: string | null = null;

function getAppUrl(): string {
  return process.env.FRONTEND_URL?.trim() || "http://localhost:3000";
}

function parseDelimitedEmailList(value: string | undefined): string[] {
  if (!value) {
    return [];
  }

  return [...new Set(value.split(/[;,]/).map((item) => item.trim()).filter(Boolean))];
}

function getAdminRecipients(): string[] {
  return parseDelimitedEmailList(process.env.EMAIL_ADMIN_RECIPIENTS);
}

function parseSmtpPort(value: string | undefined): number {
  const parsed = Number.parseInt(value?.trim() || "", 10);

  if (Number.isNaN(parsed)) {
    return 587;
  }

  return parsed;
}

function parseBooleanFlag(value: string | undefined, fallback: boolean): boolean {
  if (!value) {
    return fallback;
  }

  const normalized = value.trim().toLowerCase();

  return normalized === "true" || normalized === "1" || normalized === "yes";
}

function getSmtpConfig(): SmtpConfig | null {
  const from = process.env.EMAIL_FROM?.trim();
  const host = process.env.EMAIL_SMTP_HOST?.trim();
  const user = process.env.EMAIL_SMTP_USER?.trim();
  const pass = process.env.EMAIL_SMTP_PASS?.trim();

  if (!from || !host || !user || !pass) {
    return null;
  }

  const port = parseSmtpPort(process.env.EMAIL_SMTP_PORT);

  return {
    from,
    host,
    pass,
    port,
    replyTo: process.env.EMAIL_REPLY_TO?.trim() || null,
    secure: parseBooleanFlag(process.env.EMAIL_SMTP_SECURE, port === 465),
    user,
  };
}

async function getTransporter(): Promise<{ config: SmtpConfig; transporter: Transporter } | null> {
  const config = getSmtpConfig();

  if (!config) {
    return null;
  }

  const nextKey = JSON.stringify(config);

  if (!cachedTransporter || cachedTransporterKey !== nextKey) {
    cachedTransporter = nodemailer.createTransport({
      auth: {
        user: config.user,
        pass: config.pass,
      },
      host: config.host,
      port: config.port,
      secure: config.secure,
    });
    cachedTransporterKey = nextKey;
  }

  return {
    config,
    transporter: cachedTransporter,
  };
}

async function sendDirectEmail(input: DirectEmailInput, logger?: LoggerLike): Promise<boolean> {
  const emailClient = await getTransporter();

  if (!emailClient) {
    logger?.warn?.(
      {
        subject: input.subject,
        to: input.to,
      },
      "Email skipped because SMTP is not configured",
    );
    return false;
  }

  try {
    await emailClient.transporter.sendMail({
      from: emailClient.config.from,
      html: input.html,
      replyTo: emailClient.config.replyTo ?? undefined,
      subject: input.subject,
      text: input.text,
      to: input.to,
    });

    logger?.info?.(
      {
        subject: input.subject,
        to: input.to,
      },
      "Email delivered",
    );
    return true;
  } catch (error) {
    logger?.error?.(
      {
        err: error,
        subject: input.subject,
        to: input.to,
      },
      "Email delivery failed",
    );
    return false;
  }
}

function splitIntoBatches<T>(items: T[], size: number): T[][] {
  const batches: T[][] = [];

  for (let index = 0; index < items.length; index += size) {
    batches.push(items.slice(index, index + size));
  }

  return batches;
}

async function sendBulkEmail(input: BulkEmailInput, logger?: LoggerLike): Promise<boolean> {
  const recipients = [...new Set(input.recipients.map((item) => item.trim().toLowerCase()).filter(Boolean))];

  if (recipients.length === 0) {
    return false;
  }

  const emailClient = await getTransporter();

  if (!emailClient) {
    logger?.warn?.(
      {
        recipientCount: recipients.length,
        subject: input.subject,
      },
      "Bulk email skipped because SMTP is not configured",
    );
    return false;
  }

  let deliveredCount = 0;

  for (const batch of splitIntoBatches(recipients, 50)) {
    try {
      await emailClient.transporter.sendMail({
        bcc: batch,
        from: emailClient.config.from,
        html: input.html,
        replyTo: emailClient.config.replyTo ?? undefined,
        subject: input.subject,
        text: input.text,
        to: emailClient.config.from,
      });
      deliveredCount += batch.length;
    } catch (error) {
      logger?.error?.(
        {
          batchSize: batch.length,
          err: error,
          subject: input.subject,
        },
        "Bulk email delivery failed",
      );
    }
  }

  if (deliveredCount > 0) {
    logger?.info?.(
      {
        deliveredCount,
        subject: input.subject,
      },
      "Bulk email delivered",
    );
    return true;
  }

  return false;
}

function formatDubaiDateTime(value: Date): string {
  return new Intl.DateTimeFormat("en-AE", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Asia/Dubai",
  }).format(value);
}

const BRAND_NAME = "FleetBid";
const BRAND_HEADER_BACKGROUND = "#116a43";
const URGENT_HEADER_BACKGROUND = "#d85a30";
const BODY_TEXT_COLOR = "#374151";
const PRIMARY_BUTTON_STYLE =
  "background:#116a43; color:#fff; padding:14px 32px; border-radius:8px; font-weight:700; text-decoration:none; display:inline-block";
const WARNING_BUTTON_STYLE =
  "background:#d85a30; color:#fff; padding:14px 32px; border-radius:8px; font-weight:700; text-decoration:none; display:inline-block";

type EmailButtonInput = {
  href: string;
  label: string;
  warning?: boolean;
};

type EmailLayoutInput = {
  button?: EmailButtonInput;
  footerHtml?: string;
  headerBackgroundColor?: string;
  headerSubtitle?: string;
  headerTitle: string;
  sections: string[];
};

type DataTableRowInput = {
  label: string;
  value: string;
  valueColor?: string;
};

type StepRowInput = {
  stepNumber: number;
  text: string;
  title: string;
};

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function formatAedAmount(amount: number): string {
  return `AED ${new Intl.NumberFormat("en-AE", {
    minimumFractionDigits: Number.isInteger(amount) ? 0 : 2,
    maximumFractionDigits: 2,
  }).format(amount)}`;
}

function renderGreeting(name?: string): string {
  const trimmedName = name?.trim();

  return trimmedName ? `Hi ${escapeHtml(trimmedName)},` : "Hi,";
}

function renderParagraph(text: string): string {
  return `<p style="margin:0 0 16px; font-family:Arial, sans-serif; font-size:16px; line-height:1.6; color:${BODY_TEXT_COLOR};">${escapeHtml(text)}</p>`;
}

function renderHtmlBlock(content: string): string {
  return `<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border-collapse:collapse;"><tr><td>${content}</td></tr></table>`;
}

function renderButton(input: EmailButtonInput): string {
  return `
    <table role="presentation" cellspacing="0" cellpadding="0" style="border-collapse:collapse; margin:24px 0 0;">
      <tr>
        <td>
          <a href="${input.href}" style="${input.warning ? WARNING_BUTTON_STYLE : PRIMARY_BUTTON_STYLE}">${escapeHtml(input.label)}</a>
        </td>
      </tr>
    </table>
  `;
}

function renderBadge(text: string, backgroundColor = "#e1f5ee", textColor = BRAND_HEADER_BACKGROUND): string {
  return `
    <table role="presentation" cellspacing="0" cellpadding="0" style="border-collapse:collapse; margin:0 0 16px;">
      <tr>
        <td style="background:${backgroundColor}; color:${textColor}; font-family:Arial, sans-serif; font-size:13px; font-weight:700; padding:8px 14px; border-radius:999px;">
          ${escapeHtml(text)}
        </td>
      </tr>
    </table>
  `;
}

function renderDataTable(rows: DataTableRowInput[]): string {
  const renderedRows = rows
    .map(
      (row) => `
        <tr>
          <td style="padding:14px 16px; border-bottom:1px solid #e5e7eb; font-family:Arial, sans-serif; font-size:12px; font-weight:700; letter-spacing:0.04em; color:#6b7280; width:42%;">
            ${escapeHtml(row.label)}
          </td>
          <td style="padding:14px 16px; border-bottom:1px solid #e5e7eb; font-family:Arial, sans-serif; font-size:15px; font-weight:700; color:${row.valueColor ?? BODY_TEXT_COLOR};">
            ${escapeHtml(row.value)}
          </td>
        </tr>
      `,
    )
    .join("");

  return `
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border-collapse:collapse; margin:0 0 24px; border:1px solid #e5e7eb; border-radius:10px; overflow:hidden;">
      ${renderedRows}
    </table>
  `;
}

function renderStepsTable(steps: StepRowInput[]): string {
  const renderedRows = steps
    .map(
      (step) => `
        <tr>
          <td style="padding:16px; border-bottom:1px solid #e5e7eb; width:48px; vertical-align:top;">
            <table role="presentation" cellspacing="0" cellpadding="0" style="border-collapse:collapse;">
              <tr>
                <td style="width:32px; height:32px; border-radius:16px; background:#e1f5ee; color:${BRAND_HEADER_BACKGROUND}; font-family:Arial, sans-serif; font-size:14px; font-weight:700; text-align:center;">
                  ${step.stepNumber}
                </td>
              </tr>
            </table>
          </td>
          <td style="padding:16px; border-bottom:1px solid #e5e7eb; vertical-align:top;">
            <div style="font-family:Arial, sans-serif; font-size:15px; font-weight:700; color:${BODY_TEXT_COLOR}; margin:0 0 6px;">
              ${escapeHtml(step.title)}
            </div>
            <div style="font-family:Arial, sans-serif; font-size:14px; line-height:1.6; color:${BODY_TEXT_COLOR};">
              ${escapeHtml(step.text)}
            </div>
          </td>
        </tr>
      `,
    )
    .join("");

  return `
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border-collapse:collapse; margin:0 0 24px; border:1px solid #e5e7eb; border-radius:10px; overflow:hidden;">
      ${renderedRows}
    </table>
  `;
}

function renderNoteBox(input: {
  backgroundColor?: string;
  borderColor: string;
  label?: string;
  text: string;
}): string {
  return `
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border-collapse:collapse; margin:0 0 24px;">
      <tr>
        <td style="background:${input.backgroundColor ?? "#fff8f6"}; border-left:4px solid ${input.borderColor}; padding:16px 18px;">
          ${
            input.label
              ? `<div style="font-family:Arial, sans-serif; font-size:12px; font-weight:700; letter-spacing:0.04em; color:#6b7280; margin:0 0 6px;">${escapeHtml(input.label)}</div>`
              : ""
          }
          <div style="font-family:Arial, sans-serif; font-size:15px; line-height:1.6; color:${BODY_TEXT_COLOR};">
            ${escapeHtml(input.text)}
          </div>
        </td>
      </tr>
    </table>
  `;
}

function renderAmountBox(label: string, value: string, note: string): string {
  return `
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border-collapse:collapse; margin:0 0 24px;">
      <tr>
        <td style="background:#e1f5ee; padding:18px 20px; border-radius:10px;">
          <div style="font-family:Arial, sans-serif; font-size:12px; font-weight:700; letter-spacing:0.04em; color:#6b7280; margin:0 0 8px;">${escapeHtml(label)}</div>
          <div style="font-family:Arial, sans-serif; font-size:28px; font-weight:700; color:${BRAND_HEADER_BACKGROUND}; margin:0 0 8px;">${escapeHtml(value)}</div>
          <div style="font-family:Arial, sans-serif; font-size:14px; line-height:1.6; color:${BODY_TEXT_COLOR};">${escapeHtml(note)}</div>
        </td>
      </tr>
    </table>
  `;
}

function renderCodeBlock(code: string): string {
  return `
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border-collapse:collapse; margin:0 0 24px;">
      <tr>
        <td style="background:#f9fafb; border:1px solid #e5e7eb; border-radius:10px; padding:24px; text-align:center; font-family:Arial, sans-serif; font-size:32px; font-weight:700; letter-spacing:0.15em; color:${BRAND_HEADER_BACKGROUND};">
          ${escapeHtml(code)}
        </td>
      </tr>
    </table>
  `;
}

function renderVehiclesDigestRows(vehicles: DigestVehicle[]): string {
  const rows = vehicles
    .map(
      (vehicle) => `
        <tr>
          <td style="padding:16px; border-bottom:1px solid #e5e7eb;">
            <div style="font-family:Arial, sans-serif; font-size:16px; font-weight:700; color:${BODY_TEXT_COLOR}; margin:0 0 6px;">
              ${escapeHtml(vehicle.title)}
            </div>
            <div style="font-family:Arial, sans-serif; font-size:15px; font-weight:700; color:${BRAND_HEADER_BACKGROUND}; margin:0 0 6px;">
              from ${escapeHtml(formatAedAmount(vehicle.startPriceAed))}
            </div>
            <div style="font-family:Arial, sans-serif; font-size:14px; line-height:1.6; color:#6b7280;">
              ${escapeHtml(vehicle.meta)}
            </div>
          </td>
        </tr>
      `,
    )
    .join("");

  return `
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border-collapse:collapse; margin:0 0 24px; border:1px solid #e5e7eb; border-radius:10px; overflow:hidden;">
      ${rows}
    </table>
  `;
}

function renderEmailLayout(input: EmailLayoutInput): string {
  const renderedSections = input.sections
    .map((section) => `<tr><td style="padding:0 0 24px;">${section}</td></tr>`)
    .join("");

  return `
    <!DOCTYPE html>
    <html lang="en">
      <body style="margin:0; padding:0; background:#f3f4f6;">
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border-collapse:collapse; background:#f3f4f6;">
          <tr>
            <td align="center" style="padding:24px 12px;">
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border-collapse:collapse; max-width:640px; background:#ffffff;">
                <tr>
                  <td style="background:${input.headerBackgroundColor ?? BRAND_HEADER_BACKGROUND}; padding:28px 32px; color:#ffffff;">
                    <div style="font-family:Arial, sans-serif; font-size:28px; font-weight:700; line-height:1.2;">${BRAND_NAME}</div>
                    <div style="font-family:Arial, sans-serif; font-size:22px; font-weight:700; line-height:1.3; margin-top:12px;">${escapeHtml(input.headerTitle)}</div>
                    ${
                      input.headerSubtitle
                        ? `<div style="font-family:Arial, sans-serif; font-size:14px; line-height:1.6; margin-top:8px; color:#ffffff;">${escapeHtml(input.headerSubtitle)}</div>`
                        : ""
                    }
                  </td>
                </tr>
                <tr>
                  <td style="padding:32px;">
                    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border-collapse:collapse;">
                      ${renderedSections}
                      ${
                        input.button
                          ? `<tr><td style="padding:0 0 24px;">${renderButton(input.button)}</td></tr>`
                          : ""
                      }
                      ${
                        input.footerHtml
                          ? `<tr><td>${input.footerHtml}</td></tr>`
                          : ""
                      }
                    </table>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
        </table>
      </body>
    </html>
  `;
}

function joinTextLines(lines: Array<string | null | undefined>): string {
  return lines.filter((line): line is string => Boolean(line)).join("\n");
}

export async function sendUserRegistrationEmail(
  input: RegistrationEmailInput,
  logger?: LoggerLike,
): Promise<boolean> {
  const buttonHref = input.role === "BUYER" ? `${getAppUrl()}/wallet` : `${getAppUrl()}/seller/dashboard`;
  const buttonLabel = input.role === "BUYER" ? "Add Deposit & Start Bidding" : "List Your First Vehicle";
  const introText =
    input.role === "BUYER"
      ? "Welcome to FleetBid — the UAE's fleet vehicle auction platform. Your account is ready. To start placing bids, add your refundable deposit:"
      : "Welcome to FleetBid — the UAE's fleet vehicle auction platform. Your seller account is ready. List your first vehicle and reach verified fleet buyers across the UAE.";
  const steps =
    input.role === "BUYER"
      ? [
          {
            stepNumber: 1,
            text: "Fully refundable, held securely in your wallet.",
            title: "Add deposit",
          },
          {
            stepNumber: 2,
            text: "Fleet vehicles updated daily.",
            title: "Browse active auctions",
          },
          {
            stepNumber: 3,
            text: "Win vehicles at competitive prices.",
            title: "Place bids",
          },
        ]
      : [
          {
            stepNumber: 1,
            text: "Add details, photos, and set a reserve price.",
            title: "List your vehicle",
          },
          {
            stepNumber: 2,
            text: "Your listing goes live within 1 business day.",
            title: "We review & schedule",
          },
          {
            stepNumber: 3,
            text: "Verified buyers bid, you approve the winner.",
            title: "Auction runs",
          },
        ];

  return sendDirectEmail(
    {
      html: renderEmailLayout({
        button: {
          href: buttonHref,
          label: buttonLabel,
        },
        headerTitle:
          input.role === "BUYER"
            ? "Welcome to FleetBid — Add your deposit to start bidding"
            : "Welcome to FleetBid — List your first vehicle",
        sections: [
          renderHtmlBlock(`${renderParagraph("Hi,")}${renderParagraph(introText)}`),
          renderStepsTable(steps),
        ],
      }),
      subject:
        input.role === "BUYER"
          ? "Welcome to FleetBid — Add your deposit to start bidding"
          : "Welcome to FleetBid — List your first vehicle",
      text: joinTextLines([
        "Hi,",
        introText,
        input.role === "BUYER"
          ? "1. Add deposit — fully refundable, held securely in your wallet."
          : "1. List your vehicle — add details, photos, and set a reserve price.",
        input.role === "BUYER"
          ? "2. Browse active auctions — fleet vehicles updated daily."
          : "2. We review & schedule — your listing goes live within 1 business day.",
        input.role === "BUYER"
          ? "3. Place bids — win vehicles at competitive prices."
          : "3. Auction runs — verified buyers bid, you approve the winner.",
        `${buttonLabel}: ${buttonHref}`,
      ]),
      to: input.email,
    },
    logger,
  );
}

export async function sendAdminRegistrationEmail(
  input: AdminRegistrationEmailInput,
  logger?: LoggerLike,
): Promise<boolean> {
  const recipients = getAdminRecipients();

  if (recipients.length === 0) {
    return false;
  }

  const locationLine = input.emirate?.trim()
    ? `${input.country} / ${input.emirate.trim()}`
    : input.country;
  const phoneLine = input.phoneNumber?.trim() || "Not provided";
  const registrationNumberLine = input.registrationNumber?.trim() || "Not provided";

  return sendBulkEmail(
    {
      html: renderEmailLayout({
        headerTitle: "FleetBid — New Registration",
        sections: [
          renderDataTable([
            { label: "EMAIL", value: input.email },
            { label: "ROLE", value: input.role },
            { label: "COMPANY", value: input.companyName },
            { label: "REGISTRATION NUMBER", value: registrationNumberLine },
            { label: "PHONE", value: phoneLine },
            { label: "LOCATION", value: locationLine },
            { label: "STATUS", value: input.status },
          ]),
        ],
      }),
      recipients,
      subject: `New ${input.role.toLowerCase()} registration: ${input.companyName}`,
      text: joinTextLines([
        "New user registration",
        `Email: ${input.email}`,
        `Role: ${input.role}`,
        `Company: ${input.companyName}`,
        `Registration number: ${registrationNumberLine}`,
        `Phone: ${phoneLine}`,
        `Location: ${locationLine}`,
        `Status: ${input.status}`,
      ]),
    },
    logger,
  );
}

export async function sendPasswordResetCodeEmail(
  input: PasswordResetEmailInput,
  logger?: LoggerLike,
): Promise<boolean> {
  const resetUrl = `${getAppUrl()}/forgot-password`;

  return sendDirectEmail(
    {
      html: renderEmailLayout({
        button: {
          href: resetUrl,
          label: "Open reset page",
        },
        headerTitle: "FleetBid — Reset your password",
        sections: [
          renderHtmlBlock(
            `${renderParagraph("Hi,")}${renderParagraph(
              `We received a request to reset your password. Use this code to reset it — expires in ${input.expiresInMinutes} minutes.`,
            )}`,
          ),
          renderCodeBlock(input.code),
          renderNoteBox({
            backgroundColor: "#f9fafb",
            borderColor: "#d1d5db",
            text: "If you did not request a password reset, you can safely ignore this email.",
          }),
        ],
      }),
      subject: "FleetBid — Reset your password",
      text: joinTextLines([
        "Hi,",
        `We received a request to reset your password. Use this code to reset it — expires in ${input.expiresInMinutes} minutes.`,
        `Code: ${input.code}`,
        "If you did not request a password reset, you can safely ignore this email.",
        `Open reset page: ${resetUrl}`,
      ]),
      to: input.email,
    },
    logger,
  );
}

export async function sendNewEventAnnouncementEmail(
  input: NewEventEmailInput,
  logger?: LoggerLike,
): Promise<boolean> {
  const eventUrl = `${getAppUrl()}/auctions/${input.eventId}`;

  return sendBulkEmail(
    {
      html: renderEmailLayout({
        button: {
          href: eventUrl,
          label: "View Auction",
        },
        headerTitle: `FleetBid — New auction event: ${input.title}`,
        sections: [
          renderHtmlBlock(
            `${renderParagraph("Hi,")}${renderParagraph("A new auction event has been scheduled on FleetBid.")}`,
          ),
          renderDataTable([
            { label: "STARTS", value: formatDubaiDateTime(input.startsAt), valueColor: BRAND_HEADER_BACKGROUND },
            { label: "ENDS", value: formatDubaiDateTime(input.endsAt) },
            ...(input.description?.trim()
              ? [{ label: "DESCRIPTION", value: input.description.trim() }]
              : []),
          ]),
        ],
      }),
      recipients: input.recipients,
      subject: `FleetBid — New auction event: ${input.title}`,
      text: joinTextLines([
        "Hi,",
        "A new auction event has been scheduled on FleetBid.",
        `Title: ${input.title}`,
        `Starts: ${formatDubaiDateTime(input.startsAt)}`,
        `Ends: ${formatDubaiDateTime(input.endsAt)}`,
        input.description?.trim() ? `Description: ${input.description.trim()}` : null,
        `View Auction: ${eventUrl}`,
      ]),
    },
    logger,
  );
}

export async function sendAccountApprovedEmail(
  input: AccountApprovedEmailInput,
  logger?: LoggerLike,
): Promise<boolean> {
  const isBuyer = input.role === "BUYER";
  const actionText = isBuyer
    ? "Add your refundable deposit to start placing bids."
    : "You can now list your vehicles for auction.";
  const buttonHref = isBuyer ? `${getAppUrl()}/wallet` : `${getAppUrl()}/seller/dashboard`;
  const buttonLabel = isBuyer ? "Add Deposit & Start Bidding" : "Go to Dashboard";

  return sendDirectEmail(
    {
      html: renderEmailLayout({
        button: {
          href: buttonHref,
          label: buttonLabel,
        },
        headerTitle: "FleetBid — Your account has been approved",
        sections: [
          renderBadge("✓ Account Approved"),
          renderHtmlBlock(
            `${renderParagraph(renderGreeting(input.name))}${renderParagraph(
              `${input.companyName} has been verified and your FleetBid account is now active.`,
            )}${renderParagraph(actionText)}`,
          ),
        ],
      }),
      subject: "FleetBid — Your account has been approved",
      text: joinTextLines([
        renderGreeting(input.name),
        `${input.companyName} has been verified and your FleetBid account is now active.`,
        actionText,
        `${buttonLabel}: ${buttonHref}`,
      ]),
      to: input.email,
    },
    logger,
  );
}

export async function sendAccountRejectedEmail(
  input: AccountRejectedEmailInput,
  logger?: LoggerLike,
): Promise<boolean> {
  const supportUrl = `${getAppUrl()}/support`;

  return sendDirectEmail(
    {
      html: renderEmailLayout({
        button: {
          href: supportUrl,
          label: "Contact Support",
        },
        headerTitle: "FleetBid — Account review update",
        sections: [
          renderHtmlBlock(
            `${renderParagraph(renderGreeting(input.name))}${renderParagraph(
              `We were unable to approve the registration for ${input.companyName}.`,
            )}`,
          ),
          renderNoteBox({
            borderColor: "#d85a30",
            label: "REASON",
            text: input.rejectionReason,
          }),
          renderHtmlBlock(
            renderParagraph(
              "If you believe this is an error or wish to resubmit, please contact our support team.",
            ),
          ),
        ],
      }),
      subject: "FleetBid — Account review update",
      text: joinTextLines([
        renderGreeting(input.name),
        `We were unable to approve the registration for ${input.companyName}.`,
        `REASON: ${input.rejectionReason}`,
        "If you believe this is an error or wish to resubmit, please contact our support team.",
        `Contact Support: ${supportUrl}`,
      ]),
      to: input.email,
    },
    logger,
  );
}

export async function sendDepositApprovedEmail(
  input: DepositApprovedEmailInput,
  logger?: LoggerLike,
): Promise<boolean> {
  const auctionsUrl = `${getAppUrl()}/auctions`;

  return sendDirectEmail(
    {
      html: renderEmailLayout({
        button: {
          href: auctionsUrl,
          label: "Browse Active Auctions",
        },
        headerTitle: "FleetBid — Your deposit has been approved",
        sections: [
          renderBadge("✓ Deposit Approved"),
          renderHtmlBlock(`${renderParagraph(renderGreeting(input.name))}`),
          renderAmountBox(
            "DEPOSIT AMOUNT",
            formatAedAmount(input.amountAed),
            "Fully refundable · Held securely in your wallet",
          ),
          renderHtmlBlock(renderParagraph("You can now place bids on all active auctions.")),
        ],
      }),
      subject: "FleetBid — Your deposit has been approved",
      text: joinTextLines([
        renderGreeting(input.name),
        "✓ Deposit Approved",
        `DEPOSIT AMOUNT: ${formatAedAmount(input.amountAed)}`,
        "Fully refundable · Held securely in your wallet",
        "You can now place bids on all active auctions.",
        `Browse Active Auctions: ${auctionsUrl}`,
      ]),
      to: input.email,
    },
    logger,
  );
}

export async function sendOutbidEmail(
  input: OutbidEmailInput,
  logger?: LoggerLike,
): Promise<boolean> {
  const auctionUrl = `${getAppUrl()}/auctions/${input.auctionId}`;

  return sendDirectEmail(
    {
      html: renderEmailLayout({
        button: {
          href: auctionUrl,
          label: "Place New Bid",
        },
        headerTitle: `FleetBid — You've been outbid on ${input.vehicleTitle}`,
        sections: [
          renderHtmlBlock(
            `${renderParagraph(renderGreeting(input.name))}${renderParagraph(
              "Someone placed a higher bid on:",
            )}${renderParagraph(input.vehicleTitle)}`,
          ),
          renderDataTable([
            {
              label: "CURRENT HIGHEST BID",
              value: formatAedAmount(input.currentBidAed),
              valueColor: "#d85a30",
            },
            {
              label: "YOUR LAST BID",
              value: formatAedAmount(input.yourBidAed),
            },
          ]),
          renderHtmlBlock(renderParagraph("The auction is still live — act fast.")),
        ],
      }),
      subject: `FleetBid — You've been outbid on ${input.vehicleTitle}`,
      text: joinTextLines([
        renderGreeting(input.name),
        "Someone placed a higher bid on:",
        input.vehicleTitle,
        `CURRENT HIGHEST BID: ${formatAedAmount(input.currentBidAed)}`,
        `YOUR LAST BID: ${formatAedAmount(input.yourBidAed)}`,
        "The auction is still live — act fast.",
        `Place New Bid: ${auctionUrl}`,
      ]),
      to: input.email,
    },
    logger,
  );
}

export async function sendAuctionWonEmail(
  input: AuctionWonEmailInput,
  logger?: LoggerLike,
): Promise<boolean> {
  const invoiceUrl = `${getAppUrl()}/finance/invoices/${input.invoiceId}`;

  return sendDirectEmail(
    {
      html: renderEmailLayout({
        button: {
          href: invoiceUrl,
          label: "View Invoice & Pay",
        },
        headerSubtitle: "🏆 Congratulations — you won!",
        headerTitle: `Congratulations — You won ${input.vehicleTitle}!`,
        sections: [
          renderHtmlBlock(
            `${renderParagraph(renderGreeting(input.name))}${renderParagraph(
              "You won the auction for:",
            )}${renderParagraph(input.vehicleTitle)}`,
          ),
          renderDataTable([
            { label: "FINAL PRICE", value: formatAedAmount(input.finalPriceAed), valueColor: BRAND_HEADER_BACKGROUND },
            {
              label: "PAYMENT DEADLINE",
              value: formatDubaiDateTime(input.paymentDeadline),
              valueColor: "#d85a30",
            },
          ]),
          renderNoteBox({
            borderColor: "#d85a30",
            text: "Please complete payment before the deadline to avoid deposit forfeiture.",
          }),
        ],
      }),
      subject: `Congratulations — You won ${input.vehicleTitle}!`,
      text: joinTextLines([
        renderGreeting(input.name),
        "🏆 Congratulations — you won!",
        "You won the auction for:",
        input.vehicleTitle,
        `FINAL PRICE: ${formatAedAmount(input.finalPriceAed)}`,
        `PAYMENT DEADLINE: ${formatDubaiDateTime(input.paymentDeadline)}`,
        "Please complete payment before the deadline to avoid deposit forfeiture.",
        `View Invoice & Pay: ${invoiceUrl}`,
      ]),
      to: input.email,
    },
    logger,
  );
}

export async function sendAuctionLostEmail(
  input: AuctionLostEmailInput,
  logger?: LoggerLike,
): Promise<boolean> {
  const auctionsUrl = `${getAppUrl()}/auctions`;

  return sendDirectEmail(
    {
      html: renderEmailLayout({
        button: {
          href: auctionsUrl,
          label: "Browse Active Auctions",
        },
        headerTitle: `FleetBid — Auction ended for ${input.vehicleTitle}`,
        sections: [
          renderHtmlBlock(
            `${renderParagraph(renderGreeting(input.name))}${renderParagraph(
              "The auction has ended for:",
            )}${renderParagraph(input.vehicleTitle)}${renderParagraph("Another bidder secured this lot.")}`,
          ),
          renderNoteBox({
            backgroundColor: "#f9fafb",
            borderColor: "#d1d5db",
            text: "Your deposit remains available in your wallet — browse more vehicles and place your next bid.",
          }),
        ],
      }),
      subject: `FleetBid — Auction ended for ${input.vehicleTitle}`,
      text: joinTextLines([
        renderGreeting(input.name),
        "The auction has ended for:",
        input.vehicleTitle,
        "Another bidder secured this lot.",
        "Your deposit remains available in your wallet — browse more vehicles and place your next bid.",
        `Browse Active Auctions: ${auctionsUrl}`,
      ]),
      to: input.email,
    },
    logger,
  );
}

export async function sendPaymentDeadlineReminderEmail(
  input: PaymentDeadlineReminderEmailInput,
  logger?: LoggerLike,
): Promise<boolean> {
  const invoiceUrl = `${getAppUrl()}/finance/invoices/${input.invoiceId}`;

  return sendDirectEmail(
    {
      html: renderEmailLayout({
        button: {
          href: invoiceUrl,
          label: "Pay Now",
          warning: true,
        },
        headerBackgroundColor: URGENT_HEADER_BACKGROUND,
        headerSubtitle: "⚠ Payment reminder",
        headerTitle: `FleetBid — Payment due in ${input.hoursLeft}h for ${input.vehicleTitle}`,
        sections: [
          renderHtmlBlock(
            `${renderParagraph(renderGreeting(input.name))}${renderParagraph(
              `Payment is due in ${input.hoursLeft} hours for:`,
            )}${renderParagraph(input.vehicleTitle)}`,
          ),
          renderDataTable([
            {
              label: "AMOUNT DUE",
              value: formatAedAmount(input.finalPriceAed),
            },
            {
              label: "DEADLINE",
              value: formatDubaiDateTime(input.paymentDeadline),
              valueColor: "#d85a30",
            },
          ]),
          renderNoteBox({
            borderColor: "#d85a30",
            text: "Failure to pay by the deadline will result in deposit forfeiture.",
          }),
        ],
      }),
      subject: `FleetBid — Payment due in ${input.hoursLeft}h for ${input.vehicleTitle}`,
      text: joinTextLines([
        renderGreeting(input.name),
        `Payment is due in ${input.hoursLeft} hours for:`,
        input.vehicleTitle,
        `AMOUNT DUE: ${formatAedAmount(input.finalPriceAed)}`,
        `DEADLINE: ${formatDubaiDateTime(input.paymentDeadline)}`,
        "Failure to pay by the deadline will result in deposit forfeiture.",
        `Pay Now: ${invoiceUrl}`,
      ]),
      to: input.email,
    },
    logger,
  );
}

export async function sendWatchlistAuctionReminderEmail(
  input: WatchlistAuctionReminderEmailInput,
  logger?: LoggerLike,
): Promise<boolean> {
  const auctionUrl = `${getAppUrl()}/auctions/${input.auctionId}`;

  return sendDirectEmail(
    {
      html: renderEmailLayout({
        button: {
          href: auctionUrl,
          label: "View Lot",
        },
        headerSubtitle: "★ Vehicle on your watchlist",
        headerTitle: `FleetBid — Auction starts in ${input.timeLabel} for ${input.vehicleTitle}`,
        sections: [
          renderHtmlBlock(
            `${renderParagraph(renderGreeting(input.name))}${renderParagraph(
              `A vehicle on your watchlist is going to auction in ${input.timeLabel}.`,
            )}${renderParagraph(input.vehicleTitle)}`,
          ),
          renderDataTable([
            {
              label: "AUCTION STARTS",
              value: formatDubaiDateTime(input.startsAt),
              valueColor: BRAND_HEADER_BACKGROUND,
            },
            {
              label: "STARTING PRICE",
              value: formatAedAmount(input.startPriceAed),
            },
          ]),
        ],
      }),
      subject: `FleetBid — Auction starts in ${input.timeLabel} for ${input.vehicleTitle}`,
      text: joinTextLines([
        renderGreeting(input.name),
        `A vehicle on your watchlist is going to auction in ${input.timeLabel}.`,
        input.vehicleTitle,
        `AUCTION STARTS: ${formatDubaiDateTime(input.startsAt)}`,
        `STARTING PRICE: ${formatAedAmount(input.startPriceAed)}`,
        `View Lot: ${auctionUrl}`,
      ]),
      to: input.email,
    },
    logger,
  );
}

export async function sendAuctionEndingSoonEmail(
  input: AuctionEndingSoonEmailInput,
  logger?: LoggerLike,
): Promise<boolean> {
  const auctionUrl = `${getAppUrl()}/auctions/${input.auctionId}`;

  return sendDirectEmail(
    {
      html: renderEmailLayout({
        button: {
          href: auctionUrl,
          label: "Bid Now",
        },
        headerSubtitle: "⏱ Closing soon",
        headerTitle: `FleetBid — 30 minutes left on ${input.vehicleTitle}`,
        sections: [
          renderHtmlBlock(
            `${renderParagraph(renderGreeting(input.name))}${renderParagraph(
              "Bidding closes in 30 minutes for:",
            )}${renderParagraph(input.vehicleTitle)}`,
          ),
          renderDataTable([
            { label: "CURRENT BID", value: formatAedAmount(input.currentBidAed) },
            {
              label: "CLOSES AT",
              value: formatDubaiDateTime(input.endsAt),
              valueColor: "#d85a30",
            },
          ]),
        ],
      }),
      subject: `FleetBid — 30 minutes left on ${input.vehicleTitle}`,
      text: joinTextLines([
        renderGreeting(input.name),
        "Bidding closes in 30 minutes for:",
        input.vehicleTitle,
        `CURRENT BID: ${formatAedAmount(input.currentBidAed)}`,
        `CLOSES AT: ${formatDubaiDateTime(input.endsAt)}`,
        `Bid Now: ${auctionUrl}`,
      ]),
      to: input.email,
    },
    logger,
  );
}

export async function sendNewVehiclesDigestEmail(
  input: NewVehiclesDigestEmailInput,
  logger?: LoggerLike,
): Promise<boolean> {
  const auctionsUrl = `${getAppUrl()}/auctions`;
  const unsubscribeUrl = `${getAppUrl()}/unsubscribe`;

  return sendDirectEmail(
    {
      html: renderEmailLayout({
        button: {
          href: auctionsUrl,
          label: "See All New Listings",
        },
        footerHtml: `
          <p style="margin:0 0 12px; font-family:Arial, sans-serif; font-size:13px; line-height:1.6; color:#6b7280;">
            You are receiving this because you have an active FleetBid account.
          </p>
          <p style="margin:0; font-family:Arial, sans-serif; font-size:13px; line-height:1.6; color:#6b7280;">
            Unsubscribe: <a href="${unsubscribeUrl}" style="color:${BRAND_HEADER_BACKGROUND}; text-decoration:underline;">${unsubscribeUrl}</a>
          </p>
        `,
        headerSubtitle: "New vehicles — last 4 days",
        headerTitle: `FleetBid — ${input.totalCount} new vehicles added`,
        sections: [
          renderHtmlBlock(
            `${renderParagraph(renderGreeting(input.name))}${renderParagraph(
              `${input.totalCount} new vehicles have been listed on FleetBid in the past 4 days.`,
            )}`,
          ),
          renderVehiclesDigestRows(input.vehicles),
        ],
      }),
      subject: `FleetBid — ${input.totalCount} new vehicles added`,
      text: joinTextLines([
        renderGreeting(input.name),
        `${input.totalCount} new vehicles have been listed on FleetBid in the past 4 days.`,
        ...input.vehicles.flatMap((vehicle, index) => [
          `${index + 1}. ${vehicle.title}`,
          `   from ${formatAedAmount(vehicle.startPriceAed)}`,
          `   ${vehicle.meta}`,
          `   ${getAppUrl()}/auctions/${vehicle.auctionId}`,
        ]),
        `See All New Listings: ${auctionsUrl}`,
        "You are receiving this because you have an active FleetBid account.",
        `Unsubscribe: ${unsubscribeUrl}`,
      ]),
      to: input.email,
    },
    logger,
  );
}

export async function sendVehicleApprovedEmail(
  input: VehicleApprovedEmailInput,
  logger?: LoggerLike,
): Promise<boolean> {
  const auctionUrl = `${getAppUrl()}/auctions/${input.auctionId}`;

  return sendDirectEmail(
    {
      html: renderEmailLayout({
        button: {
          href: auctionUrl,
          label: "View Your Listing",
        },
        headerTitle: "FleetBid — Your vehicle has been approved for auction",
        sections: [
          renderBadge("✓ Vehicle Approved"),
          renderHtmlBlock(
            `${renderParagraph(renderGreeting(input.name))}${renderParagraph(
              "Your vehicle listing has been approved and scheduled for auction.",
            )}${renderParagraph(input.vehicleTitle)}`,
          ),
          renderDataTable([
            {
              label: "AUCTION DATE",
              value: formatDubaiDateTime(input.auctionDate),
              valueColor: BRAND_HEADER_BACKGROUND,
            },
          ]),
          renderHtmlBlock(renderParagraph("We will notify you when bidding goes live.")),
        ],
      }),
      subject: "FleetBid — Your vehicle has been approved for auction",
      text: joinTextLines([
        renderGreeting(input.name),
        "✓ Vehicle Approved",
        "Your vehicle listing has been approved and scheduled for auction.",
        input.vehicleTitle,
        `AUCTION DATE: ${formatDubaiDateTime(input.auctionDate)}`,
        "We will notify you when bidding goes live.",
        `View Your Listing: ${auctionUrl}`,
      ]),
      to: input.email,
    },
    logger,
  );
}

export async function sendSellerAuctionReminderEmail(
  input: SellerAuctionReminderEmailInput,
  logger?: LoggerLike,
): Promise<boolean> {
  const auctionUrl = `${getAppUrl()}/auctions/${input.auctionId}`;

  return sendDirectEmail(
    {
      html: renderEmailLayout({
        button: {
          href: auctionUrl,
          label: "View Auction",
        },
        headerSubtitle: "⏰ Auction starts tomorrow",
        headerTitle: `FleetBid — Your auction starts tomorrow: ${input.vehicleTitle}`,
        sections: [
          renderHtmlBlock(
            `${renderParagraph(renderGreeting(input.name))}${renderParagraph(
              "A reminder — bidding for your vehicle opens tomorrow.",
            )}${renderParagraph(input.vehicleTitle)}`,
          ),
          renderDataTable([
            {
              label: "AUCTION STARTS",
              value: formatDubaiDateTime(input.startsAt),
              valueColor: BRAND_HEADER_BACKGROUND,
            },
          ]),
          renderHtmlBlock(
            renderParagraph("We will send you another notification as soon as bidding goes live."),
          ),
        ],
      }),
      subject: `FleetBid — Your auction starts tomorrow: ${input.vehicleTitle}`,
      text: joinTextLines([
        renderGreeting(input.name),
        "A reminder — bidding for your vehicle opens tomorrow.",
        input.vehicleTitle,
        `AUCTION STARTS: ${formatDubaiDateTime(input.startsAt)}`,
        "We will send you another notification as soon as bidding goes live.",
        `View Auction: ${auctionUrl}`,
      ]),
      to: input.email,
    },
    logger,
  );
}

export async function sendAuctionLiveSellerEmail(
  input: AuctionLiveSellerEmailInput,
  logger?: LoggerLike,
): Promise<boolean> {
  const auctionUrl = `${getAppUrl()}/auctions/${input.auctionId}`;

  return sendDirectEmail(
    {
      html: renderEmailLayout({
        button: {
          href: auctionUrl,
          label: "Watch Live",
        },
        headerSubtitle: "● Live now",
        headerTitle: `FleetBid — Bidding is now live for ${input.vehicleTitle}`,
        sections: [
          renderBadge("● Bidding is live"),
          renderHtmlBlock(
            `${renderParagraph(renderGreeting(input.name))}${renderParagraph(
              "Bidding has started on your vehicle.",
            )}${renderParagraph(input.vehicleTitle)}`,
          ),
          renderDataTable([
            { label: "AUCTION CLOSES", value: formatDubaiDateTime(input.endsAt) },
            { label: "ACTIVE BIDDERS", value: String(input.bidderCount) },
          ]),
          renderHtmlBlock(
            renderParagraph("We will notify you as soon as the auction closes with the final result."),
          ),
        ],
      }),
      subject: `FleetBid — Bidding is now live for ${input.vehicleTitle}`,
      text: joinTextLines([
        renderGreeting(input.name),
        "● Bidding is live",
        "Bidding has started on your vehicle.",
        input.vehicleTitle,
        `AUCTION CLOSES: ${formatDubaiDateTime(input.endsAt)}`,
        `ACTIVE BIDDERS: ${input.bidderCount}`,
        "We will notify you as soon as the auction closes with the final result.",
        `Watch Live: ${auctionUrl}`,
      ]),
      to: input.email,
    },
    logger,
  );
}

export async function sendAuctionResultSellerEmail(
  input: AuctionResultSellerEmailInput,
  logger?: LoggerLike,
): Promise<boolean> {
  if (!input.sold) {
    return sendDirectEmail(
      {
        html: renderEmailLayout({
          button: {
            href: input.dashboardUrl,
            label: "Go to Dashboard",
          },
          headerTitle: `FleetBid — Auction closed for ${input.vehicleTitle}`,
          sections: [
            renderHtmlBlock(
              `${renderParagraph(renderGreeting(input.name))}${renderParagraph(
                `The auction for ${input.vehicleTitle} closed without a winning bid.`,
              )}`,
            ),
            renderNoteBox({
              backgroundColor: "#f9fafb",
              borderColor: "#d1d5db",
              text: "You can relist the vehicle or contact support to discuss next steps.",
            }),
          ],
        }),
        subject: `FleetBid — Auction closed for ${input.vehicleTitle}`,
        text: joinTextLines([
          renderGreeting(input.name),
          `The auction for ${input.vehicleTitle} closed without a winning bid.`,
          "You can relist the vehicle or contact support to discuss next steps.",
          `Go to Dashboard: ${input.dashboardUrl}`,
        ]),
        to: input.email,
      },
      logger,
    );
  }

  return sendDirectEmail(
    {
      html: renderEmailLayout({
        button: {
          href: input.dashboardUrl,
          label: "Confirm Deal in Dashboard",
        },
        headerSubtitle: "🏆 Your vehicle has a winner",
        headerTitle: `FleetBid — Your vehicle has a winning bid: ${input.vehicleTitle}`,
        sections: [
          renderHtmlBlock(
            `${renderParagraph(renderGreeting(input.name))}${renderParagraph(
              "Your vehicle received a winning bid:",
            )}${renderParagraph(input.vehicleTitle)}`,
          ),
          renderDataTable([
            {
              label: "WINNING BID",
              value: formatAedAmount(input.finalPriceAed ?? 0),
              valueColor: BRAND_HEADER_BACKGROUND,
            },
            { label: "WINNER", value: input.buyerName ?? "Unknown buyer" },
            {
              label: "PAYMENT DEADLINE",
              value: input.paymentDeadline ? formatDubaiDateTime(input.paymentDeadline) : "Not scheduled",
            },
          ]),
          renderNoteBox({
            backgroundColor: "#e1f5ee",
            borderColor: BRAND_HEADER_BACKGROUND,
            label: "NEXT STEP — ACTION REQUIRED",
            text: "Please go to your dashboard to confirm the deal and move to the payment stage. The buyer is waiting for your approval.",
          }),
        ],
      }),
      subject: `FleetBid — Your vehicle has a winning bid: ${input.vehicleTitle}`,
      text: joinTextLines([
        renderGreeting(input.name),
        "🏆 Your vehicle has a winner",
        "Your vehicle received a winning bid:",
        input.vehicleTitle,
        `WINNING BID: ${formatAedAmount(input.finalPriceAed ?? 0)}`,
        `WINNER: ${input.buyerName ?? "Unknown buyer"}`,
        `PAYMENT DEADLINE: ${
          input.paymentDeadline ? formatDubaiDateTime(input.paymentDeadline) : "Not scheduled"
        }`,
        "NEXT STEP — ACTION REQUIRED: Please go to your dashboard to confirm the deal and move to the payment stage. The buyer is waiting for your approval.",
        `Confirm Deal in Dashboard: ${input.dashboardUrl}`,
      ]),
      to: input.email,
    },
    logger,
  );
}

export async function sendActionRequiredSellerEmail(
  input: ActionRequiredSellerEmailInput,
  logger?: LoggerLike,
): Promise<boolean> {
  return sendDirectEmail(
    {
      html: renderEmailLayout({
        button: {
          href: input.dashboardUrl,
          label: "Go to Dashboard",
          warning: true,
        },
        headerBackgroundColor: URGENT_HEADER_BACKGROUND,
        headerSubtitle: "⚠ Action required",
        headerTitle: `FleetBid — Action required for ${input.vehicleTitle}`,
        sections: [
          renderHtmlBlock(
            `${renderParagraph(renderGreeting(input.name))}${renderParagraph(
              "Your attention is required for:",
            )}${renderParagraph(input.vehicleTitle)}`,
          ),
          renderNoteBox({
            borderColor: "#d85a30",
            label: "ISSUE",
            text: input.issueDescription,
          }),
          renderHtmlBlock(
            renderParagraph("Please log in to your dashboard to review and take action."),
          ),
        ],
      }),
      subject: `FleetBid — Action required for ${input.vehicleTitle}`,
      text: joinTextLines([
        renderGreeting(input.name),
        "Your attention is required for:",
        input.vehicleTitle,
        `ISSUE: ${input.issueDescription}`,
        "Please log in to your dashboard to review and take action.",
        `Go to Dashboard: ${input.dashboardUrl}`,
      ]),
      to: input.email,
    },
    logger,
  );
}
