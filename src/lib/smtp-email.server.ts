import { connect } from "node:tls";

type SmtpEmail = {
  to: string;
  subject: string;
  html: string;
  text: string;
  replyTo?: string;
};

type SmtpConfig = {
  host: string;
  port: number;
  username: string;
  password: string;
  fromEmail: string;
  fromName: string;
};

function smtpConfig(): SmtpConfig {
  const host = process.env["SMTP_HOST"] ?? "mail.promptbeats.app";
  const port = Number(process.env["SMTP_PORT"] ?? "465");
  const username = process.env["SMTP_USERNAME"] ?? "no-reply@promptbeats.app";
  const password = process.env["SMTP_PASSWORD"];
  const fromEmail = process.env["SMTP_FROM_EMAIL"] ?? "no-reply@promptbeats.app";
  const fromName = process.env["SMTP_FROM_NAME"] ?? "PromptBeats";

  if (!password) throw new Error("SMTP is not configured: SMTP_PASSWORD is missing.");
  if (!Number.isInteger(port) || port <= 0 || port > 65535)
    throw new Error("SMTP_PORT is invalid.");

  return { host, port, username, password, fromEmail, fromName };
}

function sanitizeHeader(value: string) {
  return value.replace(/[\r\n]+/g, " ").trim();
}

function encodeHeader(value: string) {
  const clean = sanitizeHeader(value);
  return /^[\x20-\x7E]*$/.test(clean)
    ? clean
    : `=?UTF-8?B?${Buffer.from(clean, "utf8").toString("base64")}?=`;
}

function encodeAddress(name: string, email: string) {
  return `${encodeHeader(name)} <${sanitizeHeader(email)}>`;
}

function normalizeBody(value: string) {
  return value.replace(/\r?\n/g, "\r\n").replace(/^\./gm, "..");
}

function buildMessage(config: SmtpConfig, payload: SmtpEmail) {
  const boundary = `promptbeats-${crypto.randomUUID()}`;
  const headers = [
    `From: ${encodeAddress(config.fromName, config.fromEmail)}`,
    `To: ${sanitizeHeader(payload.to)}`,
    ...(payload.replyTo ? [`Reply-To: ${sanitizeHeader(payload.replyTo)}`] : []),
    `Subject: ${encodeHeader(payload.subject)}`,
    `Date: ${new Date().toUTCString()}`,
    `Message-ID: <${crypto.randomUUID()}@promptbeats.app>`,
    "MIME-Version: 1.0",
    `Content-Type: multipart/alternative; boundary="${boundary}"`,
  ];

  const body = [
    `--${boundary}`,
    'Content-Type: text/plain; charset="UTF-8"',
    "Content-Transfer-Encoding: 8bit",
    "",
    normalizeBody(payload.text),
    `--${boundary}`,
    'Content-Type: text/html; charset="UTF-8"',
    "Content-Transfer-Encoding: 8bit",
    "",
    normalizeBody(payload.html),
    `--${boundary}--`,
    "",
  ];

  return [...headers, "", ...body].join("\r\n");
}

function createResponseReader(socket: ReturnType<typeof connect>) {
  let buffer = "";
  let pending:
    | {
        resolve: (response: string) => void;
        reject: (error: Error) => void;
        lines: string[];
        expected: number[];
      }
    | undefined;

  const processBuffer = () => {
    while (pending) {
      const newline = buffer.indexOf("\n");
      if (newline < 0) return;
      const raw = buffer.slice(0, newline + 1);
      buffer = buffer.slice(newline + 1);
      const line = raw.replace(/\r?\n$/, "");
      pending.lines.push(line);

      const match = /^(\d{3})([ -])/.exec(line);
      if (!match) continue;
      if (match[2] === "-") continue;

      const code = Number(match[1]);
      const response = pending.lines.join("\n");
      const { resolve, reject, expected } = pending;
      pending = undefined;

      if (!expected.includes(code)) {
        reject(new Error(`SMTP command failed (${code}): ${response}`));
      } else {
        resolve(response);
      }
    }
  };

  socket.on("data", (chunk) => {
    buffer += Buffer.from(chunk).toString("utf8");
    processBuffer();
  });

  socket.on("error", (error) => {
    if (pending) {
      const { reject } = pending;
      pending = undefined;
      reject(error instanceof Error ? error : new Error(String(error)));
    }
  });

  return (expected: number[], timeoutMs = 15_000) =>
    new Promise<string>((resolve, reject) => {
      if (pending) {
        reject(new Error("SMTP protocol error: response already pending."));
        return;
      }

      const timer = setTimeout(() => {
        if (!pending) return;
        pending = undefined;
        reject(new Error("SMTP response timed out."));
      }, timeoutMs);

      pending = {
        expected,
        lines: [],
        resolve: (response) => {
          clearTimeout(timer);
          resolve(response);
        },
        reject: (error) => {
          clearTimeout(timer);
          reject(error);
        },
      };

      processBuffer();
    });
}

async function write(socket: ReturnType<typeof connect>, value: string) {
  await new Promise<void>((resolve, reject) => {
    socket.write(value, (error) => {
      if (error) reject(error);
      else resolve();
    });
  });
}

export async function sendSmtpEmail(payload: SmtpEmail) {
  const config = smtpConfig();
  const socket = connect({
    host: config.host,
    port: config.port,
    servername: config.host,
    rejectUnauthorized: true,
  });

  socket.setTimeout(20_000);
  socket.on("timeout", () => socket.destroy(new Error("SMTP connection timed out.")));

  const read = createResponseReader(socket);

  try {
    await read([220]);

    await write(socket, `EHLO promptbeats.app\r\n`);
    await read([250]);

    await write(socket, "AUTH LOGIN\r\n");
    await read([334]);
    await write(socket, `${Buffer.from(config.username, "utf8").toString("base64")}\r\n`);
    await read([334]);
    await write(socket, `${Buffer.from(config.password, "utf8").toString("base64")}\r\n`);
    await read([235]);

    await write(socket, `MAIL FROM:<${config.fromEmail}>\r\n`);
    await read([250]);

    await write(socket, `RCPT TO:<${payload.to}>\r\n`);
    await read([250, 251]);

    await write(socket, "DATA\r\n");
    await read([354]);

    await write(socket, `${buildMessage(config, payload)}\r\n.\r\n`);
    await read([250]);

    await write(socket, "QUIT\r\n");
    await read([221]);
  } finally {
    socket.destroy();
  }

  return { sent: true };
}
