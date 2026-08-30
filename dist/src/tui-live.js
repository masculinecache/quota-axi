/**
 * Live loop for the human terminal report: paint a frame, then repaint on a
 * fixed refresh interval until the operator quits with `q` or Ctrl+C. Every
 * terminal effect is injected so the loop is exercised without a real TTY, and
 * the alternate screen, cursor, and raw mode are always restored - including
 * when a refresh throws. This is presentation only; it derives nothing new.
 */
const ENTER_SCREEN = "\x1b[?1049h\x1b[?25l";
const LEAVE_SCREEN = "\x1b[?25h\x1b[?1049l";
const CLEAR_SCREEN = "\x1b[H\x1b[2J";
/** `q`, plus Ctrl+C and Ctrl+D, which raw mode delivers as data, not signals. */
// eslint-disable-next-line no-control-regex
const QUIT_KEY_PATTERN = /[qQ\x03\x04]/;
/**
 * Run the live report until the operator quits, and return the last snapshot
 * that was painted so the caller can echo a final frame on the normal screen.
 */
export async function runLiveTui({ load, render, intervalMillis, io, }) {
    let quit = false;
    let wake;
    // Resize bursts coalesce: every wake-up repaints at the current terminal
    // width, so an event that lands with no waiter armed is already covered by
    // the next paint rather than needing its own frame.
    const notify = (reason) => {
        const pending = wake;
        wake = undefined;
        pending?.(reason);
    };
    const requestQuit = () => {
        quit = true;
        notify("quit");
    };
    const onData = (chunk) => {
        const text = typeof chunk === "string" ? chunk : chunk.toString("utf8");
        if (QUIT_KEY_PATTERN.test(text))
            requestQuit();
    };
    const stopResize = io.onResize?.(() => {
        notify("resize");
    });
    const stopSignal = io.onSignal?.(requestQuit);
    io.stdin.on("data", onData);
    io.stdin.setRawMode?.(true);
    io.stdin.resume?.();
    io.stdout.write(ENTER_SCREEN);
    let value;
    try {
        while (!quit) {
            if (value === undefined)
                io.stdout.write(`${CLEAR_SCREEN}\n  loading…\n`);
            value = await load();
            if (quit)
                break;
            const snapshot = value;
            const paint = () => {
                io.stdout.write(`${CLEAR_SCREEN}${render(snapshot)}\n`);
            };
            paint();
            let ticked = false;
            const handle = io.setTimer(() => {
                ticked = true;
                notify("tick");
            }, intervalMillis);
            try {
                while (!quit && !ticked) {
                    const reason = await new Promise((resolve) => {
                        wake = resolve;
                    });
                    if (reason !== "resize")
                        break;
                    paint();
                }
            }
            finally {
                wake = undefined;
                io.clearTimer(handle);
            }
        }
    }
    finally {
        io.stdout.write(LEAVE_SCREEN);
        io.stdin.off("data", onData);
        io.stdin.setRawMode?.(false);
        io.stdin.pause?.();
        stopResize?.();
        stopSignal?.();
    }
    return value;
}
/** Render a whole-unit refresh interval as "45s", "5m", or "2h". */
export function formatInterval(seconds) {
    if (seconds % 3600 === 0)
        return `${seconds / 3600}h`;
    if (seconds % 60 === 0)
        return `${seconds / 60}m`;
    return `${seconds}s`;
}
//# sourceMappingURL=tui-live.js.map