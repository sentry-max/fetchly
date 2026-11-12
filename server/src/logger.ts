export type LogLevel = "debug" | "info" | "warn" | "error";

type LogContext = Record<string, unknown>;

const levelWeight: Record<LogLevel, number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
};

function isLogLevel(value: string | undefined): value is LogLevel {
  return value !== undefined && value in levelWeight;
}

function serializeValue(value: unknown): unknown {
  if (value instanceof Error) {
    return { name: value.name, message: value.message, stack: value.stack };
  }
  return value;
}

function formatReadable(level: LogLevel, message: string, context: LogContext): string {
  const time = new Date().toISOString().slice(11, 19);
  const details = Object.entries(context)
    .map(([key, value]) => {
      const serialized = serializeValue(value);
      return `${key}=${typeof serialized === "string" ? serialized : JSON.stringify(serialized)}`;
    })
    .join(" ");
  return `${time} ${level.toUpperCase().padEnd(5)} ${message}${details ? ` ${details}` : ""}`;
}

export class Logger {
  private readonly minimumWeight: number;
  private readonly readable: boolean;

  constructor(minimumLevel: LogLevel, readable: boolean) {
    this.minimumWeight = levelWeight[minimumLevel];
    this.readable = readable;
  }

  debug(message: string, context: LogContext = {}): void {
    this.write("debug", message, context);
  }

  info(message: string, context: LogContext = {}): void {
    this.write("info", message, context);
  }

  warn(message: string, context: LogContext = {}): void {
    this.write("warn", message, context);
  }

  error(message: string, context: LogContext = {}): void {
    this.write("error", message, context);
  }

  private write(level: LogLevel, message: string, context: LogContext): void {
    if (levelWeight[level] < this.minimumWeight) {
      return;
    }

    const output = this.readable
      ? formatReadable(level, message, context)
      : JSON.stringify({
          time: new Date().toISOString(),
          level,
          message,
          ...Object.fromEntries(Object.entries(context).map(([key, value]) => [key, serializeValue(value)])),
        });

    if (levelWeight[level] >= levelWeight.warn) {
      process.stderr.write(`${output}\n`);
    } else {
      process.stdout.write(`${output}\n`);
    }
  }
}

const configuredLevel = process.env.LOG_LEVEL?.toLowerCase();

export const logger = new Logger(isLogLevel(configuredLevel) ? configuredLevel : "info", process.stdout.isTTY === true);
