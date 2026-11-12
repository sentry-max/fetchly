import { appName } from "../config";
import { useI18n } from "../i18n/I18nProvider";
import type { Language } from "../i18n/messages";
import styles from "./Header.module.css";

const languageOptions: Array<{ value: Language; label: string; name: string }> = [
  { value: "en", label: "EN", name: "English" },
  { value: "fa", label: "فا", name: "فارسی" },
];

export function Header() {
  const { language, setLanguage, messages } = useI18n();

  return (
    <header className={styles.header}>
      <div className={`container ${styles.inner}`}>
        <a href="/" className={styles.brand} aria-label={appName}>
          <svg className={styles.logo} viewBox="0 0 32 32" aria-hidden="true">
            <rect width="32" height="32" rx="7" />
            <path d="M16 8v11m0 0-4.5-4.5M16 19l4.5-4.5M10 23.5h12" />
          </svg>
          <span className={styles.wordmark}>{appName}</span>
        </a>

        <div className={styles.languageSwitch} role="group" aria-label={messages.header.languageLabel}>
          {languageOptions.map((option) => (
            <button
              key={option.value}
              type="button"
              lang={option.value}
              className={styles.languageButton}
              aria-pressed={language === option.value}
              title={option.name}
              onClick={() => setLanguage(option.value)}
            >
              {option.label}
            </button>
          ))}
        </div>
      </div>
    </header>
  );
}
