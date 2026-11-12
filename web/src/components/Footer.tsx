import { appName } from "../config";
import { useI18n } from "../i18n/I18nProvider";
import styles from "./Footer.module.css";

export function Footer() {
  const { messages, locale } = useI18n();
  const year = new Intl.DateTimeFormat(locale, { year: "numeric" }).format(new Date());

  return (
    <footer className={styles.footer}>
      <div className={`container ${styles.inner}`}>
        <p className={styles.copyright}>
          © {year} {appName}
        </p>
        <p className={styles.notice}>
          {messages.footer.notice} {messages.footer.disclaimer}
        </p>
      </div>
    </footer>
  );
}
