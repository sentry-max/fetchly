import { useId, useRef, useState, type ClipboardEvent, type FormEvent } from "react";
import { useI18n } from "../i18n/I18nProvider";
import { looksLikeYoutubeLink } from "../utils/youtube";
import { Icon, Spinner } from "./Icon";
import styles from "./UrlForm.module.css";

interface UrlFormProps {
  isSubmitting: boolean;
  isLocked: boolean;
  onSubmit: (url: string) => void;
}

const canReadClipboard = typeof navigator !== "undefined" && typeof navigator.clipboard?.readText === "function";

export function UrlForm({ isSubmitting, isLocked, onSubmit }: UrlFormProps) {
  const { messages } = useI18n();
  const [value, setValue] = useState("");
  const [validationMessage, setValidationMessage] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const inputId = useId();
  const hintId = useId();
  const errorId = useId();
  const disabled = isSubmitting || isLocked;

  const submit = (candidate: string) => {
    const trimmed = candidate.trim();
    if (!trimmed) {
      setValidationMessage(messages.urlForm.emptyError);
      inputRef.current?.focus();
      return;
    }
    setValidationMessage(null);
    onSubmit(trimmed);
  };

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    submit(value);
  };

  const handlePaste = (event: ClipboardEvent<HTMLInputElement>) => {
    const pasted = event.clipboardData.getData("text").trim();
    if (pasted && looksLikeYoutubeLink(pasted) && !disabled) {
      event.preventDefault();
      setValue(pasted);
      submit(pasted);
    }
  };

  const pasteFromClipboard = async () => {
    try {
      const text = (await navigator.clipboard.readText()).trim();
      if (!text) return;
      setValue(text);
      if (looksLikeYoutubeLink(text)) {
        submit(text);
      } else {
        inputRef.current?.focus();
      }
    } catch {
      inputRef.current?.focus();
    }
  };

  return (
    <form className={styles.form} onSubmit={handleSubmit} noValidate>
      <label htmlFor={inputId} className={styles.label}>
        {messages.urlForm.label}
      </label>

      <div className={styles.row}>
        <div className={styles.field} data-invalid={validationMessage ? "true" : undefined}>
          <Icon name="link" className={styles.fieldIcon} />
          <input
            ref={inputRef}
            id={inputId}
            className={styles.input}
            type="url"
            inputMode="url"
            dir="ltr"
            autoComplete="off"
            autoCorrect="off"
            autoCapitalize="none"
            spellCheck={false}
            placeholder={messages.urlForm.placeholder}
            value={value}
            disabled={disabled}
            aria-invalid={validationMessage ? true : undefined}
            aria-describedby={validationMessage ? errorId : hintId}
            onChange={(event) => {
              setValue(event.target.value);
              if (validationMessage) setValidationMessage(null);
            }}
            onPaste={handlePaste}
          />
          {canReadClipboard && !value && (
            <button type="button" className={styles.pasteButton} onClick={pasteFromClipboard} disabled={disabled}>
              <Icon name="clipboard" size={16} />
              <span>{messages.urlForm.paste}</span>
            </button>
          )}
        </div>

        <button type="submit" className="button button-primary" disabled={disabled}>
          {isSubmitting ? (
            <>
              <Spinner />
              <span>{messages.urlForm.submitting}</span>
            </>
          ) : (
            <span>{messages.urlForm.submit}</span>
          )}
        </button>
      </div>

      {validationMessage ? (
        <p id={errorId} className={styles.error} role="alert">
          {validationMessage}
        </p>
      ) : (
        <p id={hintId} className={styles.hint}>
          {messages.urlForm.hint}
        </p>
      )}
    </form>
  );
}
