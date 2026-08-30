/**
 * Live loop for the human terminal report: paint a frame, then repaint on a
 * fixed refresh interval until the operator quits with `q` or Ctrl+C. Every
 * terminal effect is injected so the loop is exercised without a real TTY, and
 * the alternate screen, cursor, and raw mode are always restored - including
 * when a refresh throws. This is presentation only; it derives nothing new.
 */
export type LiveTuiWriter = {
    write(chunk: string): unknown;
};
export type LiveTuiInput = {
    setRawMode?(mode: boolean): unknown;
    resume?(): unknown;
    pause?(): unknown;
    on(event: "data", listener: (chunk: Buffer | string) => void): unknown;
    off(event: "data", listener: (chunk: Buffer | string) => void): unknown;
};
export type LiveTuiIo = {
    stdout: LiveTuiWriter;
    stdin: LiveTuiInput;
    setTimer(callback: () => void, milliseconds: number): unknown;
    clearTimer(handle: unknown): void;
    /** Subscribe to terminal resize; returns the unsubscribe function. */
    onResize?(listener: () => void): () => void;
    /** Subscribe to termination signals; returns the unsubscribe function. */
    onSignal?(listener: () => void): () => void;
};
export type LiveTuiOptions<T> = {
    /** Refresh the report. Bounded by the caller, not by this loop. */
    load(): Promise<T>;
    /** Render the current snapshot at the current terminal width. */
    render(value: T): string;
    intervalMillis: number;
    io: LiveTuiIo;
};
/**
 * Run the live report until the operator quits, and return the last snapshot
 * that was painted so the caller can echo a final frame on the normal screen.
 */
export declare function runLiveTui<T>({ load, render, intervalMillis, io, }: LiveTuiOptions<T>): Promise<T | undefined>;
/** Render a whole-unit refresh interval as "45s", "5m", or "2h". */
export declare function formatInterval(seconds: number): string;
