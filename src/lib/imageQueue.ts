import sharp from "sharp";

/**
 * sharp 작업 동시성 제한.
 *
 * 이 제한은 "프로세스 단위"다. Railway 인스턴스를 2개 이상 띄우면 각 인스턴스가
 * 독립적으로 아래 제한을 적용하므로 전체 동시 처리량은 인스턴스 수만큼 늘어난다.
 * 실제 상한을 조정할 때는 인스턴스 수까지 함께 고려해야 한다.
 *
 * 기본값 근거:
 *  - 60MP 이미지를 디코딩하면 RGB 원본만 약 180MB가 잡힌다.
 *  - 동시 2건이면 순간 피크가 약 400MB로, 512MB~1GB 컨테이너에서도 견딜 수 있다.
 *  - libvips 스레드까지 곱해지지 않도록 sharp.concurrency도 함께 제한한다.
 * 컨테이너 스펙을 올렸다면 환경변수로 조정한다.
 */
const CONCURRENCY = positiveInt(process.env.IMAGE_RESIZE_CONCURRENCY, 2);
const QUEUE_LIMIT = positiveInt(process.env.IMAGE_RESIZE_QUEUE_LIMIT, 20);
const QUEUE_TIMEOUT_MS = positiveInt(process.env.IMAGE_RESIZE_QUEUE_TIMEOUT_MS, 5_000);
const JOB_TIMEOUT_MS = positiveInt(process.env.IMAGE_RESIZE_JOB_TIMEOUT_MS, 10_000);
const SHARP_THREADS = positiveInt(process.env.IMAGE_SHARP_CONCURRENCY, 1);

function positiveInt(raw: string | undefined, fallback: number): number {
  const n = Number(raw);
  return Number.isInteger(n) && n > 0 ? n : fallback;
}

// libvips가 CPU 코어 수만큼 스레드를 띄우는 기본 동작을 막는다.
// 위 CONCURRENCY와 곱해져 스레드가 폭증하는 것을 방지하기 위한 설정이다.
sharp.concurrency(SHARP_THREADS);

/** 대기열이 가득 참 (→ 503) */
export class QueueOverflowError extends Error {
  constructor() {
    super("Image processing queue is full");
    this.name = "QueueOverflowError";
  }
}

/** 대기 또는 처리 시간 초과 (→ 503) */
export class ImageTimeoutError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ImageTimeoutError";
  }
}

type Waiter = {
  resolve: () => void;
  reject: (err: Error) => void;
  timer: NodeJS.Timeout;
};

let active = 0;
const waiting: Waiter[] = [];

function acquire(): Promise<void> {
  if (active < CONCURRENCY) {
    active++;
    return Promise.resolve();
  }
  if (waiting.length >= QUEUE_LIMIT) {
    return Promise.reject(new QueueOverflowError());
  }
  return new Promise<void>((resolve, reject) => {
    const waiter: Waiter = {
      resolve,
      reject,
      timer: setTimeout(() => {
        const idx = waiting.indexOf(waiter);
        if (idx >= 0) waiting.splice(idx, 1);
        reject(new ImageTimeoutError("Timed out waiting for an image worker"));
      }, QUEUE_TIMEOUT_MS),
    };
    waiting.push(waiter);
  });
}

function release(): void {
  const next = waiting.shift();
  if (next) {
    clearTimeout(next.timer);
    next.resolve();
    return;
  }
  active--;
}

/**
 * sharp 처리를 동시성 제한과 타임아웃 아래에서 실행한다.
 * 타임아웃이 나도 진행 중인 sharp 작업 자체는 중단할 수 없으므로,
 * 슬롯은 실제 작업이 끝난 뒤에 반납한다(슬롯 초과 점유 방지).
 */
export async function runImageJob<T>(job: () => Promise<T>): Promise<T> {
  await acquire();

  let settled = false;
  const running = job().finally(() => {
    settled = true;
    release();
  });

  const timeout = new Promise<never>((_, reject) => {
    const timer = setTimeout(() => {
      if (!settled) reject(new ImageTimeoutError("Image processing timed out"));
    }, JOB_TIMEOUT_MS);
    // 작업이 먼저 끝나면 타이머가 이벤트 루프를 붙잡지 않도록 정리한다.
    void running.catch(() => undefined).finally(() => clearTimeout(timer));
  });

  return Promise.race([running, timeout]);
}

export const imageQueueLimits = {
  concurrency: CONCURRENCY,
  queueLimit: QUEUE_LIMIT,
  queueTimeoutMs: QUEUE_TIMEOUT_MS,
  jobTimeoutMs: JOB_TIMEOUT_MS,
  sharpThreads: SHARP_THREADS,
};
