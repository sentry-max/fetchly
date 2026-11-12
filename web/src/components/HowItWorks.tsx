import { useI18n } from "../i18n/I18nProvider";
import { formatInteger } from "../utils/format";
import styles from "./HowItWorks.module.css";

export function HowItWorks() {
  const { messages, locale } = useI18n();

  return (
    <section className={styles.section} aria-labelledby="how-it-works-title">
      <h2 id="how-it-works-title" className={styles.title}>
        {messages.howItWorks.title}
      </h2>
      <ol className={styles.steps}>
        {messages.howItWorks.steps.map((step, index) => (
          <li key={step.title} className={styles.step}>
            <span className={styles.number} aria-hidden="true">
              {formatInteger(index + 1, locale)}
            </span>
            <div>
              <h3 className={styles.stepTitle}>{step.title}</h3>
              <p className={styles.stepDescription}>{step.description}</p>
            </div>
          </li>
        ))}
      </ol>
    </section>
  );
}
