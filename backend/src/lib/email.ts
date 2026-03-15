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
  registrationNumber: string;
};

type NewEventEmailInput = {
  description?: string;
  endsAt: Date;
  eventId: string;
  recipients: string[];
  startsAt: Date;
  title: string;
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

export async function sendUserRegistrationEmail(
  input: RegistrationEmailInput,
  logger?: LoggerLike,
): Promise<boolean> {
  const statusLine =
    input.status === "ACTIVE"
      ? "Your account is now active and ready to use."
      : "Your registration is received and is waiting for approval.";

  const dashboardPath = input.role === "SELLER" ? "/seller/dashboard" : "/dashboard";
  const dashboardUrl = `${getAppUrl()}${dashboardPath}`;

  return sendDirectEmail(
    {
      html: `
        <div style="font-family: Arial, sans-serif; line-height: 1.5; color: #111827;">
          <h2>Welcome to Paddock Auction</h2>
          <p>Hi,</p>
          <p>We have received your ${input.role.toLowerCase()} registration for <strong>${input.companyName}</strong>.</p>
          <p>${statusLine}</p>
          <p>You can access your account here: <a href="${dashboardUrl}">${dashboardUrl}</a></p>
        </div>
      `,
      subject: "Your Paddock Auction registration",
      text: [
        "Welcome to Paddock Auction.",
        `We have received your ${input.role.toLowerCase()} registration for ${input.companyName}.`,
        statusLine,
        `Open your account: ${dashboardUrl}`,
      ].join("\n"),
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

  return sendBulkEmail(
    {
      html: `
        <div style="font-family: Arial, sans-serif; line-height: 1.5; color: #111827;">
          <h2>New user registration</h2>
          <p><strong>Email:</strong> ${input.email}</p>
          <p><strong>Role:</strong> ${input.role}</p>
          <p><strong>Company:</strong> ${input.companyName}</p>
          <p><strong>Registration number:</strong> ${input.registrationNumber}</p>
          <p><strong>Phone:</strong> ${phoneLine}</p>
          <p><strong>Location:</strong> ${locationLine}</p>
          <p><strong>Status:</strong> ${input.status}</p>
        </div>
      `,
      recipients,
      subject: `New ${input.role.toLowerCase()} registration: ${input.companyName}`,
      text: [
        "New user registration",
        `Email: ${input.email}`,
        `Role: ${input.role}`,
        `Company: ${input.companyName}`,
        `Registration number: ${input.registrationNumber}`,
        `Phone: ${phoneLine}`,
        `Location: ${locationLine}`,
        `Status: ${input.status}`,
      ].join("\n"),
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
      html: `
        <div style="font-family: Arial, sans-serif; line-height: 1.5; color: #111827;">
          <h2>${input.title}</h2>
          <p>A new auction event has been scheduled on Paddock Auction.</p>
          <p><strong>Starts:</strong> ${formatDubaiDateTime(input.startsAt)}</p>
          <p><strong>Ends:</strong> ${formatDubaiDateTime(input.endsAt)}</p>
          ${
            input.description?.trim()
              ? `<p><strong>Description:</strong> ${input.description.trim()}</p>`
              : ""
          }
          <p>View event: <a href="${eventUrl}">${eventUrl}</a></p>
        </div>
      `,
      recipients: input.recipients,
      subject: `New auction event: ${input.title}`,
      text: [
        `${input.title}`,
        "A new auction event has been scheduled on Paddock Auction.",
        `Starts: ${formatDubaiDateTime(input.startsAt)}`,
        `Ends: ${formatDubaiDateTime(input.endsAt)}`,
        input.description?.trim() ? `Description: ${input.description.trim()}` : null,
        `View event: ${eventUrl}`,
      ]
        .filter((line): line is string => Boolean(line))
        .join("\n"),
    },
    logger,
  );
}
