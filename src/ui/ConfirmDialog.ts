/** A single line of the dialog body. Plain text only — never markup. */
export interface ConfirmLine {
  label: string;
  value: string;
  /** Renders in the warning colour, for anything the player stands to lose. */
  warn?: boolean;
}

export interface ConfirmOptions {
  title: string;
  message: string;
  lines?: ConfirmLine[];
  confirmLabel: string;
  cancelLabel?: string;
  danger?: boolean;
  onConfirm: () => void;
  onCancel?: () => void;
}

/**
 * The blocking yes/no card used for anything irreversible.
 *
 * Demolition goes through here rather than a single keypress because the plot
 * is freed and the refund is fixed at 50% — a mis-click would be expensive and
 * cannot be undone.
 */
export class ConfirmDialog {
  private options: ConfirmOptions | null = null;

  constructor(
    private readonly host: HTMLElement,
    private readonly body: HTMLElement,
  ) {}

  get isOpen(): boolean {
    return this.options !== null;
  }

  open(options: ConfirmOptions): void {
    this.options = options;
    const rows = (options.lines ?? [])
      .map(
        (line) =>
          `<div class="confirm-row${line.warn ? " warn" : ""}"><span></span><b></b></div>`,
      )
      .join("");
    this.body.innerHTML = `
      <div class="confirm-title"></div>
      <div class="confirm-message"></div>
      <div class="confirm-lines">${rows}</div>
      <div class="confirm-buttons">
        <button class="big-btn tight ${options.danger ? "danger" : ""}" data-yes="1"></button>
        <button class="big-btn tight ghost" data-no="1"></button>
      </div>`;

    // Text is written as text, so nothing a caller passes can become markup.
    setText(this.body, ".confirm-title", options.title);
    setText(this.body, ".confirm-message", options.message);
    const rowEls = this.body.querySelectorAll<HTMLElement>(".confirm-row");
    (options.lines ?? []).forEach((line, i) => {
      const el = rowEls[i];
      if (!el) return;
      const label = el.querySelector("span");
      const value = el.querySelector("b");
      if (label) label.textContent = line.label;
      if (value) value.textContent = line.value;
    });
    setText(this.body, "[data-yes]", options.confirmLabel);
    setText(this.body, "[data-no]", options.cancelLabel ?? "取消");

    this.body.querySelector("[data-yes]")?.addEventListener("click", () => {
      const confirm = this.options?.onConfirm;
      this.close();
      confirm?.();
    });
    this.body.querySelector("[data-no]")?.addEventListener("click", () => this.cancel());
    this.host.classList.add("show");
  }

  cancel(): void {
    const cancel = this.options?.onCancel;
    this.close();
    cancel?.();
  }

  close(): void {
    this.options = null;
    this.host.classList.remove("show");
    this.body.innerHTML = "";
  }
}

function setText(root: HTMLElement, selector: string, text: string): void {
  const el = root.querySelector(selector);
  if (el) el.textContent = text;
}
